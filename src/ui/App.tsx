/**
 * P029 TableFork — 双表同文交互工作台（P029-T009）
 *
 * 项目书 §4 全章：顶栏、预设、输入、策略、比较、并排双表 + 中央 Markdown、
 * 两件事分开的状态栏、逐格交接稿 / 证据 JSON 标签页、复制 / 下载 / 清空。
 *
 * 状态机（§4.2）：EMPTY → READY → ANALYZING → CERTIFIED_COLLISION /
 * NO_WITNESS_FOUND / UNSUPPORTED / INVALID_INPUT；MISMATCH（M≠F(A)）作为
 * 对账维度的独立提示与首个不同字节定位，与见证状态并列显示。
 *
 * 取消守卫（§6.2 jobId 合同）：每次分析发新 jobId（递增序列号）；取消或
 * 发起新分析时序列号递增，在途任务的结果到达时若 jobId 已不是最新则丢弃，
 * 永不覆盖新输入。P029-T013：分析改走全项目唯一的 Worker
 * （src/worker/tablefork.worker.ts，`new Worker(new URL(...))`），主线程
 * 只发 ANALYZE / CANCEL 消息并采纳最新 jobId 的 RESULT / ERROR；
 * analyze() 不再由主线程调用——此前主线程同步调 analyze() 使 React
 * 批量合并 setState、ANALYZING 状态（取消按钮）永不绘制（ISSUE-T012-2），
 * Worker 的 macrotask 让步使取消按钮在真实浏览器里可达，见
 * artifacts/logs/T013-release.txt 的重测记录。A/B 网格仍在主线程由
 * parse+grid 只读重算（与 analyze 内部同一口径，无见证搜索重复实现）。
 *
 * 本地-only：不写 localStorage / IndexedDB；清空内存同时清内存状态与 DOM 显示。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { compareMarkdown, type FirstDiff } from '../core/compare';
import { buildGrid, type GridResult } from '../core/grid';
import {
  INPUT_SCHEMA,
  isTableForkError,
  isWorkerResponseMessage,
  MAX_INPUT_BYTES,
  type AnalyzeResult,
  type CollisionKind,
  type Strategy,
} from '../core/index';
import { parseValidatedTable } from '../core/parse';
import { collisionKindOf, findWitness } from '../core/witness';
import { DualTableView, type SlotRef } from './DualTableView';
import { ExportPanel } from './ExportPanel';
import { InputPanel } from './InputPanel';
import { ProofPanel } from './ProofPanel';
import { presetById, type Preset } from './presets';

type UiPhase =
  | 'EMPTY'
  | 'READY'
  | 'ANALYZING'
  | 'CERTIFIED_COLLISION'
  | 'NO_WITNESS_FOUND'
  | 'UNSUPPORTED'
  | 'INVALID_INPUT';

/** 直接调用 analyze() 后的 UI 本地结果：AnalyzeResult + 渲染用的 A/B 网格。 */
interface AnalysisOutcome {
  result: AnalyzeResult;
  gridA: GridResult;
  /** 仅 CERTIFIED_COLLISION 时存在（由 proof.alternativeHtml 重解析得到）。 */
  gridB?: GridResult;
  /** CERTIFIED_COLLISION 时的种类标签；否则 undefined。 */
  kind?: CollisionKind;
  /** NO_WITNESS_FOUND 时的理由（取自 findWitness 的同一调用结果）；否则 undefined。 */
  reason?: string;
}

export function App(): React.JSX.Element {
  const [html, setHtml] = useState<string>('');
  const [markdown, setMarkdown] = useState<string>('');
  const [strategy, setStrategy] = useState<Strategy>('ORIGIN_EMPTY');
  const [presetId, setPresetId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<AnalysisOutcome | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotRef | null>(null);
  const [jobId, setJobId] = useState<string>('');

  // jobId/版本号守卫：序列号即 jobId 的数字部分；只有最新 job 的结果会被采纳。
  const jobSeqRef = useRef(0);

  /** Worker 发回的 jobId（`job-<seq>`）还原为序列号；格式不对返回 null。 */
  const jobSeqFromId = (jobIdValue: string): number | null => {
    const match = /^job-(\d+)$/.exec(jobIdValue);
    return match === null ? null : Number(match[1]);
  };

  /** 在途分析的输入快照：Worker 回 RESULT/ERROR 时用它重算 A/B 网格。 */
  interface PendingAnalysis {
    seq: number;
    html: string;
    markdown: string;
    strategy: Strategy;
  }
  const pendingRef = useRef<PendingAnalysis | null>(null);

  /** 当前输入的镜像（每轮提交后同步）：Worker 回调用它做快照比对（b）。 */
  const inputsRef = useRef({ html, markdown, strategy });
  useEffect(() => {
    inputsRef.current = { html, markdown, strategy };
  });

  /** 全项目唯一的 Worker（src/worker/tablefork.worker.ts，T010 产出）。 */
  const workerRef = useRef<Worker | null>(null);

  // T013：创建 Worker 并挂 onmessage。主线程只采纳 jobId 与最新序列号
  // 一致的 RESULT / ERROR；取消或新分析使序列号递增后，旧回复一律丢弃。
  // FIX-01：输入变化时 invalidateInFlight() 同样使序列号递增并清 pending，
  // 回调另比任务快照与当前输入是否一致（纵深防御），旧结果永不显示、永不导出。
  // Worker 创建失败（fail-closed）：报错并保持未分析状态，绝不悄悄
  // 回落到主线程同步调 analyze()（那正是 ISSUE-T012-2 的根因）。
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('../worker/tablefork.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch (err) {
      setError({
        code: 'INVALID_RAGGED_GRID',
        message: `Worker 启动失败：${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<unknown>): void => {
      const message: unknown = event.data;
      if (!isWorkerResponseMessage(message)) return;
      const seq = jobSeqFromId(message.jobId);
      if (seq === null || seq !== jobSeqRef.current) return;
      const pending = pendingRef.current;
      if (pending === null || pending.seq !== seq) return;
      // FIX-01 (b) 纵深防御：任务快照必须仍等于当前输入。输入变化本应
      // 经 invalidateInFlight() 使旧任务失效（见下）；若某条变化路径
      // 漏过失效，在这里也被拦下——旧结果永不进入 outcome，且分析
      // 状态回到 READY（这条回复是该旧任务的唯一回复，丢弃后不再有
      // 后续消息能把 analyzing 清掉，必须在这里清）。
      if (
        pending.html !== inputsRef.current.html ||
        pending.markdown !== inputsRef.current.markdown ||
        pending.strategy !== inputsRef.current.strategy
      ) {
        pendingRef.current = null;
        setAnalyzing(false);
        setJobId('');
        return;
      }
      pendingRef.current = null;
      if (message.type === 'RESULT') {
        const result = message.data;
        try {
          // A/B 网格只读复用核心模块：gridA 由输入重算；gridB 由
          // proof.alternativeHtml 重解析得到（与 analyze 内部同一口径）。
          const gridA = buildGrid(parseValidatedTable(pending.html));
          const next: AnalysisOutcome = { result, gridA };
          if (result.proof !== undefined) {
            next.gridB = buildGrid(parseValidatedTable(result.proof.alternativeHtml));
            next.kind = collisionKindOf(result.proof.headerAssociationChanged);
          } else if (result.witness === 'NO_WITNESS_FOUND') {
            // reason 不在 AnalyzeResult 的冻结字段里；直接复用核心
            // findWitness 的同一返回值（不重复实现搜索逻辑）。analyze()
            // 内部已调过一次，此处只在无见证时为取 reason 再调一次。
            next.reason = findWitness(pending.html, pending.strategy).reason;
          }
          setOutcome(next);
        } catch (err) {
          if (isTableForkError(err)) {
            setError({ code: err.code, message: err.message });
          } else {
            setError({
              code: 'INVALID_RAGGED_GRID',
              message: `分析失败：${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }
      } else {
        setError({ code: message.code, message: message.message });
      }
      setAnalyzing(false);
    };
    worker.onerror = (): void => {
      if (pendingRef.current === null) return;
      pendingRef.current = null;
      setAnalyzing(false);
      setError({
        code: 'INVALID_RAGGED_GRID',
        message: 'Worker 运行失败：分析未完成，请重试。',
      });
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const phase: UiPhase = analyzing
    ? 'ANALYZING'
    : error !== null
      ? error.code === 'UNSUPPORTED_NESTED_TABLE' ||
          error.code === 'UNSUPPORTED_HEADER_SEMANTICS'
        ? 'UNSUPPORTED'
        : 'INVALID_INPUT'
      : outcome !== null
        ? outcome.result.witness
        : html.trim() === ''
          ? 'EMPTY'
          : 'READY';

  /**
   * FIX-01 (a) 输入变化使在途任务失效：清 pendingRef、向 Worker 发
   * CANCEL（Worker 侧 generation 守卫使已入队未执行的旧任务不产生回复）、
   * 递增 jobSeqRef（使万一漏网的旧 RESULT/ERROR 在回调的 seq 比对中
   * 被丢弃），并把 analyzing 清掉、回到 READY。无在途任务时是 no-op
   * （不碰序列号）。与 cancelAnalysis / clearAll 的取消逻辑一致。
   * 所有输入变化路径（HTML、Markdown、策略、预设、F(A) 填入）都经
   * resetResult() 走这里；Worker 侧无需改动。
   */
  const invalidateInFlight = (): void => {
    const pending = pendingRef.current;
    if (pending === null) return;
    const worker = workerRef.current;
    if (worker !== null) {
      worker.postMessage({ jobId: `job-${pending.seq}`, type: 'CANCEL' });
    }
    pendingRef.current = null;
    jobSeqRef.current += 1;
    setAnalyzing(false);
    setJobId('');
  };

  /** 输入变化后旧结果失效：先使在途任务失效，再清掉结果与错误，回到 READY/EMPTY（比较前仍允许修改）。 */
  const resetResult = (): void => {
    invalidateInFlight();
    setOutcome(null);
    setError(null);
    setSelectedSlot(null);
  };

  const onHtmlChange = (value: string): void => {
    setHtml(value);
    setPresetId((current) => {
      // 手动改动 HTML 即脱离预设（预设按钮仍可随时重新选中）。
      const preset = current !== null ? presetById(current) : undefined;
      return preset !== undefined && preset.html === value ? current : null;
    });
    resetResult();
  };

  const onMarkdownChange = (value: string): void => {
    setMarkdown(value);
    resetResult();
  };

  const onStrategyChange = (value: Strategy): void => {
    setStrategy(value);
    resetResult();
  };

  const onSelectPreset = (preset: Preset): void => {
    setPresetId(preset.id);
    setHtml(preset.html);
    resetResult();
  };

  const htmlBytes = new TextEncoder().encode(html).length;
  const compareDisabled = html.trim() === '' || htmlBytes > MAX_INPUT_BYTES;
  const compareDisabledReason =
    html.trim() === ''
      ? '请先选择预设或粘贴 HTML。'
      : htmlBytes > MAX_INPUT_BYTES
        ? `HTML 为 ${htmlBytes} UTF-8 字节，超过 ${MAX_INPUT_BYTES} 字节上限。`
        : null;

  /** 结构预检提示：试算 parse+grid，只作输入提示，不作最终判定。 */
  const validation = useMemo((): { hint: string; isError: boolean } => {
    if (html.trim() === '') return { hint: '尚未输入源表。', isError: false };
    try {
      const grid = buildGrid(parseValidatedTable(html));
      return {
        hint: `源表结构有效：${grid.rows} 行 × ${grid.cols} 列，${grid.cells.length} 个 DOM 单元格。`,
        isError: false,
      };
    } catch (err) {
      if (isTableForkError(err)) {
        return { hint: `结构检查：${err.code}——${err.message}`, isError: true };
      }
      return { hint: `结构检查失败：${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  }, [html]);

  /** 经 Worker 分析：主线程只发消息，绝不同步调 analyze()（见文件头）。 */
  const runAnalysis = (): void => {
    const worker = workerRef.current;
    if (worker === null) {
      setError({
        code: 'INVALID_RAGGED_GRID',
        message: 'Worker 未就绪（页面刚加载或 Worker 启动失败），请稍候再试。',
      });
      return;
    }
    const seq = jobSeqRef.current + 1;
    jobSeqRef.current = seq;
    const currentJobId = `job-${seq}`;
    setJobId(currentJobId);
    setAnalyzing(true);
    setOutcome(null);
    setError(null);
    setSelectedSlot(null);
    pendingRef.current = { seq, html, markdown, strategy };
    worker.postMessage({
      jobId: currentJobId,
      type: 'ANALYZE',
      payload: {
        schema: INPUT_SCHEMA,
        html,
        suppliedMarkdown: markdown === '' ? undefined : markdown,
        strategy,
      },
    });
  };

  const cancelAnalysis = (): void => {
    // 取消 = 向 Worker 发 CANCEL（Worker 侧同步登记，见证不再产生回复），
    // 再把序列号递增使万一漏网的在途回复也被丢弃；状态回到 READY。
    const worker = workerRef.current;
    if (worker !== null && jobSeqRef.current > 0) {
      worker.postMessage({ jobId: `job-${jobSeqRef.current}`, type: 'CANCEL' });
    }
    pendingRef.current = null;
    jobSeqRef.current += 1;
    setAnalyzing(false);
    setJobId('');
  };

  const clearAll = (): void => {
    // 清空内存：先取消在途任务（同 cancelAnalysis），再清内存状态与 DOM
    // 显示；不留 Blob 引用。
    const worker = workerRef.current;
    if (worker !== null && jobSeqRef.current > 0) {
      worker.postMessage({ jobId: `job-${jobSeqRef.current}`, type: 'CANCEL' });
    }
    pendingRef.current = null;
    jobSeqRef.current += 1;
    setHtml('');
    setMarkdown('');
    setStrategy('ORIGIN_EMPTY');
    setPresetId(null);
    setOutcome(null);
    setError(null);
    setSelectedSlot(null);
    setAnalyzing(false);
    setJobId('');
  };

  /** MISMATCH 时的首个不同字节定位（compare.ts 的严格字节比较，不做 normalization）。 */
  const firstDiff: FirstDiff | undefined = useMemo(() => {
    if (outcome === null || outcome.result.compare !== 'EXACT_DIFF') return undefined;
    try {
      const compared = compareMarkdown(markdown, outcome.result.canonicalMarkdown);
      return compared.firstDiff;
    } catch {
      return undefined;
    }
  }, [outcome, markdown]);

  const result = outcome?.result ?? null;

  return (
    <div className="tf-app">
      <header className="tf-topbar">
        <h1>表歧镜</h1>
        <span className="tf-sub">离线·只读·不连接 AI</span>
        <span className="tf-sub">规格 v1.0.2 · tablefork.report/v1</span>
      </header>

      {phase === 'EMPTY' && (
        <div className="tf-privacy">
          <p>
            <strong>隐私声明：</strong>
            本工具完全离线运行；输入只留在当前页面内存中，不上传、不保存到
            localStorage / IndexedDB、不连接任何 AI；点击“清空内存”即可删除全部输入与结果。
          </p>
          <p>请选择一个合成预设开始，或粘贴 / 打开本地 HTML 表格。</p>
        </div>
      )}

      <InputPanel
        html={html}
        onHtmlChange={onHtmlChange}
        markdown={markdown}
        onMarkdownChange={onMarkdownChange}
        strategy={strategy}
        onStrategyChange={onStrategyChange}
        presetId={presetId}
        onSelectPreset={onSelectPreset}
        analyzing={analyzing}
        compareDisabled={compareDisabled || analyzing}
        compareDisabledReason={compareDisabledReason}
        onCompare={() => void runAnalysis()}
        onCancel={cancelAnalysis}
        canFillCanonical={result !== null}
        onFillCanonical={() => {
          if (result !== null) {
            setMarkdown(result.canonicalMarkdown);
            resetResult();
          }
        }}
        validationHint={validation.hint}
        validationIsError={validation.isError}
      />

      {analyzing && (
        <p className="tf-hint" role="status">
          正在分析（{jobId}，Worker 线程；取消后旧结果不会覆盖新输入）…
        </p>
      )}

      {result !== null && outcome !== null && (
        <DualTableView
          result={result}
          gridA={outcome.gridA}
          gridB={outcome.gridB}
          sourceCellId={result.proof?.sourceCellId}
          selectedSlot={selectedSlot}
          onSelectSlot={setSelectedSlot}
        />
      )}

      {(result !== null || error !== null) && (
        <ProofPanel
          result={result}
          error={error}
          kind={outcome?.kind}
          reason={outcome?.reason}
          firstDiff={firstDiff}
        />
      )}

      <ExportPanel
        result={result}
        presetId={presetId}
        strategy={strategy}
        onClear={clearAll}
      />

      <footer className="tf-section">
        <p className="tf-hint">
          TableFork 只证明支持的结构表示发生的信息损失，不证明 AI 阅读效果、数据真实性或
          行业规范合规；未找到碰撞绝不等于“表格保真”。
        </p>
      </footer>
    </div>
  );
}

# REVIEW_PACK_02 — UI / Worker / IO / CLI（src/ui、src/worker、src/io、src/main、cli）

> P029 TableFork 终审源码分卷（规格 v1.0.2）。本卷全文展开以下 15 个文件，
> 不省略、不摘要。每块格式：`### <路径>` + `SHA-256` / `Bytes` / `Lines` +
> ```` 围栏内完整原文（与 `review/RELEASE_MANIFEST.json` 中该文件的 SHA-256 一致）。
> 生成：P029-REFREEZE（`npm run verify:release` 核对每卷每块）。

### cli/analyze.ts
SHA-256: 720626eaf2afc170f00f94760db218d6db28d5124b3c8c81800738c551be6327
Bytes: 8094
Lines: 214

````ts
/**
 * P029 TableFork — Node 离线 CLI (P029-T010)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §6.2（Node 离线 CLI，
 * `npm run analyze -- --input fixtures/TFK-A.json --out output/report.json`，
 * 内部加载与 UI 同一个纯 TS 算法库）、IMPLEMENTATION_PLAN.md §4.2
 * （JSON 失败合同）、§4.3（fixture 字段合同）。
 *
 * 用法：
 *   npm run analyze -- --input fixtures/TFK-A.json --out artifacts/reports/TFK-A.json
 *   npm run analyze -- --help
 *
 * 行为：
 * - 读 fixture JSON（{ fixture_id, schema: 'tablefork.fixture/v1',
 *   input: { schema: 'tablefork.input/v1', html, strategy }, expected_ref }），
 *   调与浏览器 UI 同一个公共内核 analyze()，把 AnalyzeResult 写到 --out。
 * - 不存在的输出目录自动创建（mkdir -p）。
 * - 零网络：只做本地文件读写与本地计算。
 * - 本文件不在 tsconfig.json 的 include 里（T001 冻结：只含 src/、
 *   vite.config.ts、playwright.config.ts），故 `npm run typecheck` 不覆盖
 *   它；见 artifacts/logs/T010-worker-cli.txt §7 J-T010-5（留待 T013）。
 *
 * 退出码口径（钉死，见日志 §7 J-T010-3）：
 * - 0：成功，报告已写出。
 * - 1：表格被 analyze() 拒绝（TableForkError）：stderr 打印
 *   `ERROR <ErrorCode>: <message>`，不写输出文件。
 * - 2：CLI 层失败（参数缺失/未知参数、输入文件读不到、JSON 解析失败、
 *   fixture 结构不符）：stderr 打印 `ERROR CLI_USAGE: <message>`。
 * - --help：打印用法到 stdout，退出 0。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { analyze } from '../src/core/report';
import { isTableForkError } from '../src/core/types';

const USAGE = [
  'Usage: npm run analyze -- --input <fixture.json> --out <report.json>',
  '       npm run analyze -- --help',
  '',
  'Reads a tablefork.fixture/v1 fixture, runs the shared analyze() kernel',
  'from src/core/report.ts (the same kernel the browser UI uses), and writes',
  'the tablefork.report/v1 AnalyzeResult JSON to --out (creating parent',
  'directories as needed). Offline; no network access.',
  '',
  'Exit codes: 0 success; 1 table rejected by analyze() (stderr shows the',
  'ErrorCode enum value and message); 2 CLI usage / file / fixture error',
  '(stderr shows ERROR CLI_USAGE: ...).',
].join('\n');

interface CliOptions {
  input: string;
  out: string;
}

/** 解析 argv；--help 在此直接返回 null（由 main 打印用法后退出 0）。 */
function parseArgs(argv: string[]): CliOptions | null {
  let input: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return null;
    }
    if (arg === '--input' || arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`CLI_USAGE: ${arg} requires a value`);
      }
      if (arg === '--input') {
        input = value;
      } else {
        out = value;
      }
      i += 1;
      continue;
    }
    throw new Error(`CLI_USAGE: unknown argument ${JSON.stringify(arg)}`);
  }
  if (input === undefined) {
    throw new Error('CLI_USAGE: missing required --input <fixture.json>');
  }
  if (out === undefined) {
    throw new Error('CLI_USAGE: missing required --out <report.json>');
  }
  return { input, out };
}

/**
 * 校验 fixture 结构（只做形状校验，不猜字段语义）：
 * fixture_id 为字符串、schema 为 'tablefork.fixture/v1'、input.schema 为
 * 'tablefork.input/v1'、input.html 为字符串、input.strategy 为两个策略之一。
 * 不合形状时抛 CLI_USAGE 错误（退出 2）；表格本身的合法性由 analyze()
 * 判定（退出 1），不在此预判。
 */
function validateFixture(value: unknown): {
  fixture_id: string;
  input: { schema: 'tablefork.input/v1'; html: string; strategy: 'ORIGIN_EMPTY' | 'REPEAT_VALUE' };
} {
  // 注意：此处故意用直接 throw 而不用一个返回 never 的辅助函数——
  // 直接 throw 才能让 TS 在其后收窄 fixture/input 的 unknown 字段；
  // 经由 const 箭头函数 fail() 的调用在本文件实测中不产生收窄。
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('CLI_USAGE: invalid fixture: top level must be a JSON object');
  }
  const fixture = value as {
    fixture_id?: unknown;
    schema?: unknown;
    input?: unknown;
    expected_ref?: unknown;
  };
  if (typeof fixture.fixture_id !== 'string' || fixture.fixture_id === '') {
    throw new Error(
      'CLI_USAGE: invalid fixture: fixture_id must be a non-empty string',
    );
  }
  if (fixture.schema !== 'tablefork.fixture/v1') {
    throw new Error(
      `CLI_USAGE: invalid fixture: schema must be "tablefork.fixture/v1", got ${JSON.stringify(fixture.schema)}`,
    );
  }
  if (typeof fixture.input !== 'object' || fixture.input === null) {
    throw new Error('CLI_USAGE: invalid fixture: input must be an object');
  }
  const input = fixture.input as {
    schema?: unknown;
    html?: unknown;
    strategy?: unknown;
  };
  if (input.schema !== 'tablefork.input/v1') {
    throw new Error(
      `CLI_USAGE: invalid fixture: input.schema must be "tablefork.input/v1", got ${JSON.stringify(input.schema)}`,
    );
  }
  if (typeof input.html !== 'string') {
    throw new Error('CLI_USAGE: invalid fixture: input.html must be a string');
  }
  if (input.strategy !== 'ORIGIN_EMPTY' && input.strategy !== 'REPEAT_VALUE') {
    throw new Error(
      `CLI_USAGE: invalid fixture: input.strategy must be "ORIGIN_EMPTY" or "REPEAT_VALUE", got ${JSON.stringify(input.strategy)}`,
    );
  }
  return {
    fixture_id: fixture.fixture_id,
    input: {
      schema: 'tablefork.input/v1',
      html: input.html,
      strategy: input.strategy,
    },
  };
}

async function main(argv: string[]): Promise<number> {
  let options: CliOptions | null;
  try {
    options = parseArgs(argv);
  } catch (error: unknown) {
    console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  if (options === null) {
    console.log(USAGE);
    return 0;
  }

  const inputPath = resolve(options.input);
  const outPath = resolve(options.out);

  let raw: string;
  try {
    raw = await readFile(inputPath, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR CLI_USAGE: cannot read --input ${inputPath}: ${message}`);
    return 2;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR CLI_USAGE: --input ${inputPath} is not valid JSON: ${message}`);
    return 2;
  }

  let fixture: ReturnType<typeof validateFixture>;
  try {
    fixture = validateFixture(parsed);
  } catch (error: unknown) {
    console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  try {
    // FIX-02：jobId 传 `cli-<fixture_id>`（确定性，保证 CLI 输出可复现）；
    // 结果 JSON 由此携带 jobId / inputHash / specVersion（项目书 §9）。
    const result = await analyze(fixture.input, `cli-${fixture.fixture_id}`);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  } catch (error: unknown) {
    if (isTableForkError(error)) {
      // 表格被内核拒绝：枚举错误码 + message 到 stderr，退出 1，不写输出文件。
      console.error(`ERROR ${error.code}: ${error.message}`);
      return 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR CLI_USAGE: failed to write --out ${outPath}: ${message}`);
    return 2;
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
````

### src/io/index.ts
SHA-256: 31b588b0386e3eb7fa47fa460070c748cd042d2291af13ae3348d39334662590
Bytes: 457
Lines: 17

````ts
/**
 * P029 TableFork — 本地文本读取层出口 (P029-T007)
 *
 * 只 re-export src/io/localText.ts 的公共 API，不放实现。
 * （src/core/index.ts 仍由 T002 主控、T013 集成时挂接；本层出口独立，
 * 不改动它。）
 */

export type { LocalTextSource } from './localText';
export {
  assertWithinSizeLimit,
  isRemoteUrl,
  readTextFromBlob,
  readTextFromFile,
  readTextFromSource,
  textFromPaste,
} from './localText';
````

### src/io/localText.ts
SHA-256: e1cdffd322ce7cab381688722488a927e12d4733b50e5a0426106db6dd63a128
Bytes: 4911
Lines: 120

````ts
/**
 * P029 TableFork — 本地文本读取层 (P029-T007)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §3.1（输入契约：粘贴或选择本地
 * .html/.md，最大 64 KiB UTF-8；§8 隐私：默认无后台上传、无远程请求）、
 * §4.2（输入可在浏览器展示、在 textarea 中编辑、一键清空；不写
 * localStorage/IndexedDB）；IMPLEMENTATION_PLAN.md §4.2（禁止未批准的
 * 出站网络）。
 *
 * 本层只从本地来源取文本，零网络：
 * - 支持：粘贴文本（string）、本地 File、本地 Blob（FileReader /
 *   Blob.text 这类本地 API，不经过网络栈）。
 * - 拒绝：任何远程 URL（http/https/协议相对 URL）——不 fetch、不 XHR、
 *   不读远程内容，直接抛错（见 readTextFromSource 与 J-T007-8）。
 * - 输入文本可编辑：本层只“取文本”，不锁定、不缓存、不持久化；
 *   编辑发生在 UI 文本区（T009），清空由 UI 状态清除（本层不留副本）。
 *
 * 大小：任一来源的 UTF-8 字节数超过 64 KiB（MAX_INPUT_BYTES，§3.1）
 * 直接报 OVER_SIZE，不读/不截断、不猜测。
 *
 * 本层是浏览器/Node 通用代码：只用 Blob/File/text() 与 TextEncoder，
 * 无 DOM 节点操作、无 Node 专属调用（fs / fetch 均未使用）。
 */

import { MAX_INPUT_BYTES } from '../core/index';
import { fail } from '../core/parse';

/**
 * 本地文本来源（判别联合类型）。
 * - paste：用户在 textarea 粘贴的文本（已是 string，直接取用）。
 * - file：用户选择的本地 .md / .html 文件（File.text()，本地读取）。
 * - blob：本地 Blob（如下拉/拖拽产生的本地对象；Blob.text()，本地读取）。
 * - url：远程 URL——本层不支持，readTextFromSource 直接抛错，绝不请求。
 */
export type LocalTextSource =
  | { kind: 'paste'; text: string }
  | { kind: 'file'; file: File }
  | { kind: 'blob'; blob: Blob }
  | { kind: 'url'; url: string };

const utf8Encoder = new TextEncoder();

/** 判定一个字符串是否像远程 URL（http/https，或协议相对 //host/...）。 */
export function isRemoteUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^(https?:)?\/\//i.test(trimmed);
}

/**
 * 校验文本的 UTF-8 字节数不超过 64 KiB 上限；超限报 OVER_SIZE。
 * 用 TextEncoder 实测字节数，不用 string.length（CJK 占 3 字节，见 T007）。
 */
export function assertWithinSizeLimit(text: string): void {
  const bytes = utf8Encoder.encode(text).length;
  if (bytes > MAX_INPUT_BYTES) {
    fail(
      'OVER_SIZE',
      `input text is ${bytes} UTF-8 bytes, exceeding the ${MAX_INPUT_BYTES} byte limit`,
    );
  }
}

/**
 * 从粘贴文本取文本：原样返回（不 trim、不 normalization），只做上限校验。
 * 粘贴内容本身即使形如 URL 也只是文本——把它当 M 内容比较，不当作来源；
 * 只有 LocalTextSource 的 url 种才表示“要去读一个远程地址”，才被拒绝。
 */
export function textFromPaste(pastedText: string): string {
  if (typeof pastedText !== 'string') {
    throw new TypeError('textFromPaste: pastedText 必须是字符串。');
  }
  assertWithinSizeLimit(pastedText);
  return pastedText;
}

/**
 * 从本地 Blob 读 UTF-8 文本（Blob.text()，本地 API，无网络）。
 * 先按 blob.size（字节数）做上限预检，再读后复核实测字节数。
 */
export async function readTextFromBlob(blob: Blob): Promise<string> {
  if (blob.size > MAX_INPUT_BYTES) {
    fail(
      'OVER_SIZE',
      `input blob is ${blob.size} bytes, exceeding the ${MAX_INPUT_BYTES} byte limit`,
    );
  }
  const text = await blob.text();
  assertWithinSizeLimit(text);
  return text;
}

/**
 * 从用户选择的本地文件读 UTF-8 文本（File.text()，本地 API，无网络）。
 * File 是 Blob 的子类，复用 readTextFromBlob；文件名仅用于诊断，不读路径。
 */
export async function readTextFromFile(file: File): Promise<string> {
  return readTextFromBlob(file);
}

/**
 * 按来源取文本的统一入口。
 * - paste / file / blob：本地读取（见上）。
 * - url：直接抛 Error（不是 TableForkError：7 个 ErrorCode 枚举只覆盖
 *   HTML 表结构错误，没有“远程来源”码，不冒用；见 J-T007-8）。
 *   抛错发生在任何读取之前，不产生任何网络请求。
 */
export async function readTextFromSource(source: LocalTextSource): Promise<string> {
  switch (source.kind) {
    case 'paste':
      return textFromPaste(source.text);
    case 'file':
      return readTextFromFile(source.file);
    case 'blob':
      return readTextFromBlob(source.blob);
    case 'url':
      throw new Error(
        `拒绝远程 URL 作为文本来源：${source.url}（TableFork 只读本地粘贴/文件，不发任何网络请求）。`,
      );
  }
}
````

### src/main.tsx
SHA-256: b565d2c9d567c318d8f208fcb2ee9b8cce6bdac0657773ab40a7bf155aff86fc
Bytes: 460
Lines: 13

````tsx
// P029 TableFork — 双表同文交互工作台入口（P029-T009）。
// 替换 T001 占位挂载：渲染 src/ui/App，并引入 src/ui/styles.css。
// 本地离线应用：不请求远程字体/样式/脚本。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
````

### src/ui/App.tsx
SHA-256: b0ea1462602cdbff9f981df29d4ee5281ee554f236e79a338a4b328a93d77ddb
Bytes: 17421
Lines: 453

````tsx
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
````

### src/ui/DualTableView.tsx
SHA-256: 63da296d1cf3eeb761aecbf8d6d90f96933ee1f7f456e60d8ca93ecef37cd16b
Bytes: 8378
Lines: 214

````tsx
/**
 * P029 TableFork — 并排左右双表 + 中央单段 Markdown（P029-T009）
 *
 * 项目书 §4.1：左为原表 A 的二维网格（合并格可见跨线与颜色），右为按构造
 * 规则得到的不同表 B（至少一个拆开的格），中间同一份 Markdown 代码。
 * 悬停/键盘聚焦一格时，左右来源位置高亮、Markdown 中对应的文本位置高亮。
 *
 * 反证不单靠颜色：每个格子都有坐标文字标签（R{r}C{c}）、来源 cellId、
 * 合并/拆分文字徽标；选中的格子另有焦点描边与文字说明。
 * 用户 HTML 绝不以 innerHTML 注入：只用 React 文本节点渲染单元格文本。
 */

import type { GridResult } from '../core/grid';
import type { AnalyzeResult } from '../core/index';
import { MarkdownPanel, markdownLineForRow } from './MarkdownPanel';

export interface SlotRef {
  row: number;
  col: number;
}

export interface DualTableViewProps {
  result: AnalyzeResult;
  gridA: GridResult;
  /** 仅 CERTIFIED_COLLISION 时存在。 */
  gridB?: GridResult;
  /** 拆分源格在 A 中的 cellId（用于在 B 中标出拆分格）。 */
  sourceCellId?: string;
  selectedSlot: SlotRef | null;
  onSelectSlot: (slot: SlotRef | null) => void;
}

function cellBadge(cell: { rowSpan: number; colSpan: number }): string | null {
  if (cell.rowSpan * cell.colSpan > 1) return `合并 ${cell.rowSpan}×${cell.colSpan}`;
  return null;
}

/** 渲染一张覆盖网格为 <table>；merged 标合并格，splitIds 标 B 中的拆分格。 */
function GridTable(props: {
  grid: GridResult;
  tableLabel: string;
  splitIds?: ReadonlySet<string>;
  selectedSlot: SlotRef | null;
  onSelectSlot: (slot: SlotRef | null) => void;
}): React.JSX.Element {
  const byId = new Map(props.grid.cells.map((cell) => [cell.id, cell]));
  const isSelected = (row: number, col: number): boolean => {
    if (props.selectedSlot === null) return false;
    const owner = byId.get(props.grid.slotOwner[row][col]);
    if (owner === undefined) return false;
    return (
      props.selectedSlot.row >= owner.row &&
      props.selectedSlot.row < owner.row + owner.rowSpan &&
      props.selectedSlot.col >= owner.col &&
      props.selectedSlot.col < owner.col + owner.colSpan
    );
  };

  return (
    <table className="tf-grid">
      <caption>
        {props.tableLabel}（{props.grid.rows} 行 × {props.grid.cols} 列，
        {props.grid.cells.length} 个 DOM 单元格）
      </caption>
      <tbody>
        {Array.from({ length: props.grid.rows }, (_, r) => (
          <tr key={r}>
            {props.grid.cells
              .filter((cell) => cell.row === r)
              .map((cell) => {
                const Tag = cell.role === 'TH' ? 'th' : 'td';
                const badge = cellBadge(cell);
                const isSplit = props.splitIds?.has(cell.id) ?? false;
                const selected = isSelected(r, cell.col);
                const className = [
                  badge !== null ? 'cell-merged' : '',
                  isSplit ? 'cell-split' : '',
                  selected ? 'cell-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                const label =
                  `R${cell.row}C${cell.col} 来源 ${cell.id} ` +
                  `${cell.role}${cell.scope !== null ? ` scope=${cell.scope}` : ''} ` +
                  `${cell.rowSpan}×${cell.colSpan} ` +
                  `${badge ?? ''}${isSplit ? ' 已拆分格' : ''} ` +
                  `值：${cell.text === '' ? '（空）' : cell.text}`;
                return (
                  <Tag
                    key={cell.id}
                    rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                    colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                    className={className === '' ? undefined : className}
                    tabIndex={0}
                    role="button"
                    aria-label={label}
                    title={label}
                    onMouseEnter={() => props.onSelectSlot({ row: cell.row, col: cell.col })}
                    onFocus={() => props.onSelectSlot({ row: cell.row, col: cell.col })}
                    onClick={() => props.onSelectSlot({ row: cell.row, col: cell.col })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        props.onSelectSlot({ row: cell.row, col: cell.col });
                      }
                    }}
                  >
                    <span className="tf-cell-coord">
                      R{cell.row}C{cell.col} · {cell.id}
                    </span>
                    {badge !== null && <span className="tf-cell-badge">{badge}</span>}
                    {isSplit && <span className="tf-cell-badge">已拆分</span>}
                    <span className={cell.text === '' ? 'tf-cell-text tf-cell-empty' : 'tf-cell-text'}>
                      {cell.text === '' ? '（空）' : cell.text}
                    </span>
                  </Tag>
                );
              })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DualTableView(props: DualTableViewProps): React.JSX.Element {
  const { result, gridA, gridB, sourceCellId, selectedSlot, onSelectSlot } = props;

  // B 中属于拆分区域的格：其原点落在 A 源格覆盖矩形内的格。
  let splitIds: ReadonlySet<string> | undefined;
  if (gridB !== undefined && sourceCellId !== undefined) {
    const source = gridA.cells.find((cell) => cell.id === sourceCellId);
    if (source !== undefined) {
      splitIds = new Set(
        gridB.cells
          .filter(
            (cell) =>
              cell.row >= source.row &&
              cell.row < source.row + source.rowSpan &&
              cell.col >= source.col &&
              cell.col < source.col + source.colSpan,
          )
          .map((cell) => cell.id),
      );
    }
  }

  const highlightLine =
    selectedSlot === null ? null : markdownLineForRow(selectedSlot.row);

  return (
    <section className="tf-section" aria-label="双表对照">
      <h2>双表对照</h2>
      <div className="tf-dual">
        <div className="tf-table-card">
          <h3>表 A（原表）</h3>
          <p className="tf-table-note">合并格有加粗跨线、底色与“合并”文字徽标。</p>
          <GridTable
            grid={gridA}
            tableLabel="表 A"
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
          />
        </div>

        <div className="tf-md-card">
          <h3>Markdown（同一份）</h3>
          <p className="tf-table-note">
            {result.proof !== undefined
              ? 'F(A) 与 F(B) 逐字节相同，只显示一份。'
              : '生成的 F(A)。未证实碰撞时，B 表不存在。'}
          </p>
          <MarkdownPanel
            markdown={result.canonicalMarkdown}
            highlightLine={highlightLine}
            selectedSlot={selectedSlot}
          />
        </div>

        <div className="tf-table-card">
          <h3>表 B（反例）</h3>
          {gridB !== undefined ? (
            <>
              <p className="tf-table-note">
                拆分源格 {sourceCellId}：至少一个格已被拆开（“已拆分”徽标）。
              </p>
              <GridTable
                grid={gridB}
                tableLabel="表 B"
                splitIds={splitIds}
                selectedSlot={selectedSlot}
                onSelectSlot={onSelectSlot}
              />
            </>
          ) : (
            <p className="tf-empty-note">
              无 B 表。本次分析未证实结构碰撞（NO_WITNESS_FOUND）：只表示在限定构造器里
              没找到，不表示表格保真。
            </p>
          )}
        </div>
      </div>
      {selectedSlot !== null && (
        <p className="tf-hint" role="status">
          已选中槽位 R{selectedSlot.row}C{selectedSlot.col}：左右两表对应来源位置已高亮，
          Markdown 第 {(highlightLine ?? 0) + 1} 行已高亮。
          <button type="button" onClick={() => onSelectSlot(null)}>
            清除高亮
          </button>
        </p>
      )}
    </section>
  );
}
````

### src/ui/ExportPanel.tsx
SHA-256: 563537afbe9a13a0cf4e99ec55e1d32e03bb6cb902c0154bde2a526374f8a323
Bytes: 5076
Lines: 146

````tsx
/**
 * P029 TableFork — 导出面板（P029-T009）
 *
 * 项目书 §4.1 / §5.4：最下方两个可切换标签页——逐格交接稿
 * （row-path | col-path : value，每行附来源）与可审查证据 JSON；
 * 按钮复制交接文本、下载 JSON、清空内存均有真实功能，不显示虚假的
 * “已被 AI 使用”。清空同时清内存状态与 DOM 显示，不写任何持久化存储。
 */

import { useState } from 'react';
import { formatSlotFacts } from '../core/records';
import type { AnalyzeResult, Strategy } from '../core/index';

export interface ExportPanelProps {
  result: AnalyzeResult | null;
  presetId: string | null;
  strategy: Strategy;
  onClear: () => void;
}

export function ExportPanel(props: ExportPanelProps): React.JSX.Element {
  const { result, presetId, strategy, onClear } = props;
  const [tab, setTab] = useState<'facts' | 'json'>('facts');
  const [copyMsg, setCopyMsg] = useState<string>('');

  const handoffText = (): string => {
    if (result === null) return '';
    const header = [
      '# TableFork 逐格交接稿 tablefork.report/v1',
      `# 预设：${presetId ?? '（自定义输入）'} 策略：${strategy}`,
      ...(result.compare === 'EXACT_DIFF'
        ? ['# 注意：M 与 F(A) 不一致；本交接稿只对 F(A) 生效，不适用于 M。']
        : []),
      '# 行标题/列标题未知时写 ?，不得编造。',
      '',
    ].join('\n');
    return header + formatSlotFacts(result.facts);
  };

  const copyHandoff = async (): Promise<void> => {
    const text = handoffText();
    if (text === '') return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg('已复制交接文本。');
    } catch {
      // 剪贴板 API 不可用时的回退：选中文本区内容走 execCommand。
      const area = document.getElementById('tf-handoff-fallback') as HTMLTextAreaElement | null;
      if (area !== null) {
        area.focus();
        area.select();
        try {
          document.execCommand('copy');
          setCopyMsg('已复制交接文本。');
        } catch {
          setCopyMsg('复制失败：请手动选中下方交接稿复制。');
        }
      } else {
        setCopyMsg('复制失败：请手动选中下方交接稿复制。');
      }
    }
  };

  const downloadJson = (): void => {
    if (result === null) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tablefork-report-${presetId ?? 'custom'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCopyMsg('已下载 JSON 报告。');
  };

  const jsonText = result === null ? '' : JSON.stringify(result, null, 2);

  return (
    <section className="tf-section" aria-label="交接与导出">
      <h2>交接与导出</h2>
      {result === null ? (
        <p className="tf-empty-note">分析后这里显示逐格交接稿与可审查证据 JSON。</p>
      ) : (
        <>
          <div className="tf-tabs" role="tablist" aria-label="交接稿与证据">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'facts'}
              aria-pressed={tab === 'facts'}
              onClick={() => setTab('facts')}
            >
              逐格交接稿
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'json'}
              aria-pressed={tab === 'json'}
              onClick={() => setTab('json')}
            >
              可审查证据 JSON
            </button>
          </div>
          <div className="tf-tab-panel" role="tabpanel">
            {tab === 'facts' ? (
              <pre aria-label="逐格交接稿">{handoffText()}</pre>
            ) : (
              <pre aria-label="可审查证据 JSON">{jsonText}</pre>
            )}
            <textarea
              id="tf-handoff-fallback"
              value={handoffText()}
              readOnly
              hidden
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
        </>
      )}
      <div className="tf-export-row">
        <button type="button" disabled={result === null} onClick={() => void copyHandoff()}>
          复制交接文本
        </button>
        <button type="button" disabled={result === null} onClick={downloadJson}>
          下载 JSON
        </button>
        <button type="button" onClick={onClear}>
          清空内存
        </button>
        {copyMsg !== '' && (
          <span className="tf-copy-msg" role="status">
            {copyMsg}
          </span>
        )}
      </div>
      <p className="tf-hint">
        清空内存会删除源码、Markdown、比较结果与下载引用，不保留任何副本，不写
        localStorage / IndexedDB。
      </p>
    </section>
  );
}
````

### src/ui/InputPanel.tsx
SHA-256: 402e07e0f8ef65506687e20c9a4330b20e5740bf1b7d419458f008137eb9d248
Bytes: 8322
Lines: 236

````tsx
/**
 * P029 TableFork — 输入面板（P029-T009）
 *
 * 项目书 §4.1：四个可切换的合成预设按钮、粘贴 HTML / 打开本地 .html、
 * 可编辑 Markdown 文本区（用户 M）、策略开关、比较按钮。
 * 本地文件读取走 src/io/localText.ts 的本地层，零网络；不写任何持久化存储。
 */

import { useRef, useState } from 'react';
import { MAX_INPUT_BYTES, type Strategy } from '../core/index';
import { readTextFromFile } from '../io/localText';
import { PRESETS, type Preset } from './presets';

export interface InputPanelProps {
  html: string;
  onHtmlChange: (value: string) => void;
  markdown: string;
  onMarkdownChange: (value: string) => void;
  strategy: Strategy;
  onStrategyChange: (value: Strategy) => void;
  presetId: string | null;
  onSelectPreset: (preset: Preset) => void;
  analyzing: boolean;
  compareDisabled: boolean;
  compareDisabledReason: string | null;
  onCompare: () => void;
  onCancel: () => void;
  /** 分析后可用：把生成的 F(A) 填入 M 文本区（用于演示 EXACT_MATCH）。 */
  canFillCanonical: boolean;
  onFillCanonical: () => void;
  /** 结构预检提示（parse+grid 的试算结果，不作最终判定）。 */
  validationHint: string;
  validationIsError: boolean;
}

export function InputPanel(props: InputPanelProps): React.JSX.Element {
  const htmlFileRef = useRef<HTMLInputElement>(null);
  const mdFileRef = useRef<HTMLInputElement>(null);
  const htmlAreaRef = useRef<HTMLTextAreaElement>(null);
  const [fileMsg, setFileMsg] = useState<string>('');

  const openHtmlFile = (): void => {
    htmlFileRef.current?.click();
  };

  const onHtmlFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    try {
      props.onHtmlChange(await readTextFromFile(file));
      setFileMsg(`已读取本地文件 ${file.name}（本地读取，未上传）。`);
    } catch (err) {
      setFileMsg(`读取失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const onMdFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    try {
      props.onMarkdownChange(await readTextFromFile(file));
      setFileMsg(`已读取本地文件 ${file.name}（本地读取，未上传）。`);
    } catch (err) {
      setFileMsg(`读取失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const pasteHtml = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText();
      props.onHtmlChange(text);
      setFileMsg('已从剪贴板粘贴 HTML。');
    } catch {
      htmlAreaRef.current?.focus();
      setFileMsg('浏览器未允许读取剪贴板：请在下方 HTML 文本区直接粘贴（Ctrl+V）。');
    }
  };

  const htmlBytes = new TextEncoder().encode(props.html).length;
  const mdBytes = new TextEncoder().encode(props.markdown).length;

  return (
    <section className="tf-section" aria-label="输入">
      <h2>输入</h2>

      <div className="tf-presets" role="group" aria-label="合成预设">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={props.presetId === preset.id}
            onClick={() => props.onSelectPreset(preset)}
          >
            {preset.id} · {preset.name}
          </button>
        ))}
      </div>
      <p className="tf-preset-desc">
        {props.presetId !== null
          ? PRESETS.find((p) => p.id === props.presetId)?.description
          : '请选择一个合成预设，或粘贴 / 打开本地 HTML。全部数据均为合成示例，不含真实办公文档。'}
      </p>

      <div className="tf-input-grid">
        <div className="tf-field">
          <label htmlFor="tf-html">源表 HTML（A）</label>
          <textarea
            id="tf-html"
            ref={htmlAreaRef}
            value={props.html}
            onChange={(event) => props.onHtmlChange(event.target.value)}
            placeholder="<table>…</table>"
            aria-describedby="tf-html-meta"
            spellCheck={false}
          />
          <div id="tf-html-meta" className="tf-hint">
            {htmlBytes} / {MAX_INPUT_BYTES} UTF-8 字节。
            <span className={props.validationIsError ? 'tf-error-text' : 'tf-ok-text'}>
              {' '}
              {props.validationHint}
            </span>
          </div>
          <div className="tf-field-row">
            <button type="button" onClick={() => void pasteHtml()}>
              粘贴 HTML
            </button>
            <button type="button" onClick={openHtmlFile}>
              打开本地 .html
            </button>
            <input
              ref={htmlFileRef}
              type="file"
              accept=".html,.htm,text/html"
              onChange={(event) => void onHtmlFile(event)}
              hidden
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
        </div>

        <div className="tf-field">
          <label htmlFor="tf-md">待交接 Markdown（M，用户粘贴，可编辑）</label>
          <textarea
            id="tf-md"
            value={props.markdown}
            onChange={(event) => props.onMarkdownChange(event.target.value)}
            placeholder="留空表示未提供 M（NOT_SUPPLIED），页面可预览生成的 F(A)。"
            aria-describedby="tf-md-meta"
            spellCheck={false}
          />
          <div id="tf-md-meta" className="tf-hint">
            {mdBytes} / {MAX_INPUT_BYTES} UTF-8 字节。留空 = 未提供 M；仅含空白的串按已提供处理。
          </div>
          <div className="tf-field-row">
            <button type="button" onClick={() => mdFileRef.current?.click()}>
              打开本地 .md
            </button>
            <input
              ref={mdFileRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              onChange={(event) => void onMdFile(event)}
              hidden
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              disabled={!props.canFillCanonical}
              onClick={props.onFillCanonical}
              title="把本次分析生成的 F(A) 填入 M 文本区"
            >
              用 F(A) 填入
            </button>
          </div>
        </div>
      </div>

      {fileMsg !== '' && (
        <p className="tf-hint" role="status">
          {fileMsg}
        </p>
      )}

      <fieldset className="tf-strategy">
        <legend>扁平化策略 F</legend>
        <label>
          <input
            type="radio"
            name="tf-strategy"
            value="ORIGIN_EMPTY"
            checked={props.strategy === 'ORIGIN_EMPTY'}
            onChange={() => props.onStrategyChange('ORIGIN_EMPTY')}
          />
          ORIGIN_EMPTY（原点留值，延展格留空）
        </label>
        <label>
          <input
            type="radio"
            name="tf-strategy"
            value="REPEAT_VALUE"
            checked={props.strategy === 'REPEAT_VALUE'}
            onChange={() => props.onStrategyChange('REPEAT_VALUE')}
          />
          REPEAT_VALUE（每个覆盖格复制原值）
        </label>
      </fieldset>

      <div className="tf-compare-row">
        {props.analyzing ? (
          <button type="button" className="primary" onClick={props.onCancel}>
            取消
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={props.compareDisabled}
            onClick={props.onCompare}
          >
            比较并寻找反例
          </button>
        )}
        {props.analyzing && <span className="tf-hint">正在分析…（取消后旧结果不会覆盖新输入）</span>}
        {!props.analyzing && props.compareDisabledReason !== null && (
          <span className="tf-error-text" role="status">
            {props.compareDisabledReason}
          </span>
        )}
      </div>
    </section>
  );
}
````

### src/ui/MarkdownPanel.tsx
SHA-256: 4e1c8ec93df657919ea92c163dbbe4c9fae64d724e4ad6b61627dbb22b657811
Bytes: 1679
Lines: 47

````tsx
/**
 * P029 TableFork — 中央 Markdown 面板（P029-T009）
 *
 * 项目书 §5.1：F 输出每行一个 Markdown 行，第 1 行后插入分隔行。
 * 因此网格行 r 对应 Markdown 行号 line(r) = r + (r >= 1 ? 1 : 0)。
 * 选中某槽位时，对应行整行高亮（颜色 + 加粗，不单靠颜色：另有行号与文字说明）。
 */

import type { SlotRef } from './DualTableView';

/** 网格行 r 对应的 F(A) Markdown 行下标（0-based）。 */
export function markdownLineForRow(row: number): number {
  return row + (row >= 1 ? 1 : 0);
}

export function MarkdownPanel(props: {
  markdown: string;
  highlightLine: number | null;
  selectedSlot: SlotRef | null;
}): React.JSX.Element {
  const lines = props.markdown.split('\n');
  // F 以单个 LF 结尾：末尾空串是换行符的产物，不是内容行，去掉它再展示。
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return (
    <div>
      <pre className="tf-md-pre" aria-label="生成的 Markdown（F(A)）">
        <code>
          {lines.map((line, index) => (
            <span
              key={index}
              className={props.highlightLine === index ? 'tf-md-line hl' : 'tf-md-line'}
            >
              <span className="tf-md-line-num">{index + 1}</span>
              {line === '' ? ' ' : line}
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
      {props.selectedSlot !== null && props.highlightLine !== null && (
        <p className="tf-hint">
          高亮的是 R{props.selectedSlot.row} 行对应的 Markdown 第 {props.highlightLine + 1} 行。
        </p>
      )}
    </div>
  );
}
````

### src/ui/ProofPanel.tsx
SHA-256: b64f80fba9b1ee9f5c6e5d00817a064aa30b2047051f760f6f5b52ced7c73995
Bytes: 7085
Lines: 170

````tsx
/**
 * P029 TableFork — 状态栏与证明面板（P029-T009）
 *
 * 项目书 §4.1/§4.2：状态栏把两件事分开显示——结构碰撞证明与 M 是否匹配
 * F(A)，绝不能混成“安全/危险”一个分数。CERTIFIED_COLLISION 展示 A≠B 与
 * F(A)=F(B) 两行独立断言；标题关联差异确实成立才另打
 * HEADER_ASSOCIATION_CHANGED，否则只说 STRUCTURAL_COLLISION。
 * MISMATCH 单独说明首个不同 UTF-8 字节附近的字符区间；此时证书只对 F(A)
 * 生效。UNSUPPORTED / INVALID_INPUT 明确“不可确认”，不回退为猜测。
 */

import type { FirstDiff } from '../core/compare';
import type { AnalyzeResult, CollisionKind } from '../core/index';

export interface ProofPanelProps {
  result: AnalyzeResult | null;
  /** 分析抛错时的错误（UNSUPPORTED / INVALID_INPUT 状态）。 */
  error: { code: string; message: string } | null;
  kind?: CollisionKind;
  reason?: string;
  /** EXACT_DIFF 时的首个不同字节定位（由 App 调 compareMarkdown 得到）。 */
  firstDiff?: FirstDiff;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}…`;
}

export function ProofPanel(props: ProofPanelProps): React.JSX.Element {
  const { result, error, kind, reason, firstDiff } = props;

  const witnessLine = (): React.JSX.Element => {
    if (error !== null) {
      const unsupported =
        error.code === 'UNSUPPORTED_NESTED_TABLE' ||
        error.code === 'UNSUPPORTED_HEADER_SEMANTICS';
      return (
        <span>
          <span className="tf-chip bad">{unsupported ? 'UNSUPPORTED' : 'INVALID_INPUT'}</span>
          不可确认（{error.code}）：{error.message} 不回退为猜测。
        </span>
      );
    }
    if (result === null) return <span>—</span>;
    if (result.witness === 'CERTIFIED_COLLISION' && result.proof !== undefined) {
      return (
        <span>
          <span className="tf-chip ok">CERTIFIED_COLLISION</span>
          结构碰撞已证实：{kind ?? 'STRUCTURAL_COLLISION'}。源格 {result.proof.sourceCellId}，
          拆分代价 {result.proof.splitCost}。
        </span>
      );
    }
    return (
      <span>
        <span className="tf-chip warn">NO_WITNESS_FOUND</span>
        未发现证明：只表示在限定构造器里没找到，不表示保真。
        {reason !== undefined ? `（${reason}）` : ''}
      </span>
    );
  };

  const compareLine = (): React.JSX.Element => {
    if (result === null) return <span>—</span>;
    if (result.compare === 'EXACT_MATCH') {
      return (
        <span>
          <span className="tf-chip ok">EXACT_MATCH</span>
          M 与 F(A) 逐字节相同。
        </span>
      );
    }
    if (result.compare === 'NOT_SUPPLIED') {
      return (
        <span>
          <span className="tf-chip warn">NOT_SUPPLIED</span>
          未输入 M；上方显示的是生成的 F(A) 预览。
        </span>
      );
    }
    return (
      <span>
        <span className="tf-chip bad">MISMATCH（EXACT_DIFF）</span>
        M 与 F(A) 不相等；碰撞证书只对 F(A) 生效，不伪称适用于 M。
      </span>
    );
  };

  return (
    <section className="tf-status" aria-label="状态栏">
      <h2>状态栏</h2>
      <dl>
        <dt>结构碰撞证明</dt>
        <dd>{witnessLine()}</dd>
        <dt>Markdown 对账</dt>
        <dd>{compareLine()}</dd>
      </dl>
      <p className="tf-hint">
        两项分别显示，不合并为“安全 / 危险”分数；本工具不输出安全评分。
      </p>

      {result !== null && result.proof !== undefined && (
        <div>
          <p className="tf-assert">断言 1：A ≠ B（canonical cell graph 不同）</p>
          <p className="tf-assert">
            A 图 SHA-256：{shortHash(result.proof.aGraphSha256)}
            <br />B 图 SHA-256：{shortHash(result.proof.bGraphSha256)}
          </p>
          <p className="tf-assert">断言 2：F(A) = F(B)（UTF-8 逐字节相同）</p>
          <p className="tf-assert">Markdown SHA-256：{shortHash(result.proof.markdownSha256)}</p>
          <svg
            width="360"
            height="90"
            viewBox="0 0 360 90"
            className="tf-proof-svg"
            role="img"
            aria-label="示意图：左表 A 与右表 B 的合并结构不同（A 不等于 B），但两者生成的 Markdown 完全相同（F(A) 等于 F(B)）。"
          >
            <title>
              A 与 B 结构不同但 Markdown 相同：左框 A 的合并格被拆开得到右框 B，中间箭头指向同一份 Markdown。
            </title>
            <rect x="8" y="10" width="90" height="40" fill="#fff3cd" stroke="#8a6d00" strokeWidth="2" />
            <text x="53" y="34" textAnchor="middle" fontSize="14">表 A</text>
            <rect x="262" y="10" width="90" height="40" fill="#d9ecff" stroke="#0b5cad" strokeWidth="2" />
            <text x="307" y="34" textAnchor="middle" fontSize="14">表 B</text>
            <line x1="98" y1="30" x2="262" y2="30" stroke="#1a1a1a" strokeWidth="2" markerEnd="url(#tf-arrow)" />
            <defs>
              <marker id="tf-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#1a1a1a" />
              </marker>
            </defs>
            <text x="180" y="24" textAnchor="middle" fontSize="12">A ≠ B（结构不同）</text>
            <text x="180" y="72" textAnchor="middle" fontSize="12">F(A) = F(B)（同一份 Markdown）</text>
          </svg>
          <p className="tf-svg-note">
            上图说明：左表 A 的合并格在右表 B 中被拆开，两张表结构不同，但中间 Markdown
            完全相同——只看 Markdown 无法确定原表合并关系。
          </p>
        </div>
      )}

      {result !== null && result.compare === 'EXACT_DIFF' && firstDiff !== undefined && (
        <div>
          <h3>M 与 F(A) 的首个不同位置</h3>
          <p>
            首个不同 UTF-8 字节下标：{firstDiff.byteOffset}；
            M 侧字符下标 {firstDiff.suppliedCharIndex ?? '（串已结束）'}
            {firstDiff.suppliedCharAtDiff !== undefined ? `（字符“${firstDiff.suppliedCharAtDiff}”）` : ''}；
            F(A) 侧字符下标 {firstDiff.canonicalCharIndex ?? '（串已结束）'}
            {firstDiff.canonicalCharAtDiff !== undefined ? `（字符“${firstDiff.canonicalCharAtDiff}”）` : ''}。
          </p>
          <p className="tf-assert">M 侧上下文：{firstDiff.suppliedContext}</p>
          <p className="tf-assert">F(A) 侧上下文：{firstDiff.canonicalContext}</p>
          <p>此时生成的碰撞证书只对 F(A) 生效，不伪称适用于 M。</p>
        </div>
      )}

      {result !== null && result.warnings.length > 0 && (
        <div>
          <h3>提示</h3>
          <ul>
            {result.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
````

### src/ui/presets.ts
SHA-256: c2e6b183566b5fba8f5cd1a0c668d1f51e2fd9bb1d41d9ce64a824cfca9ccb88
Bytes: 3773
Lines: 90

````ts
/**
 * P029 TableFork — 四个确定性演示预设（P029-T009，单一来源）
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §4.3（四个确定性演示预设）、
 * §6.3（TFK-A 例原文）；artifacts/logs/T005-witness.txt §6（TFK-B 原文）。
 *
 * HTML 来源（逐条登记，见 artifacts/logs/T009-ui.txt）：
 * - TFK-A：项目书 §6.3 例原文，一字不改。
 * - TFK-B：T005 见证日志 §6 的 A HTML 原文，一字不改。
 * - TFK-C：按 §4.3“纯矩形无合并”自行构造的最小示例（本卡新建）。
 * - TFK-D：按 §4.3“明确写出 headers= 或嵌套 <table>”自行构造的最小示例
 *   （本卡选用 headers= 形式；嵌套 <table> 形式同属 UNSUPPORTED_NESTED_TABLE）。
 *
 * 归属裁决（协调决定）：四个预设的 HTML 以本文件为单一来源；T010 写
 * fixtures/TFK-A..D.json 时必须复用同一 HTML，不得另写一份（见 T009-ui.txt
 * issues，供 T010 派工引用）。
 *
 * 本文件只含数据，不含任何分析算法；分析走 src/core/report.ts 的 analyze()。
 */

export interface Preset {
  /** 预设编号（TFK-A..D）。 */
  id: 'TFK-A' | 'TFK-B' | 'TFK-C' | 'TFK-D';
  /** 中文名称。 */
  name: string;
  /** 一句话说明（§4.3 描述）。 */
  description: string;
  /** 原表 A 的 HTML 原文。 */
  html: string;
  /** 预期结果（ORIGIN_EMPTY 下；REPEAT_VALUE 下 TFK-A/B 仍为碰撞，见日志）。 */
  expected: string;
}

/** TFK-A：两层列标题中的 colspan=2（项目书 §6.3 例原文）。 */
export const TFK_A_HTML =
  '<table><thead><tr><th rowspan="2">产品</th><th colspan="2">2026预算</th></tr>' +
  '<tr><th>收入</th><th>成本</th></tr></thead>' +
  '<tbody><tr><td>A</td><td>120</td><td>80</td></tr></tbody></table>';

/** TFK-B：部门 th scope=row rowspan=2（T005 见证日志 §6 原文）。 */
export const TFK_B_HTML =
  '<table><thead><tr><th>项目</th><th>数值</th></tr></thead>' +
  '<tbody><tr><th scope="row" rowspan="2">部门X</th><td>a</td></tr>' +
  '<tr><td>b</td></tr></tbody></table>';

/** TFK-C：纯矩形无合并（按 §4.3 自行构造的最小示例）。 */
export const TFK_C_HTML =
  '<table><thead><tr><th>项目</th><th>数值</th></tr></thead>' +
  '<tbody><tr><td>a</td><td>1</td></tr>' +
  '<tr><td>b</td><td>2</td></tr></tbody></table>';

/** TFK-D：headers= 引用（按 §4.3 自行构造的最小示例）。 */
export const TFK_D_HTML =
  '<table><thead><tr><th id="h1">项目</th><th id="h2">数值</th></tr></thead>' +
  '<tbody><tr><td headers="h1">a</td><td headers="h2">1</td></tr></tbody></table>';

export const PRESETS: Preset[] = [
  {
    id: 'TFK-A',
    name: '两层列标题 colspan=2',
    description: '最典型主视觉：拆分后两张表发同一份 Markdown。',
    html: TFK_A_HTML,
    expected: 'CERTIFIED_COLLISION（HEADER_ASSOCIATION_CHANGED）',
  },
  {
    id: 'TFK-B',
    name: '行标题 rowspan=2',
    description: '部门 th scope=row rowspan=2，两个项目行的行标题归属变化。',
    html: TFK_B_HTML,
    expected: 'CERTIFIED_COLLISION（ORIGIN_EMPTY 下 HEADER_ASSOCIATION_CHANGED）',
  },
  {
    id: 'TFK-C',
    name: '纯矩形无合并',
    description: '无合并格：报告 NO_WITNESS_FOUND，绝不显示“绝对保真”。',
    html: TFK_C_HTML,
    expected: 'NO_WITNESS_FOUND（只表示在限定构造器里没找到）',
  },
  {
    id: 'TFK-D',
    name: 'headers= 引用',
    description: '明确写出 headers=：报告 UNSUPPORTED_HEADER_SEMANTICS。',
    html: TFK_D_HTML,
    expected: 'UNSUPPORTED（UNSUPPORTED_HEADER_SEMANTICS）',
  },
];

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
````

### src/ui/styles.css
SHA-256: 8e6a12b8b6ca73e2f21d919ec389e723f3ac3fd7dabcb33452b9845730e4f98e
Bytes: 7118
Lines: 246

````css
/* P029 TableFork — 工作台样式（P029-T009）
 * 只用系统字体，不请求任何远程字体/样式/图片（项目书 §4.2 / §8）。
 * 反证不单靠颜色：合并格/拆分格均有文字徽标与坐标标签；焦点一律可见描边。 */

:root {
  color-scheme: light;
  --ink: #1a1a1a;
  --muted: #5a5a5a;
  --line: #c9c9c9;
  --bg: #ffffff;
  --panel: #f6f6f2;
  --accent: #0b5cad;
  --accent-ink: #ffffff;
  --merged-bg: #fff3cd;
  --merged-line: #8a6d00;
  --split-bg: #d9ecff;
  --split-line: #0b5cad;
  --focus: #d35400;
  --ok: #146c2e;
  --bad: #9c1c1c;
  --hl: #ffe08a;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 15px;
  line-height: 1.55;
}

button, input, textarea, select { font: inherit; }

button {
  cursor: pointer;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  border-radius: 6px;
  padding: 0.45em 0.9em;
}
button:hover:not(:disabled) { border-color: var(--accent); }
button:disabled { cursor: not-allowed; opacity: 0.55; }
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
button[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
}

:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}

.tf-app { max-width: 1240px; margin: 0 auto; padding: 0 16px 48px; }

.tf-topbar {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  border-bottom: 2px solid var(--ink);
  padding: 14px 0 10px;
}
.tf-topbar h1 { font-size: 26px; margin: 0; }
.tf-topbar .tf-sub { color: var(--muted); font-size: 13px; }

.tf-privacy {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 14px;
  margin: 14px 0;
}
.tf-privacy p { margin: 4px 0; }

.tf-section { margin-top: 20px; }
.tf-section > h2 { font-size: 18px; margin: 0 0 8px; }
.tf-hint { color: var(--muted); font-size: 13px; }
.tf-error-text { color: var(--bad); }
.tf-ok-text { color: var(--ok); }

.tf-presets { display: flex; gap: 8px; flex-wrap: wrap; }
.tf-preset-desc { margin: 8px 0 0; color: var(--muted); font-size: 13px; }

.tf-input-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.tf-field label { display: block; font-weight: 600; margin-bottom: 4px; }
.tf-field textarea {
  width: 100%;
  min-height: 150px;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  background: #fff;
  color: var(--ink);
}
.tf-field-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; align-items: center; }

.tf-strategy { border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; margin-top: 12px; }
.tf-strategy legend { font-weight: 600; padding: 0 4px; }
.tf-strategy label { display: inline-flex; gap: 6px; align-items: center; margin-right: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.tf-compare-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 14px; }

/* 并排左右双表 + 中央单段 Markdown */
.tf-dual {
  display: grid;
  grid-template-columns: 1fr 1.1fr 1fr;
  gap: 16px;
  align-items: start;
}
.tf-table-card h3, .tf-md-card h3 { font-size: 15px; margin: 0 0 6px; }
.tf-table-card .tf-table-note, .tf-md-card .tf-table-note { color: var(--muted); font-size: 13px; margin: 0 0 8px; }

table.tf-grid {
  border-collapse: collapse;
  width: 100%;
  table-layout: fixed;
}
table.tf-grid caption { text-align: left; font-size: 13px; color: var(--muted); padding-bottom: 4px; }
table.tf-grid th, table.tf-grid td {
  border: 1px solid var(--ink);
  padding: 6px 6px;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
  cursor: pointer;
}
table.tf-grid th { background: #ececec; }
table.tf-grid td.cell-merged, table.tf-grid th.cell-merged {
  background: var(--merged-bg);
  border: 2px solid var(--merged-line);
}
table.tf-grid td.cell-split, table.tf-grid th.cell-split {
  background: var(--split-bg);
  border: 2px solid var(--split-line);
}
table.tf-grid th.cell-selected, table.tf-grid td.cell-selected {
  outline: 3px solid var(--focus);
  outline-offset: -1px;
}
.tf-cell-coord { display: block; font-size: 11px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.tf-cell-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid currentColor;
  border-radius: 4px;
  padding: 0 4px;
  margin-top: 2px;
}
.tf-cell-text { display: block; margin-top: 2px; }
.tf-cell-empty { color: var(--muted); font-style: italic; }

.tf-md-pre {
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px;
  background: var(--panel);
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.tf-md-line { display: block; padding: 0 4px; border-radius: 3px; }
.tf-md-line.hl { background: var(--hl); font-weight: 700; }
.tf-md-line-num {
  display: inline-block;
  width: 2em;
  color: var(--muted);
  user-select: none;
}

.tf-status {
  border: 2px solid var(--ink);
  border-radius: 8px;
  padding: 12px 14px;
  margin-top: 20px;
  background: #fff;
}
.tf-status dl { margin: 0; display: grid; grid-template-columns: 10em 1fr; gap: 6px 12px; }
.tf-status dt { font-weight: 700; }
.tf-status dd { margin: 0; }
.tf-chip {
  display: inline-block;
  font-weight: 700;
  border: 1px solid currentColor;
  border-radius: 4px;
  padding: 0 6px;
  margin-right: 6px;
}
.tf-chip.ok { color: var(--ok); }
.tf-chip.bad { color: var(--bad); }
.tf-chip.warn { color: #7a4d00; }
.tf-assert { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
.tf-svg-note { margin: 10px 0 0; color: var(--muted); font-size: 13px; }
.tf-proof-svg { max-width: 100%; height: auto; }

.tf-tabs { display: flex; gap: 8px; margin-top: 20px; }
.tf-tab-panel {
  border: 1px solid var(--line);
  border-radius: 0 8px 8px 8px;
  padding: 12px;
  margin-top: -1px;
}
.tf-tab-panel pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  max-height: 420px;
  overflow-y: auto;
}
.tf-export-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
.tf-copy-msg { color: var(--ok); font-weight: 600; }

.tf-empty-note { color: var(--muted); }

/* 窄屏：纵向折叠（390px 检查目标） */
@media (max-width: 900px) {
  .tf-dual { grid-template-columns: 1fr; }
  .tf-input-grid { grid-template-columns: 1fr; }
  .tf-status dl { grid-template-columns: 1fr; }
  .tf-topbar h1 { font-size: 22px; }
}
````

### src/vite-env.d.ts
SHA-256: 65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5
Bytes: 38
Lines: 1

````ts
/// <reference types="vite/client" />
````

### src/worker/protocol.ts
SHA-256: 39ce3a2b03938b690a624d703f8d6e68c64018918464571f8f2227444a32e66b
Bytes: 3331
Lines: 100

````ts
/**
 * P029 TableFork — Worker 协议 (P029-T002)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §6.2、IMPLEMENTATION_PLAN.md §4.2。
 *
 * 请求（主线程 -> Worker）：
 *   { jobId, type: 'ANALYZE', payload: AnalyzeInput }
 *   { jobId, type: 'CANCEL' }
 * 回复（Worker -> 主线程）：
 *   { jobId, type: 'RESULT', data: AnalyzeResult }
 *   { jobId, type: 'ERROR', code: ErrorCode, message: string }
 *
 * 合同要点：
 * - 主线程仅采纳 jobId 与最新输入版本完全一致的结果；取消不覆盖新结果。
 * - ERROR 的 code 必须是 ErrorCode 枚举之一（见 src/core/types.ts）。
 * - 本文件只定义消息形状与类型守卫，不含 Worker 实现（tablefork.worker.ts 是 T010 的活）。
 */

import type { AnalyzeInput, AnalyzeResult, ErrorCode } from '../core/types';

/** 请求 Worker 分析一份输入。payload.schema 必须是 'tablefork.input/v1'。 */
export interface AnalyzeRequestMessage {
  jobId: string;
  type: 'ANALYZE';
  payload: AnalyzeInput;
}

/** 取消一个在途任务。取消后该 jobId 不得再产生 RESULT/ERROR 覆盖新输入的结果。 */
export interface CancelMessage {
  jobId: string;
  type: 'CANCEL';
}

/** 主线程 -> Worker 的全部消息。 */
export type WorkerRequestMessage = AnalyzeRequestMessage | CancelMessage;

/** Worker 分析成功，返回一份 schema 为 'tablefork.report/v1' 的报告。 */
export interface WorkerResultMessage {
  jobId: string;
  type: 'RESULT';
  data: AnalyzeResult;
}

/** Worker 分析失败（无效输入 / 不支持 / 取消 / 超限）。code 为枚举错误码。 */
export interface WorkerErrorMessage {
  jobId: string;
  type: 'ERROR';
  code: ErrorCode;
  message: string;
}

/** Worker -> 主线程的全部消息。 */
export type WorkerResponseMessage = WorkerResultMessage | WorkerErrorMessage;

/** 双向全部 Worker 消息（请求 + 回复）。 */
export type WorkerMessage = WorkerRequestMessage | WorkerResponseMessage;

/** 判定未知值是否为发往 Worker 的请求消息（ANALYZE 带 payload，CANCEL 不带）。 */
export function isWorkerRequestMessage(value: unknown): value is WorkerRequestMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { jobId?: unknown; type?: unknown; payload?: unknown };
  if (typeof candidate.jobId !== 'string') {
    return false;
  }
  if (candidate.type === 'CANCEL') {
    return true;
  }
  return (
    candidate.type === 'ANALYZE' &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null
  );
}

/** 判定未知值是否为 Worker 发回的回复消息（RESULT 带 data，ERROR 带枚举 code）。 */
export function isWorkerResponseMessage(value: unknown): value is WorkerResponseMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as {
    jobId?: unknown;
    type?: unknown;
    data?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (typeof candidate.jobId !== 'string') {
    return false;
  }
  if (candidate.type === 'RESULT') {
    return typeof candidate.data === 'object' && candidate.data !== null;
  }
  return (
    candidate.type === 'ERROR' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string'
  );
}
````

### src/worker/tablefork.worker.ts
SHA-256: b2a87bac70f2621d3da91cb604ccc8ee76418aecfb85ab0dab6232323ee5a6d0
Bytes: 8181
Lines: 202

````ts
/**
 * P029 TableFork — 唯一 Worker (P029-T010)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §6.2（Worker 协议 jobId 合同）、
 * IMPLEMENTATION_PLAN.md §4.2（JSON 与 worker 失败合同）、
 * src/worker/protocol.ts（消息形状与类型守卫，只读）。
 *
 * 协议：
 * - 收 { jobId, type: 'ANALYZE', payload } → 调公共内核 analyze()
 *   回 { jobId, type: 'RESULT', data }；无效输入回
 *   { jobId, type: 'ERROR', code, message }，code 必须是 ErrorCode 枚举之一。
 * - 收 { jobId, type: 'CANCEL' } → 取消在途任务：该 jobId 此后不得再产生
 *   RESULT/ERROR；已排队但未执行的同 jobId 分析也被压住。
 * - 连续两个 ANALYZE：只有最新 job 的结果被采纳（版本号守卫，见 J-T010-2）。
 *
 * 本文件是全项目唯一的 Worker 文件（DoD：禁止偷偷加入额外 Worker）。
 * UI 接入 Worker 是 T013 的集成任务；本卡不改 src/ui/* 与 src/main.tsx，
 * UI 目前在主线程直调 analyze() 的现状保持不变。
 */

import { analyze } from '../core/report';
import {
  ERROR_CODES,
  isTableForkError,
  type ErrorCode,
} from '../core/types';
import type { WorkerResponseMessage } from './protocol';

/** Worker 回复的投递口（浏览器里是 self.postMessage；测试里是收集函数）。 */
export type WorkerPostMessage = (message: WorkerResponseMessage) => void;

/**
 * 一个 ANALYZE 请求在入队后、执行前的让步：把分析推迟到下一个
 * macrotask 再执行。见 J-T010-2。
 */
function yieldToMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * 创建一个纯函数消息处理器（不依赖 DOM/Worker 全局，便于 Vitest 测试）。
 *
 * 每次调用返回的处理器自带独立状态（最新 jobId、版本号、已取消集合），
 * 多个处理器之间互不干扰；浏览器接线只创建一个（见文件底部）。
 *
 * @param postMessage 回复投递口；处理器只通过它发 RESULT/ERROR，绝不
 *   直接碰 self / postMessage 全局。
 * @returns 异步消息处理函数：对每条入站消息返回 Promise<void>。
 */
export function createWorkerMessageHandler(
  postMessage: WorkerPostMessage,
): (message: unknown) => Promise<void> {
  /** 最新 ANALYZE 的 jobId；RESULT/ERROR 只当 jobId 仍是它时才投递。 */
  let latestJobId: string | null = null;
  /** 每次 ANALYZE 递增的版本号；入队时快照，执行后比对，旧版本丢弃。 */
  let latestGeneration = 0;
  /** 已取消的 jobId；CANCEL 后该 jobId 不得再产生 RESULT/ERROR。 */
  const cancelled = new Set<string>();

  /** 只有 job 仍是最新且未被取消时才投递回复；否则静默丢弃。 */
  function postIfCurrent(
    jobId: string,
    generation: number,
    message: WorkerResponseMessage,
  ): void {
    if (generation !== latestGeneration) {
      return;
    }
    if (jobId !== latestJobId) {
      return;
    }
    if (cancelled.has(jobId)) {
      return;
    }
    postMessage(message);
  }

  return async function handleWorkerMessage(message: unknown): Promise<void> {
    if (typeof message !== 'object' || message === null) {
      // 没有 jobId 可回：无处投递，按协议静默丢弃（不抛错、不回消息）。
      return;
    }
    const candidate = message as { jobId?: unknown; type?: unknown; payload?: unknown };
    if (typeof candidate.jobId !== 'string' || candidate.jobId === '') {
      // 同上：jobId 不是非空字符串，无法按协议回 ERROR，静默丢弃。
      return;
    }
    const jobId: string = candidate.jobId;

    if (candidate.type === 'CANCEL') {
      // 取消是同步生效的：立即登记。版本号只在取消的正是当前最新 job
      // 时才 +1（使已入队未执行的它在执行后被守卫丢弃）；取消一个
      // 早已被取代的旧 job 时绝不碰版本号，否则会误杀最新 job 的结果。
      cancelled.add(jobId);
      if (latestJobId === jobId) {
        latestGeneration += 1;
        latestJobId = null;
      }
      return;
    }

    if (candidate.type !== 'ANALYZE') {
      // 未知 type：按无效输入回 ERROR（jobId 已知，code 用兜底桶，见 J-T010-1）。
      postMessage({
        jobId,
        type: 'ERROR',
        code: 'INVALID_RAGGED_GRID',
        message: `worker: unknown message type ${JSON.stringify(candidate.type)}`,
      });
      return;
    }

    // ANALYZE：登记为最新 job，清空该 jobId 的旧取消记录（jobId 复用时，
    // 新的分析不应被上一轮的 CANCEL 压住），快照版本号，然后让步。
    latestJobId = jobId;
    latestGeneration += 1;
    const generation = latestGeneration;
    cancelled.delete(jobId);

    // J-T010-2：让步一个 macrotask 再执行 analyze()。analyze() 本身是
    // 同步完成的 async 函数（体内无 await）；若不让步，RESULT 会在同
    // 一个 microtask 检查点发出，抢在随后到达的 CANCEL / 新 ANALYZE
    // 之前，使取消与竞态守卫在真实浏览器里永远观测不到。让步后，
    // 同一任务里接连 post 的 CANCEL / ANALYZE 先被处理，旧 job 在
    // 执行后被版本号守卫或取消集合压住。代价约 1 个定时器 tick。
    await yieldToMacrotask();

    // 让步后再次确认：若期间被取消或被更新的 ANALYZE 取代，直接返回，
    // 不执行 analyze()（省一次无用计算，也保证不产生任何回复）。
    if (generation !== latestGeneration || jobId !== latestJobId) {
      return;
    }
    if (cancelled.has(jobId)) {
      return;
    }

    try {
      // analyze() 自身做 schema/strategy/html 校验并抛 TableForkError；
      // payload 缺失/非对象时它同样抛错（failInput），不需在此另行校验。
      // FIX-02：传消息外层的 jobId 作 analyze() 第二参数——RESULT 的
      // data.jobId 与外层 jobId 一致（项目书 §9），且 jobId 为必填，
      // 不传空串（analyze 内 fail-closed 校验）。
      const data = await analyze(
        candidate.payload as Parameters<typeof analyze>[0],
        jobId,
      );
      postIfCurrent(jobId, generation, { jobId, type: 'RESULT', data });
    } catch (error: unknown) {
      if (isTableForkError(error)) {
        postIfCurrent(jobId, generation, {
          jobId,
          type: 'ERROR',
          code: error.code,
          message: error.message,
        });
        return;
      }
      // 非 TableForkError（内部不一致，如 analyze 的哈希复核抛普通 Error）：
      // 冻结枚举里没有 INTERNAL 码，沿用 J-T008-2 的兜底桶口径报
      // INVALID_RAGGED_GRID，消息正文写明这是内部错误而非输入问题。
      const message =
        error instanceof Error ? error.message : String(error);
      postIfCurrent(jobId, generation, {
        jobId,
        type: 'ERROR',
        code: 'INVALID_RAGGED_GRID',
        message: `worker: internal error (not an input error): ${message}`,
      });
    }
  };
}

/** 全部 7 个错误码的只读清单（供调用方/测试穷尽检查；与 types.ts 一致）。 */
export { ERROR_CODES };
export type { ErrorCode };

/**
 * 浏览器接线（文件底部唯一碰 self 的地方）。
 *
 * `typeof self !== 'undefined'` 守卫使本模块在 Node/Vitest 里 import 时
 * 不接线（Node 里 self 未定义）；再加 postMessage 是函数的检查，防止
 * 在非 Worker 的浏览器主线程环境里误挂 onmessage。真实 Worker 里
 * self.postMessage 存在，接线生效。
 */
if (
  typeof self !== 'undefined' &&
  typeof (self as unknown as { postMessage?: unknown }).postMessage ===
    'function'
) {
  const workerSelf = self as unknown as {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage: (message: WorkerResponseMessage) => void;
  };
  const handleMessage = createWorkerMessageHandler((message) =>
    workerSelf.postMessage(message),
  );
  workerSelf.onmessage = (event: MessageEvent<unknown>) => {
    void handleMessage(event.data);
  };
}
````

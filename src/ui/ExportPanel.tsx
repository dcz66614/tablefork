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

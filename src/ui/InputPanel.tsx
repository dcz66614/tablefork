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

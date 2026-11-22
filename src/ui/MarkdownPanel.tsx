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

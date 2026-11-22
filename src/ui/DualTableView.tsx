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

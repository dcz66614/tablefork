/**
 * P029 TableFork — 覆盖网格 (P029-T003)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §3.2（网格形式定义）、§3.1（输入上限）；
 * IMPLEMENTATION_PLAN.md §4.1（流程：parseValidatedTable → buildGrid → buildHeaderPaths）。
 *
 * 输入 parseValidatedTable 的 ParsedTable，按 DOM 序逐行放置单元格：
 * 每个单元格的原点列是该行从左至右第一个未占用列（§3.2），覆盖矩形
 * S_i = [r_i, r_i+h_i) × [x_i, x_i+w_i)。
 *
 * 合法性（全部显式拒绝，不猜测、不回退）：
 * - 行数 1–32、列数 1–12、DOM 单元格 ≤128，超限报 OVER_SIZE（parse.ts 已做
 *   行/格数初查，此处对直接传入的手工 ParsedTable 再做一次防御性复查）。
 * - rowspan 越过最后一行、或覆盖行跨越 thead/tbody 节边界，报 INVALID_SPAN。
 * - 任一覆盖槽已被占用，报 INVALID_GRID_OVERLAP（附首个重叠槽坐标与双方来源）。
 * - 放置完成后每行必须从列 0 连续覆盖到总列数减一；缺失格、中间空洞，
 *   一律报 INVALID_RAGGED_GRID（附首个缺失槽坐标）。
 * - 无跨度的空值格（文本为空字符串）合法存在；整行被上方 rowspan 覆盖
 *   的空 <tr> 合法（该行无 DOM 单元格但全部槽位已被占用）。
 *
 * cellId：按原点行、原点列、DOM 序稳定排序后赋 c00、c01、…（超过 99 为 c100…，
 * 即 `c` + 序号左补零到两位）。数值一律以 string 携带，本模块不产生任何 Number
 * 形式的单元格文本（span/坐标是结构整数，不是数值内容）。
 */

import { MAX_COLS, MAX_DOM_CELLS, MAX_ROWS, type Cell } from './index';
import { fail, type ParsedTable } from './parse';

/** 覆盖网格结果：排序后的 Cell、每槽的归属 cellId、行列数。 */
export interface GridResult {
  /** 按 (原点行, 原点列, DOM 序) 排序的单元格，id 已赋为 c00、c01、… */
  cells: Cell[];
  /** slotOwner[r][x] = 覆盖槽位 (r, x) 的单元格 id；维度 rows × cols。 */
  slotOwner: string[][];
  /** 实际行数（<tr> 数）。 */
  rows: number;
  /** 总列数（所有单元格原点列 + colspan 的最大值）。 */
  cols: number;
}

interface Placed {
  cell: ParsedTable['cells'][number];
  row: number;
  col: number;
  id: string;
}

/**
 * 由 ParsedTable 构建覆盖网格。
 * 失败抛 TableForkInputError（code 必为冻结枚举之一），不返回部分网格。
 */
export function buildGrid(parsed: ParsedTable): GridResult {
  const rowCount = parsed.rows.length;
  if (rowCount < 1 || rowCount > MAX_ROWS) {
    fail('OVER_SIZE', `table has ${rowCount} rows; the limit is 1–${MAX_ROWS}`);
  }
  if (parsed.cells.length > MAX_DOM_CELLS) {
    fail('OVER_SIZE', `table has ${parsed.cells.length} DOM cells; the limit is ${MAX_DOM_CELLS}`);
  }

  // 占用表：只开 MAX_COLS 宽；超宽在放置时即报 OVER_SIZE。
  const occupied: boolean[][] = Array.from({ length: rowCount }, () =>
    new Array<boolean>(MAX_COLS).fill(false),
  );
  const ownerIdx: number[][] = Array.from({ length: rowCount }, () =>
    new Array<number>(MAX_COLS).fill(-1),
  );
  const placed: Placed[] = [];

  for (let r = 0; r < rowCount; r++) {
    const row = parsed.rows[r];
    for (const cell of row.cells) {
      // 原点列：该行从左至右第一个未占用列（§3.2）。
      let x = 0;
      while (x < MAX_COLS && occupied[r][x]) x++;
      if (x >= MAX_COLS) {
        fail(
          'OVER_SIZE',
          `row ${r} already covers all ${MAX_COLS} columns, leaving no room for the cell at DOM #${cell.domIndex}`,
        );
      }
      const lastRow = r + cell.rowSpan - 1;
      if (lastRow >= rowCount) {
        fail(
          'INVALID_SPAN',
          `cell at row ${r} (DOM #${cell.domIndex}) has rowspan=${cell.rowSpan} extending beyond the last row ${rowCount - 1}`,
        );
      }
      // 不可跨 thead/tbody 边界：覆盖的每一行必须与该单元格同节。
      for (let rr = r; rr <= lastRow; rr++) {
        if (parsed.rows[rr].section !== cell.section) {
          fail(
            'INVALID_SPAN',
            `cell at row ${r} column ${x} (DOM #${cell.domIndex}, ${cell.section}) has rowspan=${cell.rowSpan} crossing into a ${parsed.rows[rr].section} row ${rr}`,
          );
        }
      }
      if (x + cell.colSpan > MAX_COLS) {
        fail(
          'OVER_SIZE',
          `cell at row ${r} column ${x} (DOM #${cell.domIndex}) has colspan=${cell.colSpan}, exceeding the ${MAX_COLS}-column limit`,
        );
      }
      // 重叠：矩形内任一槽已被占用即拒绝，报首个重叠槽。
      for (let rr = r; rr <= lastRow; rr++) {
        for (let xx = x; xx < x + cell.colSpan; xx++) {
          if (occupied[rr][xx]) {
            const other = placed[ownerIdx[rr][xx]];
            fail(
              'INVALID_GRID_OVERLAP',
              `cell at row ${r} column ${x} (DOM #${cell.domIndex}) overlaps slot (${rr},${xx}) already occupied by the cell at row ${other.row} column ${other.col} (DOM #${other.cell.domIndex})`,
            );
          }
        }
      }
      for (let rr = r; rr <= lastRow; rr++) {
        for (let xx = x; xx < x + cell.colSpan; xx++) {
          occupied[rr][xx] = true;
          ownerIdx[rr][xx] = placed.length;
        }
      }
      placed.push({ cell, row: r, col: x, id: '' });
    }
  }

  // 总列数 = 所有单元格右沿的最大值；无单元格时为 0（行数 ≥1 但无格，属超限）。
  let totalCols = 0;
  for (const p of placed) {
    totalCols = Math.max(totalCols, p.col + p.cell.colSpan);
  }
  if (totalCols < 1) {
    fail('OVER_SIZE', 'table has no columns; the limit is 1–12 columns');
  }
  if (totalCols > MAX_COLS) {
    fail('OVER_SIZE', `table has ${totalCols} columns; the limit is ${MAX_COLS}`);
  }

  // Ragged：每行必须从列 0 连续覆盖到总列数减一，报首个缺失槽。
  for (let r = 0; r < rowCount; r++) {
    for (let x = 0; x < totalCols; x++) {
      if (!occupied[r][x]) {
        fail(
          'INVALID_RAGGED_GRID',
          `row ${r} has no cell covering column ${x} (table has ${totalCols} columns); coverage must run continuously from column 0 to column ${totalCols - 1}`,
        );
      }
    }
  }

  // cellId：按 (原点行, 原点列, DOM 序) 稳定排序后赋 c00、c01、…。
  const sorted = [...placed].sort(
    (a, b) => a.row - b.row || a.col - b.col || a.cell.domIndex - b.cell.domIndex,
  );
  sorted.forEach((p, i) => {
    p.id = `c${String(i).padStart(2, '0')}`;
  });

  const cells: Cell[] = sorted.map((p) => ({
    id: p.id,
    row: p.row,
    col: p.col,
    rowSpan: p.cell.rowSpan,
    colSpan: p.cell.colSpan,
    role: p.cell.role,
    scope: p.cell.scope,
    text: p.cell.text,
    section: p.cell.section,
  }));

  const slotOwner: string[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const line: string[] = [];
    for (let x = 0; x < totalCols; x++) {
      line.push(placed[ownerIdx[r][x]].id);
    }
    slotOwner.push(line);
  }

  return { cells, slotOwner, rows: rowCount, cols: totalCols };
}

/**
 * P029 TableFork — 明示标题路径 (P029-T003)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §3.3（标题路径语义）、§5.4（交接稿示例）；
 * IMPLEMENTATION_PLAN.md §4.1（流程：… → buildHeaderPaths）。
 *
 * 规则（只认已声明的标题，绝不编造）：
 * - 列标题：对列槽 x，在 thead 中按行由上至下取覆盖 x 的所有非空 th 文本。
 *   同一 cellId 的延展槽在路径中只出现一次（按 cellId 去重）。
 *   thead 中的 td 不是标题；空文本 th 不产生路径项。
 * - 行标题：对行槽 r，在 tbody 的该行从左至右取拥有 scope="row" 的非空 th。
 *   rowspan 延续行仍使用同一来源 cellId，但不生成重复文本（按 cellId 去重，
 *   排序按列从左至右——延续行的来源格可能原点行更早，不能按原点行排）。
 *   tbody 中无 scope 的 th 不是行标题（S0 勘误 P1-01：不得用首列数据值充当
 *   行标题）；thead 行的行路径恒为空数组。
 * - headerStatus：行、列路径任一缺失即 'UNKNOWN'，两者齐全才 'KNOWN'。
 *   缺失标题时路径为空数组，调用方（T008 records.ts）写 '?'，此处不写问号、
 *   不编造任何标题文本。
 * - 跨多行/多列、不同槽位标题路径不同的 td，本模块不强行压成一条记录：
 *   本函数按槽输出路径，逐槽分歧的合并与 SHARED_SOURCE_CELL 标注是 T008 的活。
 *
 * 本函数是纯函数：输入 GridResult，不读 HTML，不抛错（非法输入已在
 * parseValidatedTable / buildGrid 拒绝）。
 */

import type { HeaderStatus } from './index';
import type { GridResult } from './grid';

/** 单个槽位的标题路径：行/列路径数组与已知状态。 */
export interface SlotHeaderPaths {
  row: number;
  col: number;
  rowHeaders: string[];
  colHeaders: string[];
  headerStatus: HeaderStatus;
}

/**
 * 由行、列标题路径判定已知状态：两者齐全为 'KNOWN'，任一缺失为 'UNKNOWN'。
 * 供 T008 的 SlotFact 复用，保持口径一致。
 */
export function headerStatusFor(rowHeaders: string[], colHeaders: string[]): HeaderStatus {
  return rowHeaders.length > 0 && colHeaders.length > 0 ? 'KNOWN' : 'UNKNOWN';
}

/**
 * 对网格的每一个槽位 (r, x) 计算行标题路径与列标题路径。
 * 返回 rows × cols 的二维数组，下标与 grid.slotOwner 对齐。
 */
export function buildHeaderPaths(grid: GridResult): SlotHeaderPaths[][] {
  const { cells, rows, cols } = grid;

  // 列路径：逐列扫描 thead th（cells 已按 (行, 列, DOM 序) 排，即由上至下）。
  const colPaths: string[][] = [];
  for (let x = 0; x < cols; x++) {
    const path: string[] = [];
    const seen = new Set<string>();
    for (const cell of cells) {
      if (cell.section !== 'thead' || cell.role !== 'TH') continue;
      if (cell.text === '') continue;
      if (cell.col <= x && x < cell.col + cell.colSpan && !seen.has(cell.id)) {
        seen.add(cell.id);
        path.push(cell.text);
      }
    }
    colPaths.push(path);
  }

  // 行路径：逐行取覆盖该行的 tbody th scope="row"，按列从左至右。
  const rowPaths: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const path: string[] = [];
    const seen = new Set<string>();
    const covering = cells
      .filter(
        (cell) =>
          cell.section === 'tbody' &&
          cell.role === 'TH' &&
          cell.scope === 'row' &&
          cell.text !== '' &&
          cell.row <= r &&
          r < cell.row + cell.rowSpan,
      )
      .sort((a, b) => a.col - b.col);
    for (const cell of covering) {
      if (!seen.has(cell.id)) {
        seen.add(cell.id);
        path.push(cell.text);
      }
    }
    rowPaths.push(path);
  }

  const out: SlotHeaderPaths[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: SlotHeaderPaths[] = [];
    for (let x = 0; x < cols; x++) {
      const rowHeaders = [...rowPaths[r]];
      const colHeaders = [...colPaths[x]];
      line.push({
        row: r,
        col: x,
        rowHeaders,
        colHeaders,
        headerStatus: headerStatusFor(rowHeaders, colHeaders),
      });
    }
    out.push(line);
  }
  return out;
}

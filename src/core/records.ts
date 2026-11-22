/**
 * P029 TableFork — 逐槽来源证据 (P029-T008)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §5.4（逐格交接文本）、§3.3
 * （标题路径语义）、§6.1（SlotFact 权威字段）；IMPLEMENTATION_PLAN.md
 * §4.1（流程：… → renderFacts）、§6 的 P029-T008 卡。
 *
 * 规则（只认已声明的标题，绝不编造）：
 * - 对每个 td 占用的槽位出一条 SlotFact（§5.4 / §3.3）：跨多行/多列的
 *   td 不压成一条记录；同一来源格占用的多个槽位各出一条，共享同一
 *   cellId——逐槽记录本身即表达“共享来源格”，SlotFact 冻结字段里没有
 *   另设 SHARED_SOURCE_CELL 字段的位置，故不在此加字段（见 J-T008-4）。
 * - value 永远是字符串，绝不转 Number（计划 §4.2：17 位 ID 精度问题）。
 *   本模块不解析、不 trim 之外的任何改写：value 就是 grid 中该格的
 *   text 原样（parse.ts 已做实体解码与空白折叠）。
 * - 行标题来源仅限 §3.3 的 tbody th scope=row（headers.ts 已按此算出
 *   路径）；行标题/列标题缺失时路径为空数组，序列化时写 '?'，不得靠
 *   启发式编造，不得用首列数据值充当行标题（项目书 v1.0.1 勘误）。
 * - 标题路径用 ' > ' 连接；行列坐标为 0-based 网格坐标。
 *
 * 本模块是纯函数：无 Node 专属调用、无随机、无时间、无 I/O。
 * 不 import witness.ts（不依赖哈希）；不改任何上游文件。
 */

import type { SlotFact } from './index';
import type { GridResult } from './grid';
import { buildHeaderPaths } from './headers';

/** 标题缺失时交接文本中的占位符（§5.4：写 '?'，不得编造）。 */
export const UNKNOWN_TITLE = '?' as const;

/**
 * 由覆盖网格生成逐槽 SlotFact（§6.1 权威字段）。
 *
 * - 只对 role 为 TD 的单元格占用的槽位出记录；th 槽位不出事实行
 *   （th 是标题本身，不是数据值）。
 * - 行主序（row 递增，row 内 col 递增），确定性顺序。
 * - 每个事实行的 rowHeaders/colHeaders 取自 buildHeaderPaths 的逐槽
 *   路径（已按 §3.3 去重：同一 cellId 的延展槽在路径中只出现一次）；
 *   headerStatus 由 headers.ts 的同一口径判定（任一路径缺失即
 *   'UNKNOWN'，两者齐全才 'KNOWN'）。
 * - value 为来源格的 text 原样字符串；跨槽共享的来源格在每个槽位
 *   上重复同一字符串值（这是逐槽事实，不是复制错误）。
 */
export function buildSlotFacts(grid: GridResult): SlotFact[] {
  const paths = buildHeaderPaths(grid);
  const byId = new Map(grid.cells.map((cell) => [cell.id, cell]));
  const facts: SlotFact[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = byId.get(grid.slotOwner[r][x]);
      if (cell === undefined || cell.role !== 'TD') {
        continue;
      }
      const slotPaths = paths[r][x];
      facts.push({
        row: r,
        col: x,
        cellId: cell.id,
        rowHeaders: [...slotPaths.rowHeaders],
        colHeaders: [...slotPaths.colHeaders],
        headerStatus: slotPaths.headerStatus,
        value: cell.text,
      });
    }
  }
  return facts;
}

/**
 * 单条 SlotFact 的 §5.4 交接文本序列化。
 *
 * 格式：`[R{row}C{col} source={cellId}] 行标题: {行路径或 ?} | 列标题: {列路径或 ?} | 数值: {value}`
 * - 行列坐标为 0-based 网格坐标（§6.3 例：120 在 (2,1)，故 R2C1）。
 * - 标题路径用 ' > ' 连接；任一路径为空数组时该侧写 '?'。
 * - 数值原样输出（字符串，不转 Number，不加引号）。
 */
export function formatSlotFact(fact: SlotFact): string {
  const rowTitle = fact.rowHeaders.length > 0 ? fact.rowHeaders.join(' > ') : UNKNOWN_TITLE;
  const colTitle = fact.colHeaders.length > 0 ? fact.colHeaders.join(' > ') : UNKNOWN_TITLE;
  return (
    `[R${fact.row}C${fact.col} source=${fact.cellId}] ` +
    `行标题: ${rowTitle} | 列标题: ${colTitle} | 数值: ${fact.value}`
  );
}

/**
 * 整份交接稿：每条事实一行，按行主序，用 LF 连接，末尾不加换行。
 * 空 facts 返回空字符串（不凭空产生一行）。
 */
export function formatSlotFacts(facts: SlotFact[]): string {
  return facts.map((fact) => formatSlotFact(fact)).join('\n');
}

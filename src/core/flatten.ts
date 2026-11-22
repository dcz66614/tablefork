/**
 * P029 TableFork — 双策略 Markdown 投影 (P029-T004)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §5.1（两个扁平化映射）、§6.3
 * （端到端样例）；IMPLEMENTATION_PLAN.md §4.1（流程：… → F_ORIGIN_EMPTY /
 * F_REPEAT_VALUE → …）。
 *
 * 冻结规则（§5.1）：
 * - 每个 HTML 原表行按 grid.slotOwner[r][x] 生成 `| cell |`；在第 1 行后插入
 *   Markdown 分隔行 `| --- |...|`；换行统一为 LF。
 * - 单元格文本：先转义反斜杠 `\` → `\\`，再转义管道 `|` → `\|`
 *   （顺序冻结：先转义反斜杠，否则后引入的 `\` 会被二次转义）。
 * - ORIGIN_EMPTY：槽位是单元格左上原点时显示 text，否则填空字符串。
 * - REPEAT_VALUE：该单元格覆盖的每个槽位都显示 text。
 * - 两种策略使用相同的网格，只在延展槽值填充上不同。
 * - 输入文本换行统一表示为单个空格是在 HTML 文本抽取阶段（parse.ts）
 *   完成的事；本模块只投影 grid 已规范化的 text，不再做空白折叠、
 *   不读 HTML、不抛错（非法输入已在 parse/grid 拒绝）。
 *
 * 本模块是纯函数：无随机、无时间、无环境依赖、无 I/O；同一输入连续
 * 100 次输出逐字节相同（见 tests/core/t004-temp.test.ts 的确定性测试）。
 *
 * 显式裁决（冻结规格未钉死的点，记录在案，供 T011 / 终审复核）：
 * J-T004-1（末行换行）：§5.1 “最后统一 LF 换行”读作“每个生成的行都以
 *   LF 终止”，即输出以单个 LF 结尾（末行后也有换行）。§6.3 的四行示例
 *   在本卡测试中按此口径逐字节钉死（含末尾 LF）。若 T011 / 独立 Oracle
 *   认定应为“行间 LF 分隔、末行无换行”，改为 `lines.join('\n')` 即可，
 *   是一行改动；但在改动前本口径为冻结行为。
 * J-T004-2（空值格）：空字符串单元格在两种策略下都生成空槽位
 *   （`|  |` 中的空段），ORIGIN_EMPTY 的延展格与空值原点格在输出中
 *   不可区分——这是 §5.1 定义的 F 的信息损失本身，不是本模块的缺陷。
 * J-T004-3（分隔行）：分隔行固定为每列一个 `---`（`| --- | --- |`），
 *   与列标题内容无关；即使第 1 行是 tbody 数据行也照此插入（§5.1
 *   只说“在第 1 行后插入”，不分节）。
 * J-T004-4（转义范围）：只转义 `\` 与 `|` 两个字符；`*`、`_`、反引号、
 *   `#` 等其他 Markdown 元字符不转义（§5.1 只冻结这两项）。
 */

import type { Strategy } from './index';
import type { GridResult } from './grid';

/**
 * 转义单个单元格文本：先反斜杠、后管道（§5.1 冻结顺序）。
 * 纯函数；不做空白折叠（那是 parse.ts 的职责）。
 */
export function escapeMarkdownCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

/**
 * 按策略把 canonical grid 投影为 Markdown 文本（§5.1 的 F_p）。
 * 行以 LF 终止（含末行，见 J-T004-1）；分隔行插在第 1 行之后。
 */
export function flattenGrid(grid: GridResult, strategy: Strategy): string {
  const byId = new Map(grid.cells.map((cell) => [cell.id, cell]));
  const lines: string[] = [];
  for (let r = 0; r < grid.rows; r++) {
    const rendered: string[] = [];
    for (let x = 0; x < grid.cols; x++) {
      const cell = byId.get(grid.slotOwner[r][x]);
      // slotOwner 由 buildGrid 保证指向已排序 cells 中的有效 id；
      // 防御性兜底：未知 id 视为空槽位（不抛错，不编造文本）。
      if (cell === undefined) {
        rendered.push('');
        continue;
      }
      const isOrigin = cell.row === r && cell.col === x;
      if (strategy === 'REPEAT_VALUE' || isOrigin) {
        rendered.push(escapeMarkdownCell(cell.text));
      } else {
        rendered.push('');
      }
    }
    lines.push(`| ${rendered.join(' | ')} |`);
    if (r === 0) {
      lines.push(`| ${new Array<string>(grid.cols).fill('---').join(' | ')} |`);
    }
  }
  if (lines.length === 0) return '';
  return `${lines.join('\n')}\n`;
}

/** ORIGIN_EMPTY 策略的 F（§5.1 策略 1：原点留值、延展格留空）。 */
export function flattenOriginEmpty(grid: GridResult): string {
  return flattenGrid(grid, 'ORIGIN_EMPTY');
}

/** REPEAT_VALUE 策略的 F（§5.1 策略 2：每个覆盖格复制原值）。 */
export function flattenRepeatValue(grid: GridResult): string {
  return flattenGrid(grid, 'REPEAT_VALUE');
}

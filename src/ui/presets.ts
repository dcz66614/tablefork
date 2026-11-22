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

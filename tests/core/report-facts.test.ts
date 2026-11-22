/**
 * P029 TableFork — 正式回归测试（P029-T013 接管自 T011-FIX-01 临时测试）
 *
 * 原临时文件 tests/core/t011fix01-temp.test.ts 已按 T011 接管惯例改名
 * 为正式测试（模块名 report-facts），内容一字未改、测试数不变（5 条）。
 * 回归测试：P029-T011-FIX-01 的两处 Oracle 修复在 TS 侧的行为锚点
 * （本文件只测 TS analyze()；Oracle 侧的同一行为由 `npm run oracle`
 * 49/49 与 /tmp 两侧对照脚本覆盖，见 artifacts/logs/T011-FIX-01.txt）。
 *
 * - (A) facts 定 TD-only（项目书 §5.4“对每个 td 占用的槽位”）：
 *   G02（thead 两 th + tbody 两 td）的 facts 为 2 条且均为 td。
 * - (B) 未知属性忽略（项目书 §3.1“有效标签”只限标签）：
 *   `<td data-x>`、`<table class>`、`<td style>` 三例 analyze() 均接受。
 * - 保留拒绝：headers 属性仍报 UNSUPPORTED_HEADER_SEMANTICS。
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/report';

const INPUT = { schema: 'tablefork.input/v1', strategy: 'ORIGIN_EMPTY' } as const;

describe('T011-FIX-01 (A): facts 只对 td 占用的槽位出记录', () => {
  it('G02 的 facts 为 2 条且均为 td（c02、c03），不含 th 槽 c00、c01', async () => {
    const result = await analyze({
      ...INPUT,
      html: '<table><thead><tr><th>名称</th><th>数量</th></tr></thead>'
        + '<tbody><tr><td>苹果</td><td>3</td></tr></tbody></table>',
    }, 'job-test-1');
    expect(result.facts).toHaveLength(2);
    expect(result.facts.map((f) => f.cellId)).toEqual(['c02', 'c03']);
    expect(result.facts.map((f) => `${f.row},${f.col}`)).toEqual(['1,0', '1,1']);
  });
});

describe('T011-FIX-01 (B): 未知属性被忽略，analyze() 接受', () => {
  it.each([
    ['<td data-x>', '<table><tbody><tr><td data-x="1">A</td><td>B</td></tr></tbody></table>'],
    ['<table class>', '<table class="x"><tbody><tr><td>A</td><td>B</td></tr></tbody></table>'],
    ['<td style>', '<table><tbody><tr><td style="color:red">A</td><td>B</td></tr></tbody></table>'],
  ])('%s 接受', async (_name, html) => {
    const result = await analyze({ ...INPUT, html }, 'job-test-1');
    expect(result.facts).toHaveLength(2);
  });
});

describe('T011-FIX-01: headers 属性仍报 UNSUPPORTED_HEADER_SEMANTICS', () => {
  it('headers 属性被拒绝（TS 与 Oracle 同码）', async () => {
    await expect(
      analyze({
        ...INPUT,
        html: '<table><tbody><tr><td headers="h1">A</td><td>B</td></tr></tbody></table>',
      }, 'job-test-1'),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_HEADER_SEMANTICS' });
  });
});

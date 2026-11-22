/**
 * P029-T012 — 性能测试用 32x12 固定合法表（deterministic, no randomness).
 *
 * 结构（PROJECT_BOOK.md v1.0.1 SS3.1/SS3.2, 32 行 x 12 列 = 384 格）:
 * - thead 2 行: row0 = <th rowspan=2>组</th> + <th colspan=6>上半年</th> +
 *   <th colspan=5>下半年</th> (3 DOM 格); row1 = 6 个 <th> + 5 个 <th> (11 DOM 格)。
 * - tbody 30 行 = 15 对: 每对 row A = <th scope=row rowspan=2>部门N</th> +
 *   <td colspan=6> + <td colspan=5> (3 DOM 格); row B = <td colspan=6> +
 *   <td colspan=5> (2 DOM 格, 第 0 列由 rowspan 覆盖)。
 * - DOM 单元格总数 = 14 + 15*5 = 89 (<= 128); 合并格 = 3 + 15*5 = 78;
 *   单格 = 11; UTF-8 字节数见 PERF_TABLE_META.bytes (生成时实测)。
 * - 文本全部为固定 CJK + 数字, 无随机、无 Date、无 Math.random。
 *
 * 本文件只含测试数据, 不含分析算法。同一 HTML 被 tests/e2e/performance.spec.ts
 * (浏览器 UI 路径) 与 /tmp/t012-perf-cli.mts (Node analyze() 对照) 共用,
 * 保证两边测的是同一张表。
 */

function buildPerfTableHtml(): string {
  const headRow0 =
    '<tr><th rowspan="2">组</th><th colspan="6">上半年</th><th colspan="5">下半年</th></tr>';
  let headRow1 = '<tr>';
  for (let i = 1; i <= 6; i++) headRow1 += `<th>上${i}月</th>`;
  for (let i = 1; i <= 5; i++) headRow1 += `<th>下${i}月</th>`;
  headRow1 += '</tr>';

  let body = '';
  for (let p = 1; p <= 15; p++) {
    body +=
      `<tr><th scope="row" rowspan="2">部门${p}</th>` +
      `<td colspan="6">部${p}上${p * 10 + 1}</td>` +
      `<td colspan="5">部${p}下${p * 10 + 2}</td></tr>`;
    body +=
      `<tr><td colspan="6">部${p}上${p * 10 + 3}</td>` +
      `<td colspan="5">部${p}下${p * 10 + 4}</td></tr>`;
  }
  return `<table><thead>${headRow0}${headRow1}</thead><tbody>${body}</tbody></table>`;
}

export const PERF_TABLE_HTML: string = buildPerfTableHtml();

export const PERF_TABLE_META = {
  rows: 32,
  cols: 12,
  slots: 384,
  domCells: 89,
  mergedCells: 78,
  singleCells: 11,
  bytes: new TextEncoder().encode(PERF_TABLE_HTML).length,
} as const;

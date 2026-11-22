/**
 * P029-T012 — 限定负载性能见证：32x12 合法表经 UI 的 analyze 路径跑 30 次。
 *
 * 表：tests/e2e/perf-table.ts 的固定表（32 行 x 12 列 = 384 格，89 DOM 格，
 * 78 合并格），与 Node CLI 对照跑同一张表、同一 analyze() 内核。
 *
 * 计时方法（诚实口径，见 artifacts/logs/T012-e2e.txt §6）：
 * 每次先点“清空内存”再重填同一张表，保证点击时旧结果已清除、状态栏
 * 从隐藏变可见；t0/t1 为页内 performance.now()，夹在“点击比较按钮”
 * 与“状态栏出现 CERTIFIED_COLLISION”之间。因此耗时含 Playwright 的
 * 点击派发 + React 渲染 + analyze() 计算 + expect 轮询的开销，是
 * UI 端到端耗时，不是纯内核耗时；纯内核对照见 T012-performance.json
 * 的 cli 字段（同一张表，Node 内 analyze() 循环 30 次）。
 * 分位数用 nearest-rank：p50 = 第 15 个顺序统计量，p95 = 第 29 个。
 */
import * as fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { PERF_TABLE_HTML, PERF_TABLE_META } from './perf-table';

test.setTimeout(180_000);

function quantileNearestRank(sorted: number[], q: number): number {
  const idx = Math.max(0, Math.ceil(q * sorted.length) - 1);
  return sorted[idx] as number;
}

test('performance: 32x12 table via UI analyze, 30 runs', async ({ page, browser }) => {
  await page.goto('/');
  // 预热 + 确认该表在 UI 路径下出 CERTIFIED_COLLISION（不计入 30 次）。
  await page.locator('#tf-html').fill(PERF_TABLE_HTML);
  await page.getByRole('button', { name: '比较并寻找反例' }).click();
  await expect(page.locator('.tf-status').getByText('CERTIFIED_COLLISION').first()).toBeVisible();

  const durations: number[] = [];
  for (let i = 0; i < 30; i++) {
    await page.getByRole('button', { name: '清空内存' }).click();
    await page.locator('#tf-html').fill(PERF_TABLE_HTML);
    const t0 = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: '比较并寻找反例' }).click();
    await expect(page.locator('.tf-status').getByText('CERTIFIED_COLLISION').first()).toBeVisible();
    const t1 = await page.evaluate(() => performance.now());
    durations.push(+(t1 - t0).toFixed(1));
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const stats = {
    n: durations.length,
    min: sorted[0],
    p50: quantileNearestRank(sorted, 0.5),
    p95: quantileNearestRank(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
  const out = {
    table: PERF_TABLE_META,
    strategy: 'ORIGIN_EMPTY',
    witness: 'CERTIFIED_COLLISION',
    browser: `Chromium ${browser.version()}`,
    path: 'UI analyze path: clear -> fill #tf-html -> click 比较并寻找反例 -> wait for CERTIFIED_COLLISION in .tf-status; t0/t1 = in-page performance.now()',
    runs_ms: durations,
    stats_ms: stats,
    target_p95_ms: 500,
    pass: stats.p95 <= 500,
  };
  fs.writeFileSync(
    'artifacts/logs/T012-perf-browser.json',
    `${JSON.stringify(out, null, 2)}\n`,
    'utf8',
  );
  expect(stats.p95).toBeLessThanOrEqual(500);
});

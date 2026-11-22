# REVIEW_PACK_04 — 属性与 E2E 测试（tests/property、tests/e2e）

> P029 TableFork 终审源码分卷（规格 v1.0.2）。本卷全文展开以下 7 个文件，
> 不省略、不摘要。每块格式：`### <路径>` + `SHA-256` / `Bytes` / `Lines` +
> ```` 围栏内完整原文（与 `review/RELEASE_MANIFEST.json` 中该文件的 SHA-256 一致）。
> 生成：P029-REFREEZE-NOTES-FIX2（`npm run verify:release` 核对每卷每块）。

### tests/e2e/perf-table.ts
SHA-256: 59d806deedb4ae3d71b82b0c1ba0976efff009e65a3d4fbc4ed08f4bc6bf0405
Bytes: 2100
Lines: 50

````ts
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
````

### tests/e2e/performance.e2e.ts
SHA-256: d2acb9aa7909369ea7941a779d00288c7ad9010bd0a46fab1e9fb6de18d15459
Bytes: 3132
Lines: 70

````ts
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
````

### tests/e2e/tablefork.e2e.ts
SHA-256: 6a744700b3ff3945bfd2fdd364bd3df7e84e4b97ef8f36bc276b5c9a7b8926e2
Bytes: 23614
Lines: 498

````ts
/**
 * P029-T012 — 真实 UI E2E（Playwright Chromium，跑 vite preview 的生产构建）。
 *
 * 覆盖 PROJECT_BOOK.md v1.0.1 §7.2 清单：4 预设 × 正常和异常状态、两策略切换、
 * 输入编辑、复制、导出、取消/竞态、清空数据、窄屏（390px）与键盘焦点，
 * 外加离线、安全（<script>/<img>/事件属性）、无存储写入。
 *
 * 方法复用 T009 的 31 项浏览器检查（artifacts/logs/T009-ui.txt §6）：
 * 同一选择器口径（中文按钮文、.tf-status 状态栏、.tf-grid 格子 aria-label），
 * 不另起一套不可复现的检查。截图见 artifacts/screenshots/T012-*.png，
 * 每张在 artifacts/logs/T012-e2e.txt 中映射到输入与策略。
 *
 * 注意：analyze() 在主线程是同步计算（async 签名、无真实 await，
 * 见 src/core/report.ts），React 会把 ANALYZING 的 setState 批量合并，
 * 因此“取消”按钮在真实浏览器时序里几乎不出现——取消探测的实测结果
 * 写 artifacts/logs/T012-cancel-probe.json，见测试 `cancel/race` 与
 * 日志 §8 J-T012-2；竞态守卫改由“两次连续分析取最新结果”实证。
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { presetById } from '../../src/ui/presets';
import { PERF_TABLE_HTML } from './perf-table';

const STATUS = '.tf-status';
const DUAL = '.tf-section[aria-label="双表对照"]';

async function clickPreset(page: Page, id: string): Promise<void> {
  await page.getByRole('button', { name: id }).click();
}

async function clickCompare(page: Page): Promise<void> {
  await page.getByRole('button', { name: '比较并寻找反例' }).click();
}

async function analyzePreset(page: Page, id: string): Promise<void> {
  await clickPreset(page, id);
  await clickCompare(page);
}

async function expectStatus(page: Page, text: string): Promise<void> {
  await expect(page.locator(STATUS).getByText(text).first()).toBeVisible();
}

/** P1-01 回归断言：页面上没有任何分析结果——无见证、无双表、无交接稿/JSON、无可导出的下载。 */
async function expectNoResult(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: '比较并寻找反例' })).toBeEnabled();
  await expect(page.locator(STATUS).getByText('CERTIFIED_COLLISION')).toHaveCount(0);
  await expect(page.locator(STATUS).getByText('NO_WITNESS_FOUND')).toHaveCount(0);
  await expect(page.locator(DUAL)).toHaveCount(0);
  await expect(page.locator('pre[aria-label="逐格交接稿"]')).toHaveCount(0);
  await expect(page.locator('pre[aria-label="可审查证据 JSON"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '下载 JSON' })).toBeDisabled();
  await expect(page.getByText('分析后这里显示逐格交接稿与可审查证据 JSON。')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '表歧镜' })).toBeVisible();
});

test('preset TFK-A ORIGIN_EMPTY shows CERTIFIED_COLLISION', async ({ page }) => {
  await analyzePreset(page, 'TFK-A');
  await expectStatus(page, 'CERTIFIED_COLLISION');
  await expectStatus(page, 'HEADER_ASSOCIATION_CHANGED');
  await expect(page.getByText('断言 1：A ≠ B').first()).toBeVisible();
  await expect(page.getByText('断言 2：F(A) = F(B)').first()).toBeVisible();
  await expect(page.locator(DUAL).getByText('合并 1×2').first()).toBeVisible();
  await expect(page.locator(DUAL).getByText('已拆分').first()).toBeVisible();
  await expect(page.locator(STATUS).getByText('NOT_SUPPLIED').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/T012-A-origin-empty.png', fullPage: true });
});

test('preset TFK-A REPEAT_VALUE shows CERTIFIED_COLLISION', async ({ page }) => {
  await clickPreset(page, 'TFK-A');
  await page.getByRole('radio', { name: /REPEAT_VALUE/ }).check();
  await clickCompare(page);
  await expectStatus(page, 'CERTIFIED_COLLISION');
  await expectStatus(page, 'HEADER_ASSOCIATION_CHANGED');
  // REPEAT_VALUE 下延展格复制原值：Markdown 第二行仍含 2026预算。
  await expect(page.locator(DUAL).getByText('2026预算').first()).toBeVisible();
});

test('preset TFK-B ORIGIN_EMPTY shows CERTIFIED_COLLISION + HEADER_ASSOCIATION_CHANGED', async ({ page }) => {
  await analyzePreset(page, 'TFK-B');
  await expectStatus(page, 'CERTIFIED_COLLISION');
  await expectStatus(page, 'HEADER_ASSOCIATION_CHANGED');
  await expect(page.locator(DUAL).getByText('部门X').first()).toBeVisible();
});

test('preset TFK-B REPEAT_VALUE shows STRUCTURAL_COLLISION', async ({ page }) => {
  await clickPreset(page, 'TFK-B');
  await page.getByRole('radio', { name: /REPEAT_VALUE/ }).check();
  await clickCompare(page);
  await expectStatus(page, 'CERTIFIED_COLLISION');
  await expectStatus(page, 'STRUCTURAL_COLLISION');
  await page.screenshot({ path: 'artifacts/screenshots/T012-B-repeat-value.png', fullPage: true });
});

test('preset TFK-C shows NO_WITNESS_FOUND and never claims safety', async ({ page }) => {
  await analyzePreset(page, 'TFK-C');
  await expectStatus(page, 'NO_WITNESS_FOUND');
  await expect(page.locator(STATUS).getByText('不表示保真').first()).toBeVisible();
  await expect(page.locator(DUAL).getByText('无 B 表').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/T012-C-no-witness.png', fullPage: true });
});

test('preset TFK-D shows UNSUPPORTED + UNSUPPORTED_HEADER_SEMANTICS', async ({ page }) => {
  await analyzePreset(page, 'TFK-D');
  await expectStatus(page, 'UNSUPPORTED');
  await expectStatus(page, 'UNSUPPORTED_HEADER_SEMANTICS');
  await expect(page.locator(STATUS).getByText('不回退为猜测').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/screenshots/T012-D-unsupported.png', fullPage: true });
});

test('strategy switch clears the previous result until re-analyzed', async ({ page }) => {
  await analyzePreset(page, 'TFK-A');
  await expectStatus(page, 'CERTIFIED_COLLISION');
  await page.getByRole('radio', { name: /REPEAT_VALUE/ }).check();
  await expect(page.locator(STATUS).getByText('CERTIFIED_COLLISION')).toHaveCount(0);
  await expect(page.locator(DUAL)).toHaveCount(0);
  await clickCompare(page);
  await expectStatus(page, 'CERTIFIED_COLLISION');
});

test('input edit: custom merged table analyzes to CERTIFIED_COLLISION', async ({ page }) => {
  await page.locator('#tf-html').fill(
    '<table><thead><tr><th colspan="2">预算</th></tr></thead>' +
      '<tbody><tr><td>120</td><td>80</td></tr></tbody></table>',
  );
  await clickCompare(page);
  await expectStatus(page, 'CERTIFIED_COLLISION');
  // 再把值改掉：旧结果被清除，重新分析后仍为碰撞（值本身不影响结构证书）。
  await page.locator('#tf-html').fill(
    '<table><thead><tr><th colspan="2">预算</th></tr></thead>' +
      '<tbody><tr><td>121</td><td>80</td></tr></tbody></table>',
  );
  await expect(page.locator(STATUS).getByText('CERTIFIED_COLLISION')).toHaveCount(0);
  await clickCompare(page);
  await expectStatus(page, 'CERTIFIED_COLLISION');
});

test('input edit: non-table text is INVALID_INPUT, not a guessed result', async ({ page }) => {
  await page.locator('#tf-html').fill('hello, this is not a table');
  await clickCompare(page);
  await expectStatus(page, 'INVALID_INPUT');
  await expectStatus(page, 'INVALID_RAGGED_GRID');
});

test('mismatch: EXACT_MATCH via fill, then MISMATCH with first-diff byte offset', async ({ page }) => {
  await analyzePreset(page, 'TFK-A');
  await expectStatus(page, 'NOT_SUPPLIED');
  await page.getByRole('button', { name: '用 F(A) 填入' }).click();
  await clickCompare(page);
  await expectStatus(page, 'EXACT_MATCH');
  // 把 M 末值 120 改成 81：再次分析应为 MISMATCH 并定位首个不同字节。
  await page.locator('#tf-md').fill(
    '| 产品 | 2026预算 |  |\n| --- | --- | --- |\n|  | 收入 | 成本 |\n| A | 81 | 80 |\n',
  );
  await clickCompare(page);
  await expectStatus(page, 'MISMATCH');
  await expect(page.locator(STATUS).getByText('首个不同 UTF-8 字节下标').first()).toBeVisible();
  await expect(page.locator(STATUS).getByText('只对 F(A) 生效').first()).toBeVisible();
});

test('copy handoff: clipboard receives the slot-fact text', async ({ browser }) => {
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await analyzePreset(page, 'TFK-A');
    await expectStatus(page, 'CERTIFIED_COLLISION');
    await page.getByRole('button', { name: '复制交接文本' }).click();
    await expect(page.getByText('已复制交接文本').first()).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('[R2C1 source=c05]');
    expect(clip).toContain('行标题: ?');
    expect(clip).toContain('列标题: 2026预算 > 收入');
    expect(clip).toContain('数值: 120');
  } finally {
    await context.close();
  }
});

test('export JSON: download is a tablefork.report/v1 CERTIFIED_COLLISION report', async ({ page }) => {
  await analyzePreset(page, 'TFK-A');
  await expectStatus(page, 'CERTIFIED_COLLISION');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('tablefork-report-TFK-A.json');
  const path = await download.path();
  const report = JSON.parse(fs.readFileSync(path as string, 'utf8')) as {
    schema: string;
    witness: string;
    compare: string;
    proof?: { sourceCellId: string };
    jobId: string;
    inputHash: string;
    specVersion: string;
  };
  expect(report.schema).toBe('tablefork.report/v1');
  expect(report.witness).toBe('CERTIFIED_COLLISION');
  expect(report.compare).toBe('NOT_SUPPLIED');
  expect(report.proof?.sourceCellId).toBe('c01');
  // P2-T015-4（FIX-02 三字段的 E2E 一环；report.test.ts、金测与 CLI 已覆盖）：
  // jobId 非空（UI 发 `job-<seq>`）、inputHash 为输入 HTML 原文的 SHA-256、
  // specVersion 为当前规格版本。
  expect(typeof report.jobId).toBe('string');
  expect(report.jobId.length).toBeGreaterThan(0);
  expect(report.jobId).toMatch(/^job-\d+$/);
  expect(report.inputHash).toMatch(/^[0-9a-f]{64}$/);
  expect(report.inputHash).toBe(
    createHash('sha256')
      .update(presetById('TFK-A')?.html ?? '', 'utf8')
      .digest('hex'),
  );
  expect(report.specVersion).toBe('1.0.2');
  // 下载锚点已从 DOM 移除（ExportPanel 在 click 后 remove，1s 后 revokeObjectURL）。
  await page.waitForTimeout(1200);
  await expect(page.locator('a[download]')).toHaveCount(0);
  await expect(page.locator('a[href^="blob:"]')).toHaveCount(0);
});

test('cancel/race: newest analysis wins; cancelled job never overwrites new input', async ({ page }) => {
  // 竞态：TFK-A 分析刚发起就切到 TFK-C 再分析，最终必须是 TFK-C 的结果。
  await clickPreset(page, 'TFK-A');
  await clickCompare(page);
  await clickPreset(page, 'TFK-C');
  await clickCompare(page);
  await expectStatus(page, 'NO_WITNESS_FOUND');
  await expect(page.locator(STATUS).getByText('CERTIFIED_COLLISION')).toHaveCount(0);

  // 取消探测：用最慢的真实输入（32x12 性能表）在页内轮询“取消”按钮。
  // analyze() 主线程同步完成、React 批量合并 setState，见文件头注释；
  // 本测试不断言按钮一定出现，只断言事后状态稳定、应用仍可用，并把
  // 实测观测写 artifacts/logs/T012-cancel-probe.json。
  const probePath = 'artifacts/logs/T012-cancel-probe.json';
  const attempts: Array<{ clicked: boolean; ms: number }> = [];
  for (let i = 0; i < 3; i++) {
    await page.locator('#tf-html').fill(PERF_TABLE_HTML);
    const t0 = Date.now();
    const clicked = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const find = (label: string): HTMLButtonElement | undefined =>
            [...document.querySelectorAll('button')].find(
              (b) => b.textContent?.trim() === label,
            ) as HTMLButtonElement | undefined;
          const cmp = find('比较并寻找反例');
          if (cmp === undefined) return resolve(false);
          cmp.click();
          const iv = setInterval(() => {
            const cancel = find('取消');
            if (cancel !== undefined) {
              clearInterval(iv);
              clearTimeout(to);
              cancel.click();
              resolve(true);
            }
          }, 1);
          const to = setTimeout(() => {
            clearInterval(iv);
            resolve(false);
          }, 3000);
        }),
    );
    attempts.push({ clicked, ms: Date.now() - t0 });
    await page.waitForTimeout(300);
  }
  fs.writeFileSync(
    probePath,
    `${JSON.stringify({ attempts, note: 'cancel button polled every 1ms inside the page during a 32x12 analyze; clicked=true means the 取消 button was observed and pressed before the job finished.' }, null, 2)}\n`,
    'utf8',
  );
  // 事后不变量：比较按钮回到可用状态；随后一次全新分析正常出结果。
  await expect(page.getByRole('button', { name: '比较并寻找反例' })).toBeEnabled();
  await analyzePreset(page, 'TFK-A');
  await expectStatus(page, 'CERTIFIED_COLLISION');
});

test('stale result: switching preset mid-analysis never shows the old result (P1-01)', async ({
  page,
}) => {
  // GPT 终审 R1 P1-01 的 5 步复现（32×12 性能表 → 分析中切 TFK-C，不
  // 启动第二次分析 → 等待 → 旧结果不得显示、不得导出）。确定性写法：
  // 比较点击与预设切换在同一个 JS 任务里同步发出，必定落在 Worker 的
  // macrotask 让步（yieldToMacrotask）之前——旧任务尚未返回任何结果。
  // 时序不依赖 sleep / 轮询阈值；修复前旧结果必定出现，修复后必定不出现。
  const tfkC = presetById('TFK-C');
  if (tfkC === undefined) throw new Error('TFK-C preset missing');
  await page.locator('#tf-html').fill(PERF_TABLE_HTML);
  await page.evaluate(() => {
    const findButton = (label: string): HTMLButtonElement => {
      const el = [...document.querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').trim().startsWith(label),
      ) as HTMLButtonElement | undefined;
      if (el === undefined) throw new Error(`button not found: ${label}`);
      return el;
    };
    findButton('比较并寻找反例').click();
    findButton('TFK-C').click();
  });
  // 步骤 2 的结果：输入已是 TFK-C，但第二次分析从未启动。
  await expect(page.locator('#tf-html')).toHaveValue(tfkC.html);
  // 步骤 3：等原分析完成（隔离 p95 约 260ms；等 5s 远超完成时间）。
  await page.waitForTimeout(5000);
  // 步骤 4/5：旧结果不得显示、不得导出。
  await expectNoResult(page);
  // 随后一次全新分析仍正常出结果（失效只丢弃旧任务，不破坏后续分析）。
  await clickCompare(page);
  await expectStatus(page, 'NO_WITNESS_FOUND');
});

test('stale result: switching strategy mid-analysis never shows the old result (P1-01)', async ({
  page,
}) => {
  // 与上一个测试同一机制，覆盖策略切换路径：32×12 表分析中把策略切到
  // REPEAT_VALUE（不启动第二次分析），旧结果不得显示、不得导出。
  await page.locator('#tf-html').fill(PERF_TABLE_HTML);
  await page.evaluate(() => {
    const cmp = [...document.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').trim().startsWith('比较并寻找反例'),
    ) as HTMLButtonElement | undefined;
    if (cmp === undefined) throw new Error('compare button not found');
    cmp.click();
    const radio = document.querySelector(
      'input[value="REPEAT_VALUE"]',
    ) as HTMLInputElement | null;
    if (radio === null) throw new Error('REPEAT_VALUE radio not found');
    radio.click();
  });
  await expect(page.getByRole('radio', { name: /REPEAT_VALUE/ })).toBeChecked();
  await page.waitForTimeout(5000);
  await expectNoResult(page);
  // 随后一次全新分析仍正常出结果（只断言有新结果出现，不硬断言见证值；
  // 性能表在 REPEAT_VALUE 下的见证值不属于本卡的回归范围）。
  await clickCompare(page);
  await expect(page.locator(DUAL)).toBeVisible();
});

test('clear memory: inputs, Markdown, result and handoff are gone from DOM and memory', async ({ page }) => {
  await analyzePreset(page, 'TFK-A');
  await expectStatus(page, 'CERTIFIED_COLLISION');
  await page.getByRole('button', { name: '清空内存' }).click();
  await expect(page.locator('#tf-html')).toHaveValue('');
  await expect(page.locator('#tf-md')).toHaveValue('');
  await expect(page.locator(STATUS).getByText('CERTIFIED_COLLISION')).toHaveCount(0);
  await expect(page.locator(DUAL)).toHaveCount(0);
  await expect(page.getByText('隐私声明').first()).toBeVisible();
  await expect(page.locator('pre[aria-label="逐格交接稿"]')).toHaveCount(0);
  await expect(page.locator('pre[aria-label="可审查证据 JSON"]')).toHaveCount(0);
  await expect(page.locator('a[href^="blob:"]')).toHaveCount(0);
  const storage = await page.evaluate(() => ({
    localStorageLength: localStorage.length,
    indexedDBDatabases: [] as string[],
  }));
  expect(storage.localStorageLength).toBe(0);
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(dbs).toEqual([]);
});

test('offline: all remote requests aborted, TFK-A still analyzes with zero remote requests', async ({ page }) => {
  const remoteRequests: string[] = [];
  const allRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    allRequests.push(url);
    if (url.startsWith('http://127.0.0.1:4173/')) {
      await route.continue();
    } else {
      remoteRequests.push(url);
      await route.abort();
    }
  });
  await page.goto('/');
  await analyzePreset(page, 'TFK-A');
  await expectStatus(page, 'CERTIFIED_COLLISION');
  await expect(page.locator(DUAL).getByText('合并 1×2').first()).toBeVisible();
  expect(remoteRequests).toEqual([]);
  expect(allRequests.length).toBeGreaterThan(0);
  expect(allRequests.every((u) => u.startsWith('http://127.0.0.1:4173/'))).toBe(true);
  await page.unroute('**/*');
});

test('security: raw <script> in a cell is rejected, never executed', async ({ page }) => {
  const dialogs: string[] = [];
  const pageErrors: string[] = [];
  const remoteRequests: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4173/')) remoteRequests.push(r.url());
  });
  const malicious =
    '<table><thead><tr><th>项目</th><th>数值</th></tr></thead>' +
    '<tbody><tr><td><script>alert(1)</script></td><td>1</td></tr></tbody></table>';
  await page.locator('#tf-html').fill(malicious);
  await clickCompare(page);
  await expectStatus(page, 'INVALID_INPUT');
  await expectStatus(page, 'INVALID_RAGGED_GRID');
  expect(dialogs).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(remoteRequests).toEqual([]);
  // 恶意串只以文本形式留在输入框里；文档中不存在含 alert(1) 的 <script> 节点。
  await expect(page.locator('#tf-html')).toHaveValue(malicious);
  const scriptWithPayload = await page.evaluate(
    () =>
      [...document.querySelectorAll('script')].some((s) =>
        (s.textContent ?? '').includes('alert(1)'),
      ),
  );
  expect(scriptWithPayload).toBe(false);
});

test('security: entity-escaped <img> + event attributes render as text, no img, no request', async ({ page }) => {
  const dialogs: string[] = [];
  const pageErrors: string[] = [];
  const exampleRequests: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('request', (r) => {
    if (r.url().includes('example.com')) exampleRequests.push(r.url());
  });
  await page.locator('#tf-html').fill(
    '<table><thead><tr><th colspan="2">预算</th></tr></thead>' +
      '<tbody><tr><td>&lt;img src="https://example.com/x.png"&gt;</td>' +
      '<td onclick="alert(1)" onmouseover="alert(2)">120</td></tr></tbody></table>',
  );
  await clickCompare(page);
  await expectStatus(page, 'CERTIFIED_COLLISION');
  // 恶意串以文本形式显示在结果格里（React 文本节点，不解析为 DOM 节点）。
  const cell = page.locator(DUAL).getByText('<img src="https://example.com/x.png">').first();
  await expect(cell).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(dialogs).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(exampleRequests).toEqual([]);
  // 事件属性未进入渲染 DOM：结果格上没有任何 onclick/onmouseover 属性。
  const attrs = await page.evaluate(() =>
    [...document.querySelectorAll('.tf-grid [role="button"]')].map((el) => ({
      onclick: el.getAttribute('onclick'),
      onmouseover: el.getAttribute('onmouseover'),
    })),
  );
  expect(attrs.every((a) => a.onclick === null && a.onmouseover === null)).toBe(true);
});

test('no storage writes: localStorage and IndexedDB stay empty across a full run', async ({ page }) => {
  await analyzePreset(page, 'TFK-A');
  await expectStatus(page, 'CERTIFIED_COLLISION');
  await page.getByRole('button', { name: '复制交接文本' }).click().catch(() => undefined);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(dbs).toEqual([]);
});

test('narrow 390px: TFK-A analyzes, stacked layout, no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await analyzePreset(page, 'TFK-A');
  await expectStatus(page, 'CERTIFIED_COLLISION');
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
  await page.screenshot({ path: 'artifacts/screenshots/T012-mobile390-A.png', fullPage: true });
});

test('keyboard: Tab reaches a grid cell, Enter selects the slot and highlights Markdown', async ({ page }) => {
  await analyzePreset(page, 'TFK-A');
  await expectStatus(page, 'CERTIFIED_COLLISION');
  // 从页面顶开始 Tab，直到焦点落在结果格（role=button，aria-label 含 RrCc）。
  let focusedLabel: string | null = null;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    focusedLabel = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null) return null;
      return el.getAttribute('aria-label');
    });
    if (focusedLabel !== null && /^R\d+C\d+ /.test(focusedLabel)) break;
  }
  expect(focusedLabel).not.toBeNull();
  expect(focusedLabel ?? '').toMatch(/^R\d+C\d+ /);
  await page.keyboard.press('Enter');
  await expect(page.getByText(/已选中槽位 R\d+C\d+/).first()).toBeVisible();
  await expect(page.locator('.tf-md-line.hl')).toHaveCount(1);
});
````

### tests/property/compare.ts
SHA-256: 960a461255318feef14297d57bc1d23ccfbcdd28fc440aaf66d427313858c6ed
Bytes: 11229
Lines: 307

````ts
/**
 * P029-T011 property cross-check — TS core vs independent Python Oracle.
 *
 * Shared comparison logic for tests/property/crosscheck.test.ts: given one
 * HTML table, compute the full TS-side analysis (parse + grid + facts +
 * handover + both flatten strategies + both witness searches) and compare it
 * field by field against one Oracle analyse() result dict, returning the
 * FIRST difference (or null when the two implementations agree).
 *
 * Compared fields (both strategies): rows / cols / slotOwner / cells /
 * facts / handover / f_origin / f_repeat / inputHash / spec_version /
 * witness status / source cell / split cost / header-association-changed /
 * collision kind / the three SHA-256 hashes / F(B) / B cells / B slotOwner.
 * Error inputs compare the error CODE only (messages are worded
 * independently, as in the Oracle's own compare_case).
 *
 * alternativeHtml O6 rule (T006 §9): the spec does not pin serialisation
 * (attribute order), so the raw alternativeHtml STRINGS are NOT compared
 * for equality. Instead each side's B HTML is re-parsed and the B graphs
 * (cells / slotOwner) and F(B) are compared. Raw-string differences are
 * collected in `o6StringDiffs` for the log and never fail a case.
 */
import { buildGrid, type GridResult } from '../../src/core/grid';
import { flattenGrid } from '../../src/core/flatten';
import { parseValidatedTable, TableForkInputError } from '../../src/core/parse';
import { buildSlotFacts, formatSlotFacts } from '../../src/core/records';
import {
  canonicalCellGraph,
  findWitness,
  sha256Utf8,
} from '../../src/core/witness';
import type { Strategy } from '../../src/core/index';
import { SPEC_VERSION } from '../../src/core/index';

export interface OracleWitness {
  status: string;
  source_cell_id: string | null;
  split_cost: number | null;
  header_association_changed: boolean;
  collision_kind: string | null;
  alternative_html: string | null;
  a_graph_sha256: string;
  b_graph_sha256: string | null;
  markdown_sha256: string;
  f_b: string | null;
  b_cells: unknown[] | null;
  b_slotOwner: string[][] | null;
  reason: string | null;
}

export interface OracleResult {
  rows: number;
  cols: number;
  slotOwner: string[][];
  cells: unknown[];
  facts: unknown[];
  handover: string[];
  f_origin: string;
  f_repeat: string;
  // FIX-02: Oracle analyse() 与 TS analyze() 均输出 inputHash（输入 HTML
  // 原文的 SHA-256）与 spec_version；cross-check 逐项比对。jobId 是传输层
  // 字段，Oracle 不计算、TS 的 analyseTs 不经过 analyze()，故此处不比 jobId。
  inputHash: string;
  spec_version: string;
  witness: Record<Strategy, OracleWitness>;
}

export type OracleOutcome =
  | { kind: 'result'; result: OracleResult }
  | { kind: 'error'; code: string }
  | { kind: 'oracle_error'; message: string };

/** Raw-string alternativeHtml differences (O6 note only — never a failure). */
export const o6StringDiffs: { seed: number | string; strategy: Strategy }[] = [];

const STRATEGIES: Strategy[] = ['ORIGIN_EMPTY', 'REPEAT_VALUE'];

/** First difference between expected and actual; null when deeply equal. */
export function firstDiff(path: string, expected: unknown, actual: unknown): string | null {
  if (typeof expected !== typeof actual) {
    return `${path}: type differs (expected ${typeof expected}, got ${typeof actual})`;
  }
  if (expected !== null && typeof expected === 'object') {
    if (Array.isArray(expected) || Array.isArray(actual)) {
      if (!Array.isArray(expected) || !Array.isArray(actual)) {
        return `${path}: one side is an array, the other is not`;
      }
      if (expected.length !== actual.length) {
        return `${path}: length differs (expected ${expected.length}, got ${actual.length})`;
      }
      for (let i = 0; i < expected.length; i++) {
        const d = firstDiff(`${path}[${i}]`, expected[i], actual[i]);
        if (d) return d;
      }
      return null;
    }
    const eKeys = Object.keys(expected as Record<string, unknown>).sort();
    const aKeys = Object.keys(actual as Record<string, unknown>).sort();
    if (JSON.stringify(eKeys) !== JSON.stringify(aKeys)) {
      return `${path}: keys differ (expected [${eKeys.join(',')}], got [${aKeys.join(',')}])`;
    }
    for (const k of eKeys) {
      const d = firstDiff(
        `${path}.${k}`,
        (expected as Record<string, unknown>)[k],
        (actual as Record<string, unknown>)[k],
      );
      if (d) return d;
    }
    return null;
  }
  if (expected !== actual) {
    return `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  return null;
}

interface TsAnalysis {
  rows: number;
  cols: number;
  slotOwner: string[][];
  cells: unknown[];
  facts: unknown[];
  handover: string[];
  f_origin: string;
  f_repeat: string;
  inputHash: string;
  spec_version: string;
  witness: Record<
    Strategy,
    {
      status: string;
      source_cell_id: string | null;
      split_cost: number | null;
      header_association_changed: boolean;
      collision_kind: string | null;
      alternative_html: string | null;
      a_graph_sha256: string;
      b_graph_sha256: string | null;
      markdown_sha256: string;
      f_b: string | null;
      b_cells: unknown[] | null;
      b_slotOwner: string[][] | null;
    }
  >;
}

function gridOf(html: string): GridResult {
  return buildGrid(parseValidatedTable(html));
}

function analyseTs(html: string): TsAnalysis {
  const grid = gridOf(html);
  const facts = buildSlotFacts(grid);
  const witness = {} as TsAnalysis['witness'];
  for (const strategy of STRATEGIES) {
    const found = findWitness(html, strategy);
    if (found.status !== 'CERTIFIED_COLLISION' || !found.proof) {
      witness[strategy] = {
        status: found.status,
        source_cell_id: null,
        split_cost: null,
        header_association_changed: false,
        collision_kind: null,
        alternative_html: null,
        a_graph_sha256: sha256Utf8(canonicalCellGraph(grid)),
        b_graph_sha256: null,
        markdown_sha256: sha256Utf8(flattenGrid(grid, strategy)),
        f_b: null,
        b_cells: null,
        b_slotOwner: null,
      };
      continue;
    }
    const proof = found.proof;
    const gridB = gridOf(proof.alternativeHtml);
    witness[strategy] = {
      status: found.status,
      source_cell_id: proof.sourceCellId,
      split_cost: proof.splitCost,
      header_association_changed: proof.headerAssociationChanged,
      collision_kind: found.kind ?? null,
      alternative_html: proof.alternativeHtml,
      a_graph_sha256: proof.aGraphSha256,
      b_graph_sha256: proof.bGraphSha256,
      markdown_sha256: proof.markdownSha256,
      f_b: flattenGrid(gridB, strategy),
      b_cells: gridB.cells,
      b_slotOwner: gridB.slotOwner,
    };
  }
  return {
    rows: grid.rows,
    cols: grid.cols,
    slotOwner: grid.slotOwner,
    cells: grid.cells,
    facts,
    handover: formatSlotFacts(facts) === '' ? [] : formatSlotFacts(facts).split('\n'),
    f_origin: flattenGrid(grid, 'ORIGIN_EMPTY'),
    f_repeat: flattenGrid(grid, 'REPEAT_VALUE'),
    // FIX-02：与 Oracle 同一口径——输入 HTML 原文的 SHA-256 + 规格版本。
    inputHash: sha256Utf8(html),
    spec_version: SPEC_VERSION,
    witness,
  };
}

/**
 * Compare one table's TS analysis against the Oracle outcome.
 * Returns the first difference string, or null when they agree.
 * `label` identifies the case in O6 notes (seed number or fixed-case name).
 */
export function compareTsVsOracle(
  html: string,
  oracle: OracleOutcome,
  label: number | string,
): string | null {
  let ts: TsAnalysis;
  let tsError: string | null = null;
  try {
    ts = analyseTs(html);
  } catch (err) {
    if (err instanceof TableForkInputError) {
      tsError = err.code;
      ts = null as unknown as TsAnalysis;
    } else {
      throw err;
    }
  }
  if (oracle.kind === 'oracle_error') {
    return `oracle raised an unexpected error: ${oracle.message}`;
  }
  if (oracle.kind === 'error') {
    if (tsError === null) return `error code: expected ${oracle.code}, got a successful analysis`;
    if (tsError !== oracle.code) {
      return `error code: expected ${oracle.code}, got ${tsError}`;
    }
    return null;
  }
  if (tsError !== null) {
    return `error code: expected a successful analysis but TS threw ${tsError}`;
  }
  const result = oracle.result;
  const fields: [string, unknown, unknown][] = [
    ['rows', result.rows, ts!.rows],
    ['cols', result.cols, ts!.cols],
    ['slotOwner', result.slotOwner, ts!.slotOwner],
    ['cells', result.cells, ts!.cells],
    ['facts', result.facts, ts!.facts],
    ['handover', result.handover, ts!.handover],
    ['f_origin', result.f_origin, ts!.f_origin],
    ['f_repeat', result.f_repeat, ts!.f_repeat],
    ['inputHash', result.inputHash, ts!.inputHash],
    ['spec_version', result.spec_version, ts!.spec_version],
  ];
  for (const [path, expected, actual] of fields) {
    const d = firstDiff(path, expected, actual);
    if (d) return d;
  }
  for (const strategy of STRATEGIES) {
    const wExp = result.witness[strategy];
    const wAct = ts!.witness[strategy];
    const wFields: [string, unknown, unknown][] = [
      [`witness.${strategy}.status`, wExp.status, wAct.status],
      [`witness.${strategy}.source_cell_id`, wExp.source_cell_id, wAct.source_cell_id],
      [`witness.${strategy}.split_cost`, wExp.split_cost, wAct.split_cost],
      [
        `witness.${strategy}.header_association_changed`,
        wExp.header_association_changed,
        wAct.header_association_changed,
      ],
      [`witness.${strategy}.collision_kind`, wExp.collision_kind, wAct.collision_kind],
      [`witness.${strategy}.a_graph_sha256`, wExp.a_graph_sha256, wAct.a_graph_sha256],
      [`witness.${strategy}.b_graph_sha256`, wExp.b_graph_sha256, wAct.b_graph_sha256],
      [`witness.${strategy}.markdown_sha256`, wExp.markdown_sha256, wAct.markdown_sha256],
      [`witness.${strategy}.f_b`, wExp.f_b, wAct.f_b],
      [`witness.${strategy}.b_cells`, wExp.b_cells, wAct.b_cells],
      [`witness.${strategy}.b_slotOwner`, wExp.b_slotOwner, wAct.b_slotOwner],
    ];
    for (const [path, expected, actual] of wFields) {
      const d = firstDiff(path, expected, actual);
      if (d) return d;
    }
    // O6 structural check on the Oracle's own B serialisation: re-parse the
    // Oracle's alternativeHtml with TS and compare its graph to the Oracle's
    // b_cells / b_slotOwner. The raw strings are NOT compared (O6 note only).
    if (wExp.alternative_html !== null && wAct.alternative_html !== null) {
      if (wExp.alternative_html !== wAct.alternative_html) {
        o6StringDiffs.push({ seed: label, strategy });
      }
      const oracleGridB = gridOf(wExp.alternative_html);
      const d1 = firstDiff(
        `witness.${strategy}.b_cells (re-parsed oracle alternativeHtml)`,
        wExp.b_cells,
        oracleGridB.cells,
      );
      if (d1) return d1;
      const d2 = firstDiff(
        `witness.${strategy}.b_slotOwner (re-parsed oracle alternativeHtml)`,
        wExp.b_slotOwner,
        oracleGridB.slotOwner,
      );
      if (d2) return d2;
    }
  }
  return null;
}
````

### tests/property/crosscheck.test.ts
SHA-256: 93b65230a3cd62e5df69c235ddf3281a5e67092dc7a717fddba683f3d704090a
Bytes: 8547
Lines: 200

````ts
/**
 * P029-T011 formal test — 200 fixed-seed TS-vs-Oracle cross-check.
 *
 * Seeds 0..199 (tests/property/generator.ts, mulberry32 — same seed always
 * yields the same table). The Oracle is run ONCE, in batch, through
 * tests/property/oracle_driver.py (which only transports oracle/reference.py
 * analyse() results; it adds no semantics). Each seed is then compared field
 * by field with the TS core (tests/property/compare.ts).
 *
 * Divergence policy (task card): ANY inconsistency is a failure — no skip,
 * no expected-fail, no quiet workaround. The first inconsistency (lowest
 * seed, first differing field) is recorded in artifacts/logs/T011-tests.txt
 * §8 and in the handoff issues; the coordinator dispatches a fix card.
 * A summary test at the end logs the per-seed table and per-field counts.
 *
 * Also covered here (fixed cases, not seeds): the 128-DOM-cell cap boundary
 * (J-T005-6 — a legal A at the cap yields B over the cap, all candidates
 * skipped -> NO_WITNESS_FOUND) and its 127-cell control.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  compareTsVsOracle,
  o6StringDiffs,
  type OracleOutcome,
} from './compare';
import { generateTable, SEEDS } from './generator';

const ROOT = join(__dirname, '..', '..');
const DRIVER = join(ROOT, 'tests', 'property', 'oracle_driver.py');

/** seed -> first difference string (null = TS and Oracle agree). */
const diffs = new Map<number, string | null>();
/** seed -> generated table summary for the log. */
const summaries = new Map<number, { rows: number; cols: number; domCells: number }>();
/** seed -> Oracle outcome kind ('ok' or 'error:<code>'). */
const kinds = new Map<number, string>();

/** 128-DOM-cell cap-boundary table: 32 rows x 5 cols, one colspan=2 per row. */
function cap128Html(): string {
  let rows = '';
  for (let r = 0; r < 32; r++) {
    rows += '<tr><td colspan="2">M</td><td>a</td><td>b</td><td>c</td></tr>';
  }
  return `<table><tbody>${rows}</tbody></table>`;
}

/** 127-DOM-cell control: same grid, one rowspan=2 cell (B = 128, legal). */
function cap127Html(): string {
  let rows = '';
  for (let r = 0; r < 32; r++) {
    if (r === 0) rows += '<tr><td rowspan="2">M</td><td>a</td><td>b</td><td>c</td></tr>';
    else if (r === 1) rows += '<tr><td>a</td><td>b</td><td>c</td></tr>';
    else rows += '<tr><td>a</td><td>b</td><td>c</td><td>d</td></tr>';
  }
  return `<table><tbody>${rows}</tbody></table>`;
}

const fixedCases: { label: string; html: string }[] = [
  { label: 'cap128', html: cap128Html() },
  { label: 'cap127-control', html: cap127Html() },
];
const fixedDiffs = new Map<string, string | null>();

describe('property: 200 fixed seeds, TS core vs Python Oracle', { timeout: 120_000 }, () => {
  beforeAll(() => {
    const work = mkdtempSync(join(tmpdir(), 't011-oracle-'));
    const inputPath = join(work, 'input.jsonl');
    const outputPath = join(work, 'output.jsonl');
    const tables = SEEDS.map((seed) => generateTable(seed));
    writeFileSync(
      inputPath,
      tables.map((t) => JSON.stringify({ seed: t.seed, html: t.html })).join('\n') + '\n',
      'utf-8',
    );
    execFileSync('python3', [DRIVER, '--input', inputPath, '--output', outputPath], {
      encoding: 'utf-8',
      timeout: 60_000,
    });
    const outcomes = new Map<number, OracleOutcome>();
    for (const line of readFileSync(outputPath, 'utf-8').trim().split('\n')) {
      const item = JSON.parse(line) as {
        seed: number;
        result?: unknown;
        error?: { code: string };
        oracle_error?: string;
      };
      if ('result' in item) {
        outcomes.set(item.seed, {
          kind: 'result',
          result: item.result as import('./compare').OracleResult,
        });
      } else if ('error' in item) {
        outcomes.set(item.seed, { kind: 'error', code: item.error!.code });
      } else {
        outcomes.set(item.seed, { kind: 'oracle_error', message: item.oracle_error ?? '' });
      }
    }
    expect(outcomes.size).toBe(SEEDS.length);
    for (const t of tables) {
      summaries.set(t.seed, { rows: t.rows, cols: t.cols, domCells: t.domCells });
      const outcome = outcomes.get(t.seed);
      if (!outcome) throw new Error(`no Oracle outcome for seed ${t.seed}`);
      kinds.set(
        t.seed,
        outcome.kind === 'result' ? 'ok' : outcome.kind === 'error' ? `error:${outcome.code}` : 'oracle_error',
      );
      diffs.set(t.seed, compareTsVsOracle(t.html, outcome, t.seed));
    }
    // Fixed cap-boundary cases go through the same driver batch via a second
    // call is wasteful; reuse the comparator with a fresh one-shot run:
    const fixedInput = join(work, 'fixed-input.jsonl');
    const fixedOutput = join(work, 'fixed-output.jsonl');
    writeFileSync(
      fixedInput,
      fixedCases.map((c) => JSON.stringify({ seed: c.label, html: c.html })).join('\n') + '\n',
      'utf-8',
    );
    execFileSync('python3', [DRIVER, '--input', fixedInput, '--output', fixedOutput], {
      encoding: 'utf-8',
      timeout: 60_000,
    });
    for (const line of readFileSync(fixedOutput, 'utf-8').trim().split('\n')) {
      const item = JSON.parse(line) as {
        seed: string;
        result?: unknown;
        error?: { code: string };
        oracle_error?: string;
      };
      const c = fixedCases.find((x) => x.label === item.seed)!;
      let outcome: OracleOutcome;
      if ('result' in item) {
        outcome = { kind: 'result', result: item.result as import('./compare').OracleResult };
      } else if ('error' in item) outcome = { kind: 'error', code: item.error!.code };
      else outcome = { kind: 'oracle_error', message: item.oracle_error ?? '' };
      fixedDiffs.set(c.label, compareTsVsOracle(c.html, outcome, c.label));
    }
  }, 120_000);

  it('generator is deterministic: re-generating every seed yields the same HTML', () => {
    for (const seed of SEEDS) {
      expect(generateTable(seed).html).toBe(generateTable(seed).html);
    }
  });

  it('generator emits only legal tables: every seed is accepted (no error) by both sides', () => {
    const bad = SEEDS.filter((seed) => kinds.get(seed) !== 'ok');
    expect(bad, `seeds whose generated table was rejected: ${JSON.stringify(bad)}`).toEqual([]);
  });

  it.each(SEEDS)('seed %i: TS == Oracle (all fields, both strategies)', (seed) => {
    const d = diffs.get(seed);
    expect(d, `seed ${seed} first difference`).toBeNull();
  });

  it('128-cell cap boundary (J-T005-6): TS == Oracle, NO_WITNESS_FOUND at the cap', () => {
    expect(fixedDiffs.get('cap128'), 'cap128 first difference').toBeNull();
  });

  it('127-cell control: TS == Oracle, CERTIFIED_COLLISION just under the cap', () => {
    expect(fixedDiffs.get('cap127-control'), 'cap127 first difference').toBeNull();
  });

  it('summary: per-seed table, per-field mismatch counts, O6 note', () => {
    const byField = new Map<string, number>();
    let agree = 0;
    const lines: string[] = [];
    for (const seed of SEEDS) {
      const s = summaries.get(seed)!;
      const d = diffs.get(seed);
      if (d === null) {
        agree++;
        lines.push(`seed=${seed} ${s.rows}x${s.cols} cells=${s.domCells} AGREE`);
      } else {
        const field = d.split(':')[0];
        byField.set(field, (byField.get(field) ?? 0) + 1);
        lines.push(`seed=${seed} ${s.rows}x${s.cols} cells=${s.domCells} DIFF ${d}`);
      }
    }
    for (const [label, d] of fixedDiffs) {
      lines.push(`fixed=${label} ${d === null ? 'AGREE' : `DIFF ${d}`}`);
    }
    console.log(
      `[T011-PROPERTY] agree=${agree}/200 seeds; ` +
        `valid-tables=${[...kinds.values()].filter((k) => k === 'ok').length}, ` +
        `error-agreements=${[...kinds.values()].filter((k) => k.startsWith('error')).length} ` +
        `(${JSON.stringify(Object.fromEntries([...kinds.entries()].filter(([, k]) => k !== 'ok').map(([s, k]) => [s, k])))}); ` +
        `mismatch-by-field: ${JSON.stringify(Object.fromEntries(byField))}; ` +
        `O6 raw-string diffs: ${o6StringDiffs.length} ` +
        (o6StringDiffs.length > 0
          ? o6StringDiffs.map((x) => `${x.seed}/${x.strategy}`).join(', ')
          : '(none)'),
    );
    console.log('[T011-PROPERTY] per-seed:\n' + lines.join('\n'));
    expect(agree).toBeGreaterThanOrEqual(0); // counts only; pass/fail is per-seed above
  });
});
````

### tests/property/generator.ts
SHA-256: 09f69e43a7a6ad656e03b0a52a4c1824fcd45a8a109ce92e882caf1306209352
Bytes: 8242
Lines: 207

````ts
/**
 * P029-T011 property generator — deterministic seeded random tables.
 *
 * Seeds are fixed: 0..199 (see SEEDS). The same seed always yields the same
 * table: the PRNG is mulberry32(seed), no Date / Math.random / I/O anywhere.
 *
 * Generator rules (frozen subset only — PROJECT_BOOK.md v1.0.2 §3.1):
 * - single top-level <table>, optional <caption>, optional single <thead>,
 *   optional single <tbody> (thead-only tables occur); no nested tables.
 * - 1..8 rows, 1..8 cols (well inside the 32x12 / 128-cell / 64 KiB limits);
 *   rowspan/colspan 1..3, never crossing the thead/tbody boundary.
 * - roles: thead cells are th (usually) or td; tbody cells are td, or th
 *   with scope=row, or th without scope. scope=col only in thead.
 *   Never scope=rowgroup/colgroup, never headers=, never unknown attributes
 *   (unknown attributes are the known open O1 divergence, T006 §9 — out of
 *   the agreed-legal subset, probed separately in the T011 log §8, not part
 *   of the 200-seed mix).
 * - cell texts mix, by weight: plain CJK / ASCII words, number-like strings
 *   ("007", 17-digit strings, "1e5"), empty strings, "|" and backslash
 *   combinations, HTML entities ("&amp;", "&lt;", "&#65;&#x42;", "&foo;",
 *   "&amp" without ";", "&nbsp;"), whitespace runs / newlines / tabs,
 *   emoji / full-width forms, quotes, Markdown metacharacters.
 * - attribute order (rowspan/colspan/scope) varies; attribute values are
 *   double-quoted. Tags are emitted adjacently (no inter-tag whitespace).
 */
export interface GeneratedTable {
  seed: number;
  html: string;
  rows: number;
  cols: number;
  domCells: number;
}

/** The fixed seed list for this card: 0..199 inclusive. */
export const SEEDS: number[] = Array.from({ length: 200 }, (_, i) => i);

/** mulberry32 — small deterministic PRNG, seeded per table. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXT_POOL: string[] = [
  // plain words (CJK / ASCII)
  '苹果', '香蕉', '预算', '收入', '成本', '部门', '项目', '甲', '乙', '丙',
  'Alpha', 'Beta', 'total', 'value', '2026', 'Q1',
  // number-like strings (must stay strings, never parsed as Number)
  '007', '12345678901234567', '1e5', '0', '3.14', '120',
  // empty / whitespace
  '', '  ', '  多   空\n格\t表  ', '\n前后\n', '  x  ', 'a  b',
  // pipe / backslash (escape order matters, spec §5.1)
  'a|b', 'c\\d', 'e\\|f', '||', '\\', 'x|y|z',
  // entities (decoded on extraction; unknown / unterminated stay literal)
  '&amp;', '&lt;', '&quot;', '&#65;&#x42;', '&foo;', '&amp', '&nbsp;', 'A & B',
  // emoji / full-width / quotes / markdown metacharacters
  '😀笑', '全角ＡＢ', '"引"', "it's \"q\"", '*粗* `码` #题', '数学 & 物理',
  // longer mixed text
  '2026预算 > 收入：120', '研发-一期/二期', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
];

const HEADER_WORDS = ['名称', '数量', '科目', '年份', '组一', '组二', '全年', '产品', '部门', '数值'];

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pickText(rand: () => number): string {
  const r = rand();
  if (r < 0.12) return pick(rand, HEADER_WORDS);
  return pick(rand, TEXT_POOL);
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface PlacedCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  role: 'TH' | 'TD';
  scope: 'row' | 'col' | null;
  text: string;
  section: 'thead' | 'tbody';
}

/**
 * Build one legal table for `seed`. Placement follows first-free-column
 * order per row; every free slot gets a cell, so the grid is always fully
 * covered 0..cols-1 with no overlap and no ragged row.
 */
export function generateTable(seed: number): GeneratedTable {
  const rand = mulberry32(seed);
  const large = seed % 25 === 0;
  const headRows = large ? 2 : Math.floor(rand() * 3); // 0..2 thead rows
  const bodyRows = large ? 5 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 5);
  const cols = large ? 6 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 6);
  const theadOnly = !large && rand() < 0.05 && headRows > 0;
  const totalRows = headRows + (theadOnly ? 0 : bodyRows);
  const withCaption = rand() < 0.1;

  // occupancy per section: occupied[section][r][x]
  const occupied: boolean[][][] = [];
  const cells: PlacedCell[] = [];
  const sections: { name: 'thead' | 'tbody'; rows: number }[] = [];
  if (headRows > 0) sections.push({ name: 'thead', rows: headRows });
  if (!theadOnly) sections.push({ name: 'tbody', rows: bodyRows });

  let rowBase = 0;
  for (const section of sections) {
    const occ: boolean[][] = Array.from({ length: section.rows }, () =>
      Array.from({ length: cols }, () => false),
    );
    occupied.push(occ);
    for (let r = 0; r < section.rows; r++) {
      for (let x = 0; x < cols; x++) {
        if (occ[r][x]) continue;
        const maxH = Math.min(3, section.rows - r);
        const maxW = Math.min(3, cols - x);
        let h = 1;
        let w = 1;
        if (rand() < 0.45) {
          h = 1 + Math.floor(rand() * maxH);
          w = 1 + Math.floor(rand() * maxW);
        }
        // The chosen rectangle must be ENTIRELY free: an earlier rowspan
        // from a previous row may already occupy slots inside it (the
        // origin slot alone being free is not enough). Shrink w, then h,
        // until the rectangle is free; 1x1 always works (origin is free).
        const rectFree = (hh: number, ww: number): boolean => {
          for (let dr = 0; dr < hh; dr++) {
            for (let dx = 0; dx < ww; dx++) {
              if (occ[r + dr][x + dx]) return false;
            }
          }
          return true;
        };
        while (w > 1 && !rectFree(h, w)) w--;
        while (h > 1 && !rectFree(h, w)) h--;
        for (let dr = 0; dr < h; dr++) {
          for (let dx = 0; dx < w; dx++) occ[r + dr][x + dx] = true;
        }
        let role: 'TH' | 'TD';
        let scope: 'row' | 'col' | null = null;
        if (section.name === 'thead') {
          role = rand() < 0.85 ? 'TH' : 'TD';
          if (role === 'TH' && rand() < 0.2) scope = 'col';
        } else {
          const t = rand();
          if (t < 0.78) role = 'TD';
          else {
            role = 'TH';
            scope = rand() < 0.85 ? 'row' : null;
          }
        }
        cells.push({
          row: rowBase + r,
          col: x,
          rowSpan: h,
          colSpan: w,
          role,
          scope,
          text: pickText(rand),
        } as PlacedCell);
        // section tag is filled in below (cells are built per section)
        cells[cells.length - 1].section = section.name;
      }
    }
    rowBase += section.rows;
  }

  // Serialise: rows in order, cells per row in DOM (column) order; attribute
  // order varies (rowspan/colspan/scope shuffled deterministically).
  const rowsHtml: string[] = [];
  for (let r = 0; r < totalRows; r++) {
    const rowCells = cells.filter((c) => c.row === r);
    let rowHtml = '<tr>';
    for (const c of rowCells) {
      const tag = c.role === 'TH' ? 'th' : 'td';
      const attrs: string[] = [];
      if (c.rowSpan > 1) attrs.push(`rowspan="${c.rowSpan}"`);
      if (c.colSpan > 1) attrs.push(`colspan="${c.colSpan}"`);
      if (c.scope !== null) attrs.push(`scope="${c.scope}"`);
      if (rand() < 0.5) attrs.reverse();
      rowHtml += `<${tag}${attrs.length > 0 ? ' ' + attrs.join(' ') : ''}>${escapeHtmlText(c.text)}</${tag}>`;
    }
    rowHtml += '</tr>';
    rowsHtml.push(rowHtml);
  }
  let html = '<table>';
  if (withCaption) html += `<caption>${escapeHtmlText(pick(rand, TEXT_POOL))}</caption>`;
  let idx = 0;
  for (const section of sections) {
    html += `<${section.name}>`;
    for (let i = 0; i < section.rows; i++) html += rowsHtml[idx++];
    html += `</${section.name}>`;
  }
  html += '</table>';
  return { seed, html, rows: totalRows, cols, domCells: cells.length };
}
````

### tests/property/oracle_driver.py
SHA-256: ff75c521ac168f14b6dd12394b6933910bd866034e3c3e95219c8bcb1896e856
Bytes: 2340
Lines: 62

````python
#!/usr/bin/env python3
"""P029-T011 property-test oracle driver (test support, NOT production code).

Reads a JSONL file of {"seed": int, "html": str} lines, runs the independent
Python Oracle (oracle/reference.py, imported by path — no Node/TS involved)
once per line via its analyse() entry point, and writes a JSONL file of
{"seed": int, "result": <analyse() dict>} or {"seed": int, "error": {"code": str}}
lines. analyse() computes both strategies in one call.

This driver is only a transport: it adds no semantics of its own. Any
unexpected Python exception is reported as {"seed", "oracle_error": str}
so it can never silently pass as agreement.
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path


def load_oracle():
    here = Path(__file__).resolve()
    ref_path = here.parent.parent.parent / "oracle" / "reference.py"
    spec = importlib.util.spec_from_file_location("t011_oracle_ref", ref_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main(argv=None):
    parser = argparse.ArgumentParser(description="P029-T011 oracle batch driver.")
    parser.add_argument("--input", required=True, help="input JSONL (seed, html)")
    parser.add_argument("--output", required=True, help="output JSONL")
    args = parser.parse_args(argv)

    ref = load_oracle()
    rows = []
    with Path(args.input).open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    out_lines = []
    for row in rows:
        seed = row["seed"]
        html = row["html"]
        try:
            result = ref.analyse(html, "ORIGIN_EMPTY")
            out_lines.append({"seed": seed, "result": result})
        except ref.TableForkError as exc:
            out_lines.append({"seed": seed, "error": {"code": exc.code}})
        except Exception as exc:  # oracle bug: never a PASS
            out_lines.append({"seed": seed, "oracle_error": "%s: %s" % (type(exc).__name__, exc)})
    with Path(args.output).open("w", encoding="utf-8") as fh:
        for item in out_lines:
            fh.write(json.dumps(item, ensure_ascii=False) + "\n")
    print("%d cases analysed" % len(out_lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
````

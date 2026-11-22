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

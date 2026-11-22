import { defineConfig } from '@playwright/test';

// P029 TableFork — T001 scaffold config, adjusted by P029-T012 (see log
// artifacts/logs/T012-e2e.txt §8 J-T012-1 for the reasons):
// - E2E now runs against the PRODUCTION build via `vite preview` (port 4173),
//   not the dev server: the production build is the deliverable, and the
//   card requires the tests to run on it. The webServer command rebuilds
//   first so a stale dist/ can never be served silently.
// - trace/screenshot are kept (Playwright defaults): retain-on-failure /
//   only-on-failure, so a failing test keeps its screenshot + trace.
export default defineConfig({
  testDir: './tests/e2e',
  // T012: E2E files use *.e2e.ts (not *.spec.ts) so Vitest's default include
  // (**/*.{test,spec}.*) does not pick them up — `npm run test` would
  // otherwise execute Playwright files and fail at import time
  // (test.setTimeout/beforeEach throw outside the Playwright runner).
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  // T012-FIX-01 (测法修复，不动产品/阈值/断言)：性能测量改为隔离串行运行。
  // 全套并行时 2 个 Playwright worker 在 1.5 共享 vCPU 上互争 CPU，测到的
  // p95（527.4/649.2ms）是框架并行争用，不是产品速度（独立运行 263.2/
  // 282.8ms，Node 内核 109.7ms；两轮全套的后 5 次均回落到独立区间）。
  // 因此拆为两个 project：functional（20 条功能测试）与 perf（1 条性能
  // 测试）；`npm run test:e2e` 只跑 functional，`npm run test:e2e:perf`
  // 单独跑 perf，二者永不同时执行，性能测量不再受并行 worker 污染。
  projects: [
    { name: 'functional', testMatch: '**/tablefork.e2e.ts' },
    { name: 'perf', testMatch: '**/performance.e2e.ts' },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

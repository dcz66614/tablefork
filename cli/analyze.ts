/**
 * P029 TableFork — Node 离线 CLI (P029-T010)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §6.2（Node 离线 CLI，
 * `npm run analyze -- --input fixtures/TFK-A.json --out output/report.json`，
 * 内部加载与 UI 同一个纯 TS 算法库）、IMPLEMENTATION_PLAN.md §4.2
 * （JSON 失败合同）、§4.3（fixture 字段合同）。
 *
 * 用法：
 *   npm run analyze -- --input fixtures/TFK-A.json --out artifacts/reports/TFK-A.json
 *   npm run analyze -- --help
 *
 * 行为：
 * - 读 fixture JSON（{ fixture_id, schema: 'tablefork.fixture/v1',
 *   input: { schema: 'tablefork.input/v1', html, strategy }, expected_ref }），
 *   调与浏览器 UI 同一个公共内核 analyze()，把 AnalyzeResult 写到 --out。
 * - 不存在的输出目录自动创建（mkdir -p）。
 * - 零网络：只做本地文件读写与本地计算。
 * - 本文件不在 tsconfig.json 的 include 里（T001 冻结：只含 src/、
 *   vite.config.ts、playwright.config.ts），故 `npm run typecheck` 不覆盖
 *   它；见 artifacts/logs/T010-worker-cli.txt §7 J-T010-5（留待 T013）。
 *
 * 退出码口径（钉死，见日志 §7 J-T010-3）：
 * - 0：成功，报告已写出。
 * - 1：表格被 analyze() 拒绝（TableForkError）：stderr 打印
 *   `ERROR <ErrorCode>: <message>`，不写输出文件。
 * - 2：CLI 层失败（参数缺失/未知参数、输入文件读不到、JSON 解析失败、
 *   fixture 结构不符）：stderr 打印 `ERROR CLI_USAGE: <message>`。
 * - --help：打印用法到 stdout，退出 0。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { analyze } from '../src/core/report';
import { isTableForkError } from '../src/core/types';

const USAGE = [
  'Usage: npm run analyze -- --input <fixture.json> --out <report.json>',
  '       npm run analyze -- --help',
  '',
  'Reads a tablefork.fixture/v1 fixture, runs the shared analyze() kernel',
  'from src/core/report.ts (the same kernel the browser UI uses), and writes',
  'the tablefork.report/v1 AnalyzeResult JSON to --out (creating parent',
  'directories as needed). Offline; no network access.',
  '',
  'Exit codes: 0 success; 1 table rejected by analyze() (stderr shows the',
  'ErrorCode enum value and message); 2 CLI usage / file / fixture error',
  '(stderr shows ERROR CLI_USAGE: ...).',
].join('\n');

interface CliOptions {
  input: string;
  out: string;
}

/** 解析 argv；--help 在此直接返回 null（由 main 打印用法后退出 0）。 */
function parseArgs(argv: string[]): CliOptions | null {
  let input: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return null;
    }
    if (arg === '--input' || arg === '--out') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`CLI_USAGE: ${arg} requires a value`);
      }
      if (arg === '--input') {
        input = value;
      } else {
        out = value;
      }
      i += 1;
      continue;
    }
    throw new Error(`CLI_USAGE: unknown argument ${JSON.stringify(arg)}`);
  }
  if (input === undefined) {
    throw new Error('CLI_USAGE: missing required --input <fixture.json>');
  }
  if (out === undefined) {
    throw new Error('CLI_USAGE: missing required --out <report.json>');
  }
  return { input, out };
}

/**
 * 校验 fixture 结构（只做形状校验，不猜字段语义）：
 * fixture_id 为字符串、schema 为 'tablefork.fixture/v1'、input.schema 为
 * 'tablefork.input/v1'、input.html 为字符串、input.strategy 为两个策略之一。
 * 不合形状时抛 CLI_USAGE 错误（退出 2）；表格本身的合法性由 analyze()
 * 判定（退出 1），不在此预判。
 */
function validateFixture(value: unknown): {
  fixture_id: string;
  input: { schema: 'tablefork.input/v1'; html: string; strategy: 'ORIGIN_EMPTY' | 'REPEAT_VALUE' };
} {
  // 注意：此处故意用直接 throw 而不用一个返回 never 的辅助函数——
  // 直接 throw 才能让 TS 在其后收窄 fixture/input 的 unknown 字段；
  // 经由 const 箭头函数 fail() 的调用在本文件实测中不产生收窄。
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('CLI_USAGE: invalid fixture: top level must be a JSON object');
  }
  const fixture = value as {
    fixture_id?: unknown;
    schema?: unknown;
    input?: unknown;
    expected_ref?: unknown;
  };
  if (typeof fixture.fixture_id !== 'string' || fixture.fixture_id === '') {
    throw new Error(
      'CLI_USAGE: invalid fixture: fixture_id must be a non-empty string',
    );
  }
  if (fixture.schema !== 'tablefork.fixture/v1') {
    throw new Error(
      `CLI_USAGE: invalid fixture: schema must be "tablefork.fixture/v1", got ${JSON.stringify(fixture.schema)}`,
    );
  }
  if (typeof fixture.input !== 'object' || fixture.input === null) {
    throw new Error('CLI_USAGE: invalid fixture: input must be an object');
  }
  const input = fixture.input as {
    schema?: unknown;
    html?: unknown;
    strategy?: unknown;
  };
  if (input.schema !== 'tablefork.input/v1') {
    throw new Error(
      `CLI_USAGE: invalid fixture: input.schema must be "tablefork.input/v1", got ${JSON.stringify(input.schema)}`,
    );
  }
  if (typeof input.html !== 'string') {
    throw new Error('CLI_USAGE: invalid fixture: input.html must be a string');
  }
  if (input.strategy !== 'ORIGIN_EMPTY' && input.strategy !== 'REPEAT_VALUE') {
    throw new Error(
      `CLI_USAGE: invalid fixture: input.strategy must be "ORIGIN_EMPTY" or "REPEAT_VALUE", got ${JSON.stringify(input.strategy)}`,
    );
  }
  return {
    fixture_id: fixture.fixture_id,
    input: {
      schema: 'tablefork.input/v1',
      html: input.html,
      strategy: input.strategy,
    },
  };
}

async function main(argv: string[]): Promise<number> {
  let options: CliOptions | null;
  try {
    options = parseArgs(argv);
  } catch (error: unknown) {
    console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  if (options === null) {
    console.log(USAGE);
    return 0;
  }

  const inputPath = resolve(options.input);
  const outPath = resolve(options.out);

  let raw: string;
  try {
    raw = await readFile(inputPath, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR CLI_USAGE: cannot read --input ${inputPath}: ${message}`);
    return 2;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR CLI_USAGE: --input ${inputPath} is not valid JSON: ${message}`);
    return 2;
  }

  let fixture: ReturnType<typeof validateFixture>;
  try {
    fixture = validateFixture(parsed);
  } catch (error: unknown) {
    console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  try {
    // FIX-02：jobId 传 `cli-<fixture_id>`（确定性，保证 CLI 输出可复现）；
    // 结果 JSON 由此携带 jobId / inputHash / specVersion（项目书 §9）。
    const result = await analyze(fixture.input, `cli-${fixture.fixture_id}`);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  } catch (error: unknown) {
    if (isTableForkError(error)) {
      // 表格被内核拒绝：枚举错误码 + message 到 stderr，退出 1，不写输出文件。
      console.error(`ERROR ${error.code}: ${error.message}`);
      return 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR CLI_USAGE: failed to write --out ${outPath}: ${message}`);
    return 2;
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));

/**
 * P029-T011 formal test — taken over from the P029-T008 temporary test.
 *
 * 本文件是 P029-T008 的正式测试（P029-T011 接管，全部断言保留）：覆盖 src/core/records.ts
 * （逐槽 SlotFact 与 §5.4 交接文本）与 src/core/report.ts（公共内核
 * analyze() 与浏览器安全哈希）。正式的 49 Golden（fixtures/golden +
 * tests/core + tests/property）由 T011 接管；本文件不声称测试已完备，
 * T011 接管时可替换或并入正式套件。
 *
 * 所有期望值均为手算（对照 PROJECT_BOOK.md v1.0.2 §5.4/§6.1/§6.3 与
 * T005 日志已钉死的哈希），未从被测实现复制。F(A) 一律由 flatten
 * 真实生成，哈希期望取自 T005 的独立重算（§6），不用手写假值当真值。
 *
 * 关键口径（见 artifacts/logs/T008-records.txt §7）：
 * - J-T008-1：无效输入 analyze() 直接抛 TableForkInputError，不返回
 *   witness='UNSUPPORTED' 的结果；'UNSUPPORTED' 在本层永不产出。
 * - J-T008-2：analyze 入口自身的 schema/strategy/类型校验失败时，
 *   抛 code='INVALID_RAGGED_GRID' 的 TableForkInputError（冻结枚举中
 *   无 INVALID_INPUT，沿用 parse.ts 的兜底桶口径，消息写明真实原因）。
 * - J-T008-3：无 proof 时 AnalyzeResult 省略 proof 字段（不写
 *   `proof: undefined`）；JSON 往返后该字段仍不存在。
 * - J-T008-4：SlotFact 冻结字段里没有 SHARED_SOURCE_CELL 字段位置；
 *   跨槽共享来源格由逐槽记录的同一 cellId 表达，不另加字段。
 * - J-T008-5：WebCrypto 哈希与 witness.sha256Utf8（node:crypto）在
 *   同一输入上逐字节一致；analyze 内部用 WebCrypto 重算 markdown
 *   与 A 图哈希并与 proof 核对。
 * - J-T008-6：value 永远是字符串；17 位数字串不丢精度。
 * - FIX-02（R1 P1-02）：analyze(input, jobId)，结果携带 jobId /
 *   inputHash / specVersion（项目书 §9 优先，§6.1 同步补上）；
 *   inputHash 为输入 HTML 原文的 SHA-256；jobId 必填非空（fail-closed）。
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { compareMarkdown } from '../../src/core/compare';
import { flattenGrid } from '../../src/core/flatten';
import { buildGrid } from '../../src/core/grid';
import { parseValidatedTable, TableForkInputError } from '../../src/core/parse';
import {
  buildSlotFacts,
  formatSlotFact,
  formatSlotFacts,
} from '../../src/core/records';
import { analyze, sha256Utf8WebCrypto } from '../../src/core/report';
import { isTableForkError, SPEC_VERSION } from '../../src/core/types';
import { canonicalCellGraph, findWitness, sha256Utf8 } from '../../src/core/witness';

/** PROJECT_BOOK §6.3 的原始 HTML A（逐字照抄项目书；即 TFK-A）。 */
const SECTION_63_HTML =
  '<table><thead>' +
  '<tr><th rowspan="2">产品</th><th colspan="2">2026预算</th></tr>' +
  '<tr><th>收入</th><th>成本</th></tr>' +
  '</thead><tbody><tr><td>A</td><td>120</td><td>80</td></tr></tbody></table>';

/** §6.3 ORIGIN_EMPTY 的真实 F 值（T004 已逐字节钉死，87 字节，单个末尾 LF）。 */
const SECTION_63_ORIGIN_EMPTY =
  '| 产品 | 2026预算 |  |\n' +
  '| --- | --- | --- |\n' +
  '|  | 收入 | 成本 |\n' +
  '| A | 120 | 80 |\n';

/** §6.3 REPEAT_VALUE 的真实 F 值（T004/T005 已钉死）。 */
const SECTION_63_REPEAT_VALUE =
  '| 产品 | 2026预算 | 2026预算 |\n' +
  '| --- | --- | --- |\n' +
  '| 产品 | 收入 | 成本 |\n' +
  '| A | 120 | 80 |\n';

/** T005 独立重算钉死的 TFK-A 哈希（见 artifacts/logs/T005-witness.txt §5/§6）。 */
const TFK_A_A_GRAPH_SHA256 =
  'dbd4b9cebec9a13f40cfdff378c78d1f59325cdc0e721faa0b4068eb90de157d';
const TFK_A_B_GRAPH_SHA256_ORIGIN_EMPTY =
  'a9ec182caf420715248a255286d2daef973a8e22719691db813dd05d88238bc5';
const TFK_A_B_GRAPH_SHA256_REPEAT_VALUE =
  'ba552bb47172087248e45ce9ad5d71a8c5a4435719c1faac360be665c17e1bd1';
const TFK_A_MARKDOWN_SHA256_ORIGIN_EMPTY =
  '83da510440918640ba87eff47fa11cad70444955f6ce7e36724e4d26765338c1';
const TFK_A_MARKDOWN_SHA256_REPEAT_VALUE =
  'e97edc1bda41731291466e2a64d0338df9abcf7b30f947ce1768592eba0bdffb';

function gridOf(html: string) {
  return buildGrid(parseValidatedTable(html));
}

describe('records: TFK-A (§6.3) 逐槽事实', () => {
  it('facts 为 3 条 td 槽位记录，行主序，value 全是字符串', () => {
    const facts = buildSlotFacts(gridOf(SECTION_63_HTML));
    expect(facts).toHaveLength(3);
    expect(facts.map((f) => [f.row, f.col])).toEqual([
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    expect(facts.map((f) => f.cellId)).toEqual(['c04', 'c05', 'c06']);
    expect(facts.map((f) => f.value)).toEqual(['A', '120', '80']);
    for (const fact of facts) {
      expect(typeof fact.value).toBe('string');
    }
    // 该表 tbody 无 th scope=row：行标题一律未知；列标题齐全。
    expect(facts[0].rowHeaders).toEqual([]);
    expect(facts[0].colHeaders).toEqual(['产品']);
    expect(facts[1].rowHeaders).toEqual([]);
    expect(facts[1].colHeaders).toEqual(['2026预算', '收入']);
    expect(facts[2].rowHeaders).toEqual([]);
    expect(facts[2].colHeaders).toEqual(['2026预算', '成本']);
    for (const fact of facts) {
      expect(fact.headerStatus).toBe('UNKNOWN');
    }
  });

  it('§5.4 交接文本：120 与 80 两行逐字一致，行标题为 ?', () => {
    const facts = buildSlotFacts(gridOf(SECTION_63_HTML));
    expect(formatSlotFact(facts[1])).toBe(
      '[R2C1 source=c05] 行标题: ? | 列标题: 2026预算 > 收入 | 数值: 120',
    );
    expect(formatSlotFact(facts[2])).toBe(
      '[R2C2 source=c06] 行标题: ? | 列标题: 2026预算 > 成本 | 数值: 80',
    );
    expect(formatSlotFact(facts[0])).toBe(
      '[R2C0 source=c04] 行标题: ? | 列标题: 产品 | 数值: A',
    );
    expect(formatSlotFacts(facts)).toBe(
      '[R2C0 source=c04] 行标题: ? | 列标题: 产品 | 数值: A\n' +
        '[R2C1 source=c05] 行标题: ? | 列标题: 2026预算 > 收入 | 数值: 120\n' +
        '[R2C2 source=c06] 行标题: ? | 列标题: 2026预算 > 成本 | 数值: 80',
    );
  });

  it('行标题已知时写真实路径（scope=row），不用首列数据值充当', () => {
    const html =
      '<table><thead><tr><th>项目</th><th>数值</th></tr></thead>' +
      '<tbody><tr><th scope="row">部门X</th><td>a</td></tr>' +
      '<tr><th scope="row">部门Y</th><td>b</td></tr></tbody></table>';
    const facts = buildSlotFacts(gridOf(html));
    expect(facts).toHaveLength(2);
    expect(formatSlotFact(facts[0])).toBe(
      '[R1C1 source=c03] 行标题: 部门X | 列标题: 数值 | 数值: a',
    );
    expect(facts[0].headerStatus).toBe('KNOWN');
    expect(formatSlotFact(facts[1])).toBe(
      '[R2C1 source=c05] 行标题: 部门Y | 列标题: 数值 | 数值: b',
    );
  });

  it('跨槽 td 逐槽出记录，共享同一 cellId（J-T008-4），值不丢', () => {
    const html =
      '<table><tbody><tr><td rowspan="2">v</td><td>x</td></tr>' +
      '<tr><td>y</td></tr></tbody></table>';
    const facts = buildSlotFacts(gridOf(html));
    expect(facts.map((f) => [f.row, f.col, f.cellId, f.value])).toEqual([
      [0, 0, 'c00', 'v'],
      [0, 1, 'c01', 'x'],
      [1, 0, 'c00', 'v'],
      [1, 1, 'c02', 'y'],
    ]);
  });

  it('17 位数字串保持字符串且逐字不丢精度（J-T008-6）', () => {
    const big = '12345678901234567';
    const html = `<table><tbody><tr><td>${big}</td></tr></tbody></table>`;
    const facts = buildSlotFacts(gridOf(html));
    expect(facts).toHaveLength(1);
    expect(typeof facts[0].value).toBe('string');
    expect(facts[0].value).toBe(big);
    // 若被转成 Number 会丢精度：12345678901234567 !== 12345678901234568。
    expect(facts[0].value).not.toBe(String(Number(big)));
    expect(formatSlotFact(facts[0])).toBe(
      `[R0C0 source=c00] 行标题: ? | 列标题: ? | 数值: ${big}`,
    );
  });

  it('无标题表：行列标题都写 ?，不编造', () => {
    const facts = buildSlotFacts(
      gridOf('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'),
    );
    expect(formatSlotFact(facts[0])).toBe(
      '[R0C0 source=c00] 行标题: ? | 列标题: ? | 数值: a',
    );
    expect(facts[0].headerStatus).toBe('UNKNOWN');
  });
});

describe('report: analyze() 对 §6.3 例（ORIGIN_EMPTY）', () => {
  it('返回完整 AnalyzeResult：schema、compare、witness、markdown、facts、proof 齐全', async () => {
    const result = await analyze({
      schema: 'tablefork.input/v1',
      html: SECTION_63_HTML,
      strategy: 'ORIGIN_EMPTY',
    }, 'job-test-1');
    expect(result.schema).toBe('tablefork.report/v1');
    expect(result.compare).toBe('NOT_SUPPLIED');
    expect(result.witness).toBe('CERTIFIED_COLLISION');
    expect(result.canonicalMarkdown).toBe(SECTION_63_ORIGIN_EMPTY);
    expect(result.facts).toHaveLength(3);
    expect(result.facts[1].value).toBe('120');
    expect(result.proof).toBeDefined();
    expect(result.proof?.sourceCellId).toBe('c01');
    expect(result.proof?.splitCost).toBe(1);
    expect(result.proof?.headerAssociationChanged).toBe(true);
    expect(result.proof?.markdownSha256).toBe(TFK_A_MARKDOWN_SHA256_ORIGIN_EMPTY);
    // 3 条 facts 行标题全未知 → 恰一条 unknown-header 警告，无其他警告。
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('3 个数据槽的标题未知');
  });

  it('aGraphSha256 / bGraphSha256 归属准确：与 findWitness 一致，且与 T005 钉死值一致', async () => {
    const result = await analyze({
      schema: 'tablefork.input/v1',
      html: SECTION_63_HTML,
      strategy: 'ORIGIN_EMPTY',
    }, 'job-test-1');
    const witness = findWitness(SECTION_63_HTML, 'ORIGIN_EMPTY');
    expect(result.proof?.aGraphSha256).toBe(witness.proof?.aGraphSha256);
    expect(result.proof?.bGraphSha256).toBe(witness.proof?.bGraphSha256);
    expect(result.proof?.aGraphSha256).toBe(TFK_A_A_GRAPH_SHA256);
    expect(result.proof?.bGraphSha256).toBe(TFK_A_B_GRAPH_SHA256_ORIGIN_EMPTY);
    expect(result.proof?.aGraphSha256).not.toBe(result.proof?.bGraphSha256);
    // 归属：a 是 A 图（原表），b 是 B 图（拆分表）；a 与策略无关，b 随策略变。
    const repeat = await analyze({
      schema: 'tablefork.input/v1',
      html: SECTION_63_HTML,
      strategy: 'REPEAT_VALUE',
    }, 'job-test-1');
    expect(repeat.proof?.aGraphSha256).toBe(TFK_A_A_GRAPH_SHA256);
    expect(repeat.proof?.bGraphSha256).toBe(TFK_A_B_GRAPH_SHA256_REPEAT_VALUE);
    expect(repeat.proof?.sourceCellId).toBe('c00');
    expect(repeat.canonicalMarkdown).toBe(SECTION_63_REPEAT_VALUE);
    expect(repeat.proof?.markdownSha256).toBe(TFK_A_MARKDOWN_SHA256_REPEAT_VALUE);
  });

  it('suppliedMarkdown 提供时调 compare：相等为 EXACT_MATCH，不等为 EXACT_DIFF', async () => {
    const matched = await analyze({
      schema: 'tablefork.input/v1',
      html: SECTION_63_HTML,
      suppliedMarkdown: SECTION_63_ORIGIN_EMPTY,
      strategy: 'ORIGIN_EMPTY',
    }, 'job-test-1');
    expect(matched.compare).toBe('EXACT_MATCH');
    expect(matched.warnings).toHaveLength(1); // 仅 unknown-header 警告

    const diffed = await analyze({
      schema: 'tablefork.input/v1',
      html: SECTION_63_HTML,
      suppliedMarkdown: SECTION_63_ORIGIN_EMPTY.replace('120', '121'),
      strategy: 'ORIGIN_EMPTY',
    }, 'job-test-1');
    expect(diffed.compare).toBe('EXACT_DIFF');
    expect(diffed.warnings[0]).toContain('EXACT_DIFF');
    // M ≠ F(A) 时证书仍只对 F(A) 生效：proof 的 markdown 哈希仍是 F(A) 的。
    expect(diffed.proof?.markdownSha256).toBe(TFK_A_MARKDOWN_SHA256_ORIGIN_EMPTY);
  });

  it('平坦表：NO_WITNESS_FOUND，proof 字段省略（J-T008-3），不谎报保真', async () => {
    const result = await analyze({
      schema: 'tablefork.input/v1',
      html: '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>',
      strategy: 'ORIGIN_EMPTY',
    }, 'job-test-1');
    expect(result.witness).toBe('NO_WITNESS_FOUND');
    expect('proof' in result).toBe(false);
    expect(result.proof).toBeUndefined();
    expect(result.warnings.some((w) => w.includes('NO_WITNESS_FOUND'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('不表示表格保真'))).toBe(true);
  });

  it('JSON.stringify 往返无损：关键字段不变，proof 缺失仍缺失', async () => {
    const certified = await analyze({
      schema: 'tablefork.input/v1',
      html: SECTION_63_HTML,
      strategy: 'ORIGIN_EMPTY',
    }, 'job-test-1');
    const roundTripped = JSON.parse(JSON.stringify(certified)) as typeof certified;
    expect(roundTripped).toEqual(certified);
    expect(roundTripped.proof?.aGraphSha256).toBe(TFK_A_A_GRAPH_SHA256);
    expect(roundTripped.facts[1].value).toBe('120');
    expect(typeof roundTripped.facts[1].value).toBe('string');

    const flat = await analyze({
      schema: 'tablefork.input/v1',
      html: '<table><tbody><tr><td>a</td></tr></tbody></table>',
      strategy: 'ORIGIN_EMPTY',
    }, 'job-test-1');
    const flatRoundTripped = JSON.parse(JSON.stringify(flat)) as typeof flat;
    expect(flatRoundTripped).toEqual(flat);
    expect('proof' in flatRoundTripped).toBe(false);
  });
});

/** §6.3 HTML 原文的 SHA-256（node:crypto 独立重算，与 report 的纯 TS 实现交叉核对）。 */
const SECTION_63_INPUT_HASH =
  '2ebbbde88fa65509a6aac5e8c74884c56361f9442a7b4527fdf6fcdc7a9c0341';

describe('report: FIX-02 jobId / inputHash / specVersion（项目书 §9）', () => {
  it('结果携带三字段：jobId 原样、inputHash 为输入 HTML 原文的 SHA-256、specVersion 为 SPEC_VERSION', async () => {
    const result = await analyze(
      {
        schema: 'tablefork.input/v1',
        html: SECTION_63_HTML,
        strategy: 'ORIGIN_EMPTY',
      },
      'job-test-1',
    );
    expect(result.jobId).toBe('job-test-1');
    expect(result.inputHash).toBe(SECTION_63_INPUT_HASH);
    expect(result.inputHash).toBe(
      createHash('sha256').update(SECTION_63_HTML, 'utf8').digest('hex'),
    );
    expect(result.inputHash).toBe(sha256Utf8(SECTION_63_HTML));
    expect(result.specVersion).toBe('1.0.2');
    expect(result.specVersion).toBe(SPEC_VERSION);
  });

  it('jobId 只改 jobId：不同 jobId 同输入，inputHash 与其余字段不变', async () => {
    const input = {
      schema: 'tablefork.input/v1' as const,
      html: SECTION_63_HTML,
      strategy: 'ORIGIN_EMPTY' as const,
    };
    const first = await analyze(input, 'job-test-1');
    const second = await analyze(input, 'job-test-2');
    expect(first.jobId).toBe('job-test-1');
    expect(second.jobId).toBe('job-test-2');
    expect(second.inputHash).toBe(first.inputHash);
    expect(second.specVersion).toBe(first.specVersion);
    expect(second.canonicalMarkdown).toBe(first.canonicalMarkdown);
    expect(second.proof).toEqual(first.proof);
  });

  it('inputHash 与策略无关、随输入 HTML 变', async () => {
    const origin = await analyze(
      {
        schema: 'tablefork.input/v1',
        html: SECTION_63_HTML,
        strategy: 'ORIGIN_EMPTY',
      },
      'job-test-1',
    );
    const repeat = await analyze(
      {
        schema: 'tablefork.input/v1',
        html: SECTION_63_HTML,
        strategy: 'REPEAT_VALUE',
      },
      'job-test-1',
    );
    expect(repeat.inputHash).toBe(origin.inputHash);
    const other = await analyze(
      {
        schema: 'tablefork.input/v1',
        html: '<table><tbody><tr><td>a</td></tr></tbody></table>',
        strategy: 'ORIGIN_EMPTY',
      },
      'job-test-1',
    );
    expect(other.inputHash).not.toBe(origin.inputHash);
    expect(other.inputHash).toBe(
      createHash('sha256')
        .update('<table><tbody><tr><td>a</td></tr></tbody></table>', 'utf8')
        .digest('hex'),
    );
  });

  it('jobId 为空串 / 缺失时 fail-closed：抛 INVALID_RAGGED_GRID，不返回结果', async () => {
    const input = {
      schema: 'tablefork.input/v1' as const,
      html: SECTION_63_HTML,
      strategy: 'ORIGIN_EMPTY' as const,
    };
    await expect(analyze(input, '')).rejects.toMatchObject({
      code: 'INVALID_RAGGED_GRID',
    });
    await expect(analyze(input, undefined as never)).rejects.toMatchObject({
      code: 'INVALID_RAGGED_GRID',
    });
  });

  it('JSON 往返保留三字段（UI 下载 / CLI 输出 / Worker RESULT 的序列化形状）', async () => {
    const result = await analyze(
      {
        schema: 'tablefork.input/v1',
        html: SECTION_63_HTML,
        strategy: 'ORIGIN_EMPTY',
      },
      'job-test-1',
    );
    const roundTripped = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(roundTripped.jobId).toBe('job-test-1');
    expect(roundTripped.inputHash).toBe(SECTION_63_INPUT_HASH);
    expect(roundTripped.specVersion).toBe('1.0.2');
    expect(Object.keys(roundTripped)).toEqual(
      expect.arrayContaining(['jobId', 'inputHash', 'specVersion']),
    );
  });
});

describe('report: 无效输入抛枚举错误，不返回结果', () => {
  it('schema 错误 / strategy 错误 / html 非字符串 / suppliedMarkdown 非字符串', async () => {
    await expect(
      analyze({
        schema: 'tablefork.input/v2',
        html: SECTION_63_HTML,
        strategy: 'ORIGIN_EMPTY',
      } as never, 'job-test-1'),
    ).rejects.toMatchObject({ code: 'INVALID_RAGGED_GRID' });
    await expect(
      analyze({
        schema: 'tablefork.input/v1',
        html: SECTION_63_HTML,
        strategy: 'BOGUS',
      } as never, 'job-test-1'),
    ).rejects.toMatchObject({ code: 'INVALID_RAGGED_GRID' });
    await expect(
      analyze({
        schema: 'tablefork.input/v1',
        html: 42,
        strategy: 'ORIGIN_EMPTY',
      } as never, 'job-test-1'),
    ).rejects.toMatchObject({ code: 'INVALID_RAGGED_GRID' });
    await expect(
      analyze({
        schema: 'tablefork.input/v1',
        html: SECTION_63_HTML,
        suppliedMarkdown: 42,
        strategy: 'ORIGIN_EMPTY',
      } as never, 'job-test-1'),
    ).rejects.toMatchObject({ code: 'INVALID_RAGGED_GRID' });
    await expect(
      analyze(null as never, 'job-test-1'),
    ).rejects.toMatchObject({ code: 'INVALID_RAGGED_GRID' });
  });

  it('非法表结构抛枚举错误且是 TableForkError（嵌套表 / 无表 / 重叠）', async () => {
    await expect(
      analyze({
        schema: 'tablefork.input/v1',
        html: '<table><tr><td><table><tr><td>x</td></tr></table></td></tr></table>',
        strategy: 'ORIGIN_EMPTY',
      }, 'job-test-1'),
    ).rejects.toThrow(TableForkInputError);
    let caught: unknown;
    try {
      await analyze({
        schema: 'tablefork.input/v1',
        html: '<table><tr><td><table><tr><td>x</td></tr></table></td></tr></table>',
        strategy: 'ORIGIN_EMPTY',
      }, 'job-test-1');
    } catch (err) {
      caught = err;
    }
    expect(isTableForkError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe('UNSUPPORTED_NESTED_TABLE');

    await expect(
      analyze({
        schema: 'tablefork.input/v1',
        html: 'not a table at all',
        strategy: 'ORIGIN_EMPTY',
      }, 'job-test-1'),
    ).rejects.toMatchObject({ code: 'INVALID_RAGGED_GRID' });
  });
});

describe('report: 浏览器安全哈希与 witness 逐字节一致（J-T008-5）', () => {
  it('WebCrypto SHA-256 等于 node:crypto 的 sha256Utf8：含已知向量与 CJK', async () => {
    // 已知向量：'' 与 'abc'。
    expect(await sha256Utf8WebCrypto('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await sha256Utf8WebCrypto('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(await sha256Utf8WebCrypto('')).toBe(sha256Utf8(''));
    expect(await sha256Utf8WebCrypto('abc')).toBe(sha256Utf8('abc'));
    const cjk = '2026预算 > 收入：120';
    expect(await sha256Utf8WebCrypto(cjk)).toBe(sha256Utf8(cjk));
    expect(await sha256Utf8WebCrypto(SECTION_63_ORIGIN_EMPTY)).toBe(
      TFK_A_MARKDOWN_SHA256_ORIGIN_EMPTY,
    );
  });

  it('WebCrypto 哈希等于 witness 的 A 图哈希（同一输入逐字节一致）', async () => {
    const grid = gridOf(SECTION_63_HTML);
    const graph = canonicalCellGraph(grid);
    expect(await sha256Utf8WebCrypto(graph)).toBe(sha256Utf8(graph));
    expect(await sha256Utf8WebCrypto(graph)).toBe(TFK_A_A_GRAPH_SHA256);
  });

  it('compareMarkdown 本身不被 analyze 绕过：M 超限抛 OVER_SIZE', async () => {
    const tooLong = `| ${'x'.repeat(70_000)} |\n| --- |\n`;
    await expect(
      analyze({
        schema: 'tablefork.input/v1',
        html: SECTION_63_HTML,
        suppliedMarkdown: tooLong,
        strategy: 'ORIGIN_EMPTY',
      }, 'job-test-1'),
    ).rejects.toMatchObject({ code: 'OVER_SIZE' });
    // compareMarkdown 直接调用同样抛 OVER_SIZE（T007 行为，analyze 不改写）。
    expect(() => compareMarkdown(tooLong, SECTION_63_ORIGIN_EMPTY)).toThrow(
      TableForkInputError,
    );
  });

  it('flatten 与 compare 的真实值：canonicalMarkdown 与 F(A) 逐字节一致', async () => {
    const grid = gridOf(SECTION_63_HTML);
    expect(flattenGrid(grid, 'ORIGIN_EMPTY')).toBe(SECTION_63_ORIGIN_EMPTY);
    const result = await analyze({
      schema: 'tablefork.input/v1',
      html: SECTION_63_HTML,
      strategy: 'ORIGIN_EMPTY',
    }, 'job-test-1');
    expect(result.canonicalMarkdown).toBe(flattenGrid(grid, 'ORIGIN_EMPTY'));
  });
});

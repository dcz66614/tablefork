/**
 * P029-T011 formal test — taken over from the P029-T005 temporary test.
 *
 * 本文件是 P029-T005 的正式测试（P029-T011 接管，全部断言保留）：覆盖 src/core/witness.ts 的直接行为
 * （§6.3 例、TFK-A/TFK-B 式、选择顺序、B 非法跳过、哈希稳定、无见证例）。
 *  * 所有期望值均为手算（对照 PROJECT_BOOK.md v1.0.2 §5.2/§6.3 与
 * IMPLEMENTATION_PLAN.md §4.1 的冻结选择顺序），未从被测实现复制。
 * 见证比较的字节口径与 flatten.ts 的 J-T004-1 一致：F 输出以单个 LF 结尾。
 *
 * 注意（witness.ts 的 J-T005-7）：§6.3 例在 ORIGIN_EMPTY 下选中 colspan 格
 * c01（项目书 §6.3 原话）；在 REPEAT_VALUE 下选中 rowspan 格 c00——重复的
 * “产品”文本使 col0 路径从 ['产品'] 变为 ['产品','产品']（§3.3 只按 cellId
 * 去重），故它同样是标题路径改变者且排序更靠前；colspan 格在 REPEAT_VALUE
 * 下只是结构碰撞。两种策略都出证、都带 HEADER_ASSOCIATION_CHANGED，
 * 只是选中的源格不同。测试按此冻结口径断言，不为“两种策略都选 colspan”
 * 的误读改口径。
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { flattenGrid, flattenOriginEmpty, flattenRepeatValue } from '../../src/core/flatten';
import { buildGrid } from '../../src/core/grid';
import { isTableForkError } from '../../src/core/index';
import { parseValidatedTable, TableForkInputError } from '../../src/core/parse';
import {
  buildAlternativeHtml,
  canonicalCellGraph,
  findWitness,
  headerPathsChanged,
  sha256Utf8,
  splitCost,
  utf8BytesEqual,
} from '../../src/core/witness';

function gridOf(html: string) {
  return buildGrid(parseValidatedTable(html));
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** PROJECT_BOOK §6.3 的原始 HTML A（逐字照抄项目书；即 TFK-A）。 */
const SECTION_63_HTML =
  '<table><thead>' +
  '<tr><th rowspan="2">产品</th><th colspan="2">2026预算</th></tr>' +
  '<tr><th>收入</th><th>成本</th></tr>' +
  '</thead><tbody><tr><td>A</td><td>120</td><td>80</td></tr></tbody></table>';

/** TFK-B：部门 th scope=row rowspan=2，两个项目行的行标题归属变化。 */
const TFK_B_HTML =
  '<table><thead><tr><th>项目</th><th>数值</th></tr></thead><tbody>' +
  '<tr><th scope="row" rowspan="2">部门X</th><td>a</td></tr>' +
  '<tr><td>b</td></tr></tbody></table>';

/**
 * 独立重算证书：不信任 findWitness 的返回值本身，重新解析 alternativeHtml、
 * 重建网格、重算两种 F 与三个哈希，逐项核对。
 */
function verifyProofIndependently(
  htmlA: string,
  strategy: 'ORIGIN_EMPTY' | 'REPEAT_VALUE',
) {
  const result = findWitness(htmlA, strategy);
  expect(result.status).toBe('CERTIFIED_COLLISION');
  expect(result.proof).toBeDefined();
  const proof = result.proof as NonNullable<typeof result.proof>;
  const gridA = gridOf(htmlA);
  const gridB = gridOf(proof.alternativeHtml);
  // graph 不同：独立重算的哈希与证书一致，且 A/B 哈希不同。
  expect(sha256Hex(canonicalCellGraph(gridA))).toBe(proof.aGraphSha256);
  expect(sha256Hex(canonicalCellGraph(gridB))).toBe(proof.bGraphSha256);
  expect(proof.aGraphSha256).not.toBe(proof.bGraphSha256);
  expect(canonicalCellGraph(gridA)).not.toBe(canonicalCellGraph(gridB));
  // F 字节相等：独立重算的 F(A)/F(B) 逐字节相同，哈希与证书一致。
  const flatten = strategy === 'ORIGIN_EMPTY' ? flattenOriginEmpty : flattenRepeatValue;
  const fa = flatten(gridA);
  const fb = flatten(gridB);
  expect(utf8BytesEqual(fa, fb)).toBe(true);
  expect(fa).toBe(fb);
  expect(sha256Hex(fa)).toBe(proof.markdownSha256);
  // splitCost 与 headerAssociationChanged 与独立重算一致。
  const source = gridA.cells.find((cell) => cell.id === proof.sourceCellId);
  expect(source).toBeDefined();
  expect(splitCost(source as NonNullable<typeof source>)).toBe(proof.splitCost);
  expect(headerPathsChanged(gridA, gridB)).toBe(proof.headerAssociationChanged);
  return { result, proof, gridA, gridB };
}

describe('§6.3 worked example (TFK-A)', () => {
  it('ORIGIN_EMPTY: selects the colspan cell c01, header association changed', () => {
    const { result, proof } = verifyProofIndependently(SECTION_63_HTML, 'ORIGIN_EMPTY');
    expect(proof.sourceCellId).toBe('c01');
    expect(proof.splitCost).toBe(1);
    expect(proof.headerAssociationChanged).toBe(true);
    expect(result.kind).toBe('HEADER_ASSOCIATION_CHANGED');
    // 项目书 §6.3 的 B：第二格为空 th，左边 rowspan="2" 的 th 原样不动。
    expect(proof.alternativeHtml).toContain('<th>2026预算</th><th></th>');
    expect(proof.alternativeHtml).toContain('<th rowspan="2">产品</th>');
  });

  it('REPEAT_VALUE: also certifies, but selects the rowspan cell c00 (J-T005-7)', () => {
    const { result, proof } = verifyProofIndependently(SECTION_63_HTML, 'REPEAT_VALUE');
    expect(proof.sourceCellId).toBe('c00');
    expect(proof.splitCost).toBe(1);
    expect(proof.headerAssociationChanged).toBe(true);
    expect(result.kind).toBe('HEADER_ASSOCIATION_CHANGED');
    // REPEAT_VALUE 的 B：拆的是 rowspan="2" 的“产品”格——第二行出现一个
    // 独立的 <th>产品</th>（延续格填同文），而 colspan="2" 的格原样不动。
    expect(proof.alternativeHtml).toContain('<tr><th>产品</th><th>收入</th><th>成本</th></tr>');
    expect(proof.alternativeHtml).toContain('<th colspan="2">2026预算</th>');
    expect(proof.alternativeHtml).not.toContain('rowspan="2"');
  });

  it('the two strategies build different B tables (per-strategy split, J-T005-1)', () => {
    const origin = findWitness(SECTION_63_HTML, 'ORIGIN_EMPTY');
    const repeat = findWitness(SECTION_63_HTML, 'REPEAT_VALUE');
    expect(origin.proof?.alternativeHtml).not.toBe(repeat.proof?.alternativeHtml);
    expect(origin.proof?.sourceCellId).not.toBe(repeat.proof?.sourceCellId);
  });
});

describe('TFK-B: rowspan row header', () => {
  it('ORIGIN_EMPTY: certifies, header association changed', () => {
    const { result, proof } = verifyProofIndependently(TFK_B_HTML, 'ORIGIN_EMPTY');
    expect(proof.sourceCellId).toBe('c02');
    expect(proof.splitCost).toBe(1);
    expect(proof.headerAssociationChanged).toBe(true);
    expect(result.kind).toBe('HEADER_ASSOCIATION_CHANGED');
    // 延续行变成空的 scope=row th，行标题路径丢失。
    expect(proof.alternativeHtml).toContain('<th scope="row">部门X</th>');
    expect(proof.alternativeHtml).toContain('<th scope="row"></th>');
  });

  it('REPEAT_VALUE: certifies, but structural collision only (J-T005-2)', () => {
    const { result, proof } = verifyProofIndependently(TFK_B_HTML, 'REPEAT_VALUE');
    expect(proof.sourceCellId).toBe('c02');
    expect(proof.splitCost).toBe(1);
    // 重复文本恢复了同样的行标题路径：不是“标题未变所以安全”，只是本构造
    // 下标题归属没有变化，故只说结构碰撞。
    expect(proof.headerAssociationChanged).toBe(false);
    expect(result.kind).toBe('STRUCTURAL_COLLISION');
    // 拆分片落在不同行：第一行与第二行各有一个独立的 scope=row“部门X”格。
    expect(proof.alternativeHtml).toContain('<tr><th scope="row">部门X</th><td>a</td></tr>');
    expect(proof.alternativeHtml).toContain('<tr><th scope="row">部门X</th><td>b</td></tr>');
    expect(proof.alternativeHtml).not.toContain('rowspan="2"');
  });
});

describe('no-witness cases: NO_WITNESS_FOUND is never "proven safe"', () => {
  it('flat table (TFK-C-like): no merged cells, both strategies', () => {
    const flat =
      '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>';
    for (const strategy of ['ORIGIN_EMPTY', 'REPEAT_VALUE'] as const) {
      const result = findWitness(flat, strategy);
      expect(result.status).toBe('NO_WITNESS_FOUND');
      expect(result.proof).toBeUndefined();
      expect(result.kind).toBeUndefined();
      expect(result.candidatesTried).toBe(0);
      expect(result.candidatesCertified).toBe(0);
      expect(result.reason).toMatch(/no merged cells/);
    }
  });

  it('merged empty-text cell still certifies under both strategies (same B)', () => {
    const html =
      '<table><tbody><tr><td colspan="2"></td><td>e</td></tr></tbody></table>';
    const origin = findWitness(html, 'ORIGIN_EMPTY');
    const repeat = findWitness(html, 'REPEAT_VALUE');
    expect(origin.status).toBe('CERTIFIED_COLLISION');
    expect(repeat.status).toBe('CERTIFIED_COLLISION');
    // 源格文本为空时两种策略的延续格填法相同，故是同一张 B。
    expect(origin.proof?.alternativeHtml).toBe(repeat.proof?.alternativeHtml);
    expect(origin.proof?.sourceCellId).toBe('c00');
    expect(origin.proof?.headerAssociationChanged).toBe(false);
    expect(origin.kind).toBe('STRUCTURAL_COLLISION');
  });
});

describe('selection order (frozen: header change first, then cost, row, col, id)', () => {
  it('header-changing candidate wins over a cheaper structural-only one', () => {
    const html =
      '<table><thead><tr><th colspan="3">预算</th></tr>' +
      '<tr><th>A</th><th>B</th><th>C</th></tr></thead>' +
      '<tbody><tr><td colspan="2">x</td><td>y</td></tr></tbody></table>';
    const { proof } = verifyProofIndependently(html, 'ORIGIN_EMPTY');
    // thead 的 colspan=3（代价 2，标题改变）胜过 tbody 的 colspan=2（代价 1，无标题改变）。
    expect(proof.sourceCellId).toBe('c00');
    expect(proof.splitCost).toBe(2);
    expect(proof.headerAssociationChanged).toBe(true);
  });

  it('within header-changing candidates, smaller extra_slots wins', () => {
    const html =
      '<table><thead>' +
      '<tr><th colspan="3">Big</th><th>S</th></tr>' +
      '<tr><th>a</th><th>b</th><th>c</th><th>d</th></tr>' +
      '<tr><th colspan="2">Mid</th><th>e</th><th>f</th></tr>' +
      '</thead><tbody><tr><td>1</td><td>2</td><td>3</td><td>4</td></tr></tbody></table>';
    const { proof } = verifyProofIndependently(html, 'ORIGIN_EMPTY');
    // Big（代价 2）与 Mid（代价 1）都改变标题路径，选代价小的 Mid c06。
    expect(proof.sourceCellId).toBe('c06');
    expect(proof.splitCost).toBe(1);
    expect(proof.headerAssociationChanged).toBe(true);
  });

  it('on a cost tie, the smaller origin column wins', () => {
    const html =
      '<table><thead>' +
      '<tr><th colspan="2">G1</th><th colspan="2">G2</th></tr>' +
      '<tr><th>a</th><th>b</th><th>c</th><th>d</th></tr>' +
      '</thead><tbody><tr><td>1</td><td>2</td><td>3</td><td>4</td></tr></tbody></table>';
    const { proof } = verifyProofIndependently(html, 'ORIGIN_EMPTY');
    expect(proof.sourceCellId).toBe('c00');
    expect(proof.splitCost).toBe(1);
    expect(proof.headerAssociationChanged).toBe(true);
  });
});

describe('B illegal: the candidate is skipped, not certified', () => {
  it('128 DOM cells + a merge: every split B has 129 cells (OVER_SIZE), so no witness', () => {
    // 10 行 × 12 列单格（120 格）+ 1 行 4 个 colspan=2 与 4 个单格（8 格，
    // 覆盖 12 列）= 128 个 DOM 单元格，4 个合并候选；任一拆分都会让 B
    // 达到 129 格，parse 按 OVER_SIZE 拒绝，全部候选被跳过。
    const fullRow = '<tr>' + '<td>x</td>'.repeat(12) + '</tr>';
    const mergedRow =
      '<tr>' +
      '<td colspan="2">m1</td><td colspan="2">m2</td>' +
      '<td colspan="2">m3</td><td colspan="2">m4</td>' +
      '<td>s1</td><td>s2</td><td>s3</td><td>s4</td></tr>';
    const html = `<table><tbody>${fullRow.repeat(10)}${mergedRow}</tbody></table>`;
    // A 本身合法（128 格正好是上限）。
    expect(gridOf(html).cells.length).toBe(128);
    const result = findWitness(html, 'ORIGIN_EMPTY');
    expect(result.status).toBe('NO_WITNESS_FOUND');
    expect(result.proof).toBeUndefined();
    expect(result.candidatesTried).toBe(4);
    expect(result.candidatesCertified).toBe(0);
    expect(result.reason).toMatch(/rejected on re-parse/);
  });

  it('buildAlternativeHtml output always re-parses to the intended grid (spot check)', () => {
    const parsed = parseValidatedTable(SECTION_63_HTML);
    const gridA = buildGrid(parsed);
    const source = gridA.cells.find((cell) => cell.id === 'c01');
    expect(source).toBeDefined();
    if (source === undefined) throw new Error('expected c01 in §6.3 grid');
    const bHtml = buildAlternativeHtml(parsed, gridA, source, 'ORIGIN_EMPTY');
    const gridB = gridOf(bHtml);
    expect(gridB.rows).toBe(gridA.rows);
    expect(gridB.cols).toBe(gridA.cols);
    expect(gridB.cells.length).toBe(gridA.cells.length + 1);
    expect(gridB.cells.find((cell) => cell.id === 'c01')?.text).toBe('2026预算');
    expect(gridB.cells.find((cell) => cell.id === 'c01')?.colSpan).toBe(1);
  });
});

describe('hash stability and byte-exactness', () => {
  it('sha256Utf8 matches known vectors', () => {
    expect(sha256Utf8('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Utf8('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('repeated findWitness calls return byte-identical proofs', () => {
    const first = findWitness(SECTION_63_HTML, 'ORIGIN_EMPTY');
    const second = findWitness(SECTION_63_HTML, 'ORIGIN_EMPTY');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const third = findWitness(TFK_B_HTML, 'REPEAT_VALUE');
    const fourth = findWitness(TFK_B_HTML, 'REPEAT_VALUE');
    expect(JSON.stringify(third)).toBe(JSON.stringify(fourth));
  });

  it('canonicalCellGraph is deterministic for the same grid', () => {
    expect(canonicalCellGraph(gridOf(SECTION_63_HTML))).toBe(
      canonicalCellGraph(gridOf(SECTION_63_HTML)),
    );
    expect(canonicalCellGraph(gridOf(TFK_B_HTML))).not.toBe(
      canonicalCellGraph(gridOf(SECTION_63_HTML)),
    );
  });

  it('utf8BytesEqual is byte-exact (trailing LF matters, J-T004-1)', () => {
    const gridA = gridOf(SECTION_63_HTML);
    const fa = flattenGrid(gridA, 'ORIGIN_EMPTY');
    expect(fa.endsWith('\n')).toBe(true);
    expect(utf8BytesEqual(fa, fa.slice(0, -1))).toBe(false);
    expect(utf8BytesEqual(fa, fa)).toBe(true);
    expect(utf8BytesEqual('产品', '产品')).toBe(true);
    expect(utf8BytesEqual('产品', '產')).toBe(false);
  });
});

describe('invalid input propagates as an error, not NO_WITNESS_FOUND', () => {
  it('nested table throws TableForkInputError with the frozen code', () => {
    const nested =
      '<table><tbody><tr><td><table><tbody><tr><td>x</td></tr></tbody></table></td></tr></tbody></table>';
    let caught: unknown;
    try {
      findWitness(nested, 'ORIGIN_EMPTY');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TableForkInputError);
    expect(isTableForkError(caught)).toBe(true);
    expect((caught as TableForkInputError).code).toBe('UNSUPPORTED_NESTED_TABLE');
  });
});

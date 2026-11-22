/**
 * P029-T011 formal test — 49 Golden vs hand-computed expectations.
 *
 * 预期唯一来源：oracle/golden_expected.json（T006 手算，48 条 G01–G48；FIX-03 新增 G49（NBSP 对齐，R1 P2 #3））。
 * 输入唯一来源：同一文件的 input 字段，经 fixtures/golden/GXX.json 转存
 * （生成脚本 /tmp/gen-golden.mjs，逐文件核对 input.html 严格相等）。
 * 本文件绝不用 TS 输出回填预期：所有期望值都从 golden_expected.json 取。
 *
 * 比对字段（成功案）：rows / cols / slotOwner / cells / facts / handover /
 * F_origin / F_repeat / 见证状态与源格 / splitCost / headerAssociationChanged /
 * 三个 SHA-256 / collision_kind / F(B)。失败案：错误码（只比码，不比消息，
 * 与 Oracle 自身 compare_case 的口径一致）。
 *
 * alternativeHtml 的 O6 口径（T006 §9 / T011 任务卡）：规格未钉死序列化
 * （属性顺序），故 alternativeHtml 只做结构比对——双方的 B HTML 重解析后
 * 比 cells / slotOwner / F(B)；原始字符串差异另记为 O6 备注（见本文件末尾
 * 的汇总测试），不因此判整案失败。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGrid } from '../../src/core/grid';
import { flattenGrid } from '../../src/core/flatten';
import { parseValidatedTable, TableForkInputError } from '../../src/core/parse';
import { buildSlotFacts, formatSlotFacts } from '../../src/core/records';
import { analyze } from '../../src/core/report';
import {
  canonicalCellGraph,
  collisionKindOf,
  findWitness,
  sha256Utf8,
} from '../../src/core/witness';
import type { Strategy } from '../../src/core/index';

const ROOT = join(__dirname, '..', '..');
const GOLDEN_PATH = join(ROOT, 'oracle', 'golden_expected.json');
const FIXTURE_DIR = join(ROOT, 'fixtures', 'golden');

interface OracleCell {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  role: 'TH' | 'TD';
  scope: 'row' | 'col' | null;
  text: string;
  section: 'thead' | 'tbody';
}

interface OracleWitness {
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
  b_cells: OracleCell[] | null;
  b_slotOwner: string[][] | null;
  reason: string | null;
}

interface GoldenEntry {
  fixture_id: string;
  input: { schema: string; html: string; strategy: Strategy };
  expected:
    | { error: { code: string; message: string } }
    | {
        rows: number;
        cols: number;
        slotOwner: string[][];
        cells: OracleCell[];
        facts: unknown[];
        handover: string[];
        f_origin: string;
        f_repeat: string;
        inputHash: string;
        witness: Record<Strategy, OracleWitness>;
      };
}

const goldenDoc = JSON.parse(readFileSync(GOLDEN_PATH, 'utf-8')) as {
  schema: string;
  spec_version: string;
  count: number;
  fixtures: GoldenEntry[];
};

const STRATEGIES: Strategy[] = ['ORIGIN_EMPTY', 'REPEAT_VALUE'];

/** O6 备注收集：alternativeHtml 原始字符串不一致的 Golden（结构比对已另行断言）。 */
const o6StringDiffs: { id: string; strategy: Strategy }[] = [];

function gridOf(html: string) {
  return buildGrid(parseValidatedTable(html));
}

async function analyzeErrorCode(html: string, strategy: Strategy): Promise<string> {
  try {
    await analyze({ schema: 'tablefork.input/v1', html, strategy }, 'job-test-error');
  } catch (err) {
    expect(err).toBeInstanceOf(TableForkInputError);
    return (err as TableForkInputError).code;
  }
  throw new Error('analyze() unexpectedly succeeded on an error fixture');
}

describe('golden_expected.json: document shape', () => {
  it('schema/spec_version/count are frozen v1.0.2 with 49 entries', () => {
    expect(goldenDoc.schema).toBe('tablefork.golden/v1');
    expect(goldenDoc.spec_version).toBe('1.0.2');
    expect(goldenDoc.count).toBe(49);
    expect(goldenDoc.fixtures).toHaveLength(49);
    expect(goldenDoc.fixtures.map((e) => e.fixture_id)).toEqual(
      Array.from({ length: 49 }, (_, i) => `G${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('fixtures/golden holds exactly G01..G49.json, one file per entry', () => {
    const files = readdirSync(FIXTURE_DIR).sort();
    expect(files).toEqual(
      Array.from({ length: 49 }, (_, i) => `G${String(i + 1).padStart(2, '0')}.json`),
    );
  });
});

describe.each(goldenDoc.fixtures)('Golden $fixture_id', (entry) => {
  it('fixture file matches the hand-computed entry input (strict)', () => {
    const fixture = JSON.parse(
      readFileSync(join(FIXTURE_DIR, `${entry.fixture_id}.json`), 'utf-8'),
    ) as {
      fixture_id: string;
      schema: string;
      input: { schema: string; html: string; strategy: Strategy };
      expected_ref: string;
    };
    expect(fixture.fixture_id).toBe(entry.fixture_id);
    expect(fixture.schema).toBe('tablefork.fixture/v1');
    expect(fixture.expected_ref).toBe(entry.fixture_id);
    expect(fixture.input.schema).toBe('tablefork.input/v1');
    expect(fixture.input.html).toBe(entry.input.html);
    expect(fixture.input.strategy).toBe(entry.input.strategy);
  });

  if ('error' in entry.expected) {
    const code = entry.expected.error.code;
    it(`rejected with error code ${code} (code only, messages are worded independently)`, async () => {
      expect(await analyzeErrorCode(entry.input.html, entry.input.strategy)).toBe(code);
      let gridCode = '';
      try {
        gridOf(entry.input.html);
      } catch (err) {
        expect(err).toBeInstanceOf(TableForkInputError);
        gridCode = (err as TableForkInputError).code;
      }
      expect(gridCode).toBe(code);
    });
    return;
  }

  const exp = entry.expected;

  it('grid: rows/cols/slotOwner/cells match the hand computation', () => {
    const grid = gridOf(entry.input.html);
    expect(grid.rows).toBe(exp.rows);
    expect(grid.cols).toBe(exp.cols);
    expect(grid.slotOwner).toEqual(exp.slotOwner);
    expect(grid.cells).toEqual(exp.cells);
  });

  it('facts match the hand computation (SlotFact coverage: see T011 log §8, first inconsistency)', () => {
    const grid = gridOf(entry.input.html);
    const facts = buildSlotFacts(grid);
    expect(facts).toEqual(exp.facts);
  });

  it('handover lines (spec §5.4, td-occupied slots only) match the hand computation', () => {
    const grid = gridOf(entry.input.html);
    const facts = buildSlotFacts(grid);
    expect(formatSlotFacts(facts)).toBe(exp.handover.join('\n'));
  });

  it('both flatten strategies match F_origin / F_repeat byte-for-byte', () => {
    const grid = gridOf(entry.input.html);
    expect(flattenGrid(grid, 'ORIGIN_EMPTY')).toBe(exp.f_origin);
    expect(flattenGrid(grid, 'REPEAT_VALUE')).toBe(exp.f_repeat);
  });

  it('A-graph SHA-256 matches the hand-computed a_graph_sha256', () => {
    const grid = gridOf(entry.input.html);
    const aHash = sha256Utf8(canonicalCellGraph(grid));
    expect(aHash).toBe(exp.witness.ORIGIN_EMPTY.a_graph_sha256);
    expect(aHash).toBe(exp.witness.REPEAT_VALUE.a_graph_sha256);
  });

  for (const strategy of STRATEGIES) {
    it(`witness ${strategy}: status/source/cost/header-change/hashes/F(B) match`, async () => {
      const wExp = exp.witness[strategy];
      const result = await analyze(
        {
          schema: 'tablefork.input/v1',
          html: entry.input.html,
          strategy,
        },
        `job-${entry.fixture_id}`,
      );
      expect(result.schema).toBe('tablefork.report/v1');
      // FIX-02（项目书 §9）：三字段齐全；inputHash 与手算预期及独立重算一致。
      expect(result.jobId).toBe(`job-${entry.fixture_id}`);
      expect(result.inputHash).toBe(exp.inputHash);
      expect(result.inputHash).toBe(sha256Utf8(entry.input.html));
      expect(result.specVersion).toBe('1.0.2');
      expect(result.compare).toBe('NOT_SUPPLIED');
      expect(result.canonicalMarkdown).toBe(
        strategy === 'ORIGIN_EMPTY' ? exp.f_origin : exp.f_repeat,
      );
      expect(result.witness).toBe(wExp.status);
      if (wExp.status !== 'CERTIFIED_COLLISION') {
        expect(result.proof).toBeUndefined();
        expect('proof' in result).toBe(false);
        return;
      }
      expect(result.proof).toBeDefined();
      const proof = result.proof!;
      expect(proof.sourceCellId).toBe(wExp.source_cell_id);
      expect(proof.splitCost).toBe(wExp.split_cost);
      expect(proof.headerAssociationChanged).toBe(wExp.header_association_changed);
      expect(proof.aGraphSha256).toBe(wExp.a_graph_sha256);
      expect(proof.bGraphSha256).toBe(wExp.b_graph_sha256);
      expect(proof.markdownSha256).toBe(wExp.markdown_sha256);
      const witnessResult = findWitness(entry.input.html, strategy);
      expect(collisionKindOf(proof.headerAssociationChanged)).toBe(wExp.collision_kind);
      expect(witnessResult.kind).toBe(wExp.collision_kind);
      // O6 结构比对：TS 的 B HTML 与 Oracle 的 B HTML 各自重解析后，
      // cells / slotOwner / F(B) 必须一致；原始字符串差异只记备注。
      if (proof.alternativeHtml !== wExp.alternative_html) {
        o6StringDiffs.push({ id: entry.fixture_id, strategy });
      }
      const gridB = gridOf(proof.alternativeHtml);
      expect(gridB.cells).toEqual(wExp.b_cells);
      expect(gridB.slotOwner).toEqual(wExp.b_slotOwner);
      expect(flattenGrid(gridB, strategy)).toBe(wExp.f_b);
      expect(sha256Utf8(canonicalCellGraph(gridB))).toBe(wExp.b_graph_sha256);
      if (wExp.alternative_html !== null) {
        const oracleGridB = gridOf(wExp.alternative_html);
        expect(oracleGridB.cells).toEqual(wExp.b_cells);
        expect(oracleGridB.slotOwner).toEqual(wExp.b_slotOwner);
        expect(flattenGrid(oracleGridB, strategy)).toBe(wExp.f_b);
      }
    });
  }
});

describe('O6 note: alternativeHtml raw-string differences (structural comparison only)', () => {
  it('reports how many certified cases differ only in serialization string', () => {
    // 本断言只报告数量，不把字符串差异当失败：规格未钉死属性顺序
    // （T006 O6）。结构等价性已在上面每个 Golden 的 witness 测试中断言。
    // 若未来规格钉死序列化，可把这里收紧为逐字节相等。
    console.log(
      `[T011-O6] alternativeHtml raw-string diffs (structural comparison passed): ` +
        `${o6StringDiffs.length} case(s): ` +
        (o6StringDiffs.length > 0
          ? o6StringDiffs.map((d) => `${d.id}/${d.strategy}`).join(', ')
          : 'none'),
    );
    expect(Array.isArray(o6StringDiffs)).toBe(true);
  });
});

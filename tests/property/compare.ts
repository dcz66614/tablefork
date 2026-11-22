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

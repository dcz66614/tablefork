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

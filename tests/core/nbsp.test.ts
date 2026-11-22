/**
 * P029-FIX-03 regression test — NBSP parity (R1 P2 #3).
 *
 * 规格口径（PROJECT_BOOK.md §3.1，v1.0.2 勘误注）：首尾 trim 仅去 ASCII 空白，
 * U+00A0 保留。此前 TS 的 normalizeCellText 用 JS .trim()，会误去首尾 U+00A0，
 * 而 Oracle normalize_text 用 .strip(" \t\n\r\f\v")、保留 U+00A0；GPT 已实际
 * 复现 `&nbsp;x&nbsp;`：TS 得 `x`，Oracle 保留首尾 NBSP。本卡修 TS 向 Oracle 对齐。
 *
 * 本文件断言两层：
 * 1. normalizeCellText 单元级：首尾 U+00A0 保留，ASCII 空白照常去折叠；
 * 2. Golden G49 端到端：TS 解析 `&nbsp;x&nbsp;` 单元格的字段，与 Oracle 手算
 *    预期（oracle/golden_expected.json G49 条目）逐项一致——即 TS 与 Oracle
 *    对该 Golden 的字段一致（cells / F_origin / F_repeat / inputHash）。
 *    （golden.test.ts 的通用逐案比对同样覆盖 G49；此处把 NBSP 断言点名写死，
 *    使回归失败时直接定位到本缺陷，而不是淹没在 49 案通用循环里。）
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenGrid } from '../../src/core/flatten';
import { buildGrid } from '../../src/core/grid';
import {
  normalizeCellText,
  parseValidatedTable,
} from '../../src/core/parse';
import { sha256Utf8 } from '../../src/core/witness';

const NBSP = '\u00A0';

describe('normalizeCellText keeps leading/trailing U+00A0 (FIX-03, R1 P2 #3)', () => {
  it("GPT repro: '&nbsp;x&nbsp;' normalizes to U+00A0 + x + U+00A0", () => {
    expect(normalizeCellText('&nbsp;x&nbsp;')).toBe(`${NBSP}x${NBSP}`);
  });

  it('a cell of only &nbsp; keeps both NBSPs', () => {
    expect(normalizeCellText('&nbsp;&nbsp;')).toBe(`${NBSP}${NBSP}`);
  });

  it('interior NBSP is untouched and ASCII runs still fold', () => {
    expect(normalizeCellText('a&nbsp;b')).toBe(`a${NBSP}b`);
    expect(normalizeCellText(`&nbsp; x &nbsp;`)).toBe(`${NBSP} x ${NBSP}`);
    expect(normalizeCellText('  x  ')).toBe('x');
    expect(normalizeCellText(' \t x \n ')).toBe('x');
    expect(normalizeCellText('a   b\t\tc')).toBe('a b c');
  });

  it('numeric character reference &#160; is the same NBSP', () => {
    expect(normalizeCellText('&#160;x&#160;')).toBe(`${NBSP}x${NBSP}`);
  });
});

describe('normalizeCellText folds/trims U+000B vertical tab (FIX-04, ISSUE-FIX03-03)', () => {
  const VT = '\u000B';

  it('leading/trailing vertical tabs are trimmed', () => {
    expect(normalizeCellText(`${VT}x${VT}`)).toBe('x');
    expect(normalizeCellText(`${VT}${VT}${VT}x${VT}${VT}`)).toBe('x');
    expect(normalizeCellText(`${VT} ${VT}x${VT} ${VT}`)).toBe('x');
  });

  it('runs of vertical tabs inside a cell fold to one U+0020', () => {
    expect(normalizeCellText(`a${VT}${VT}b`)).toBe('a b');
    expect(normalizeCellText(`a${VT}b`)).toBe('a b');
    expect(normalizeCellText(`a ${VT}\t${VT} b`)).toBe('a b');
  });

  it('a cell of only vertical tabs normalizes to empty', () => {
    expect(normalizeCellText(`${VT}${VT}`)).toBe('');
    expect(normalizeCellText(` \t${VT}\n\r\f `)).toBe('');
  });

  it('vertical tab is folded but U+00A0 is still preserved (FIX-03 unchanged)', () => {
    expect(normalizeCellText(`${VT}${NBSP}x${NBSP}${VT}`)).toBe(`${NBSP}x${NBSP}`);
    expect(normalizeCellText(`a${VT}${NBSP}b`)).toBe(`a ${NBSP}b`);
  });

  it('numeric reference &#11; decodes to a vertical tab and is then trimmed', () => {
    expect(normalizeCellText('&#11;x&#11;')).toBe('x');
    expect(normalizeCellText('a&#11;&#11;b')).toBe('a b');
  });

  it('end-to-end: a cell with vertical tabs parses to the folded text', () => {
    const grid = buildGrid(
      parseValidatedTable(`<table><tr><td>${VT}hello${VT}${VT}world${VT}</td></tr></table>`),
    );
    expect(grid.cells[0].text).toBe('hello world');
  });
});

describe('Golden G49: TS fields equal the Oracle hand computation', () => {
  const ROOT = join(__dirname, '..', '..');
  const fixture = JSON.parse(
    readFileSync(join(ROOT, 'fixtures', 'golden', 'G49.json'), 'utf-8'),
  ) as { input: { html: string; strategy: string } };
  const expectedDoc = JSON.parse(
    readFileSync(join(ROOT, 'oracle', 'golden_expected.json'), 'utf-8'),
  ) as {
    fixtures: {
      fixture_id: string;
      expected: {
        cells: { id: string; text: string }[];
        f_origin: string;
        f_repeat: string;
        inputHash: string;
      };
    }[];
  };
  const g49 = expectedDoc.fixtures.find((e) => e.fixture_id === 'G49')!;
  const html = fixture.input.html;

  it('cell texts keep leading/trailing NBSP exactly as the Oracle expects', () => {
    const grid = buildGrid(parseValidatedTable(html));
    expect(grid.cells.map((c) => [c.id, c.text])).toEqual(
      g49.expected.cells.map((c) => [c.id, c.text]),
    );
    expect(grid.cells[0].text).toBe(`${NBSP}x${NBSP}`);
    expect(grid.cells[1].text).toBe(`y${NBSP}z`);
  });

  it('F_origin / F_repeat keep the NBSPs and match the Oracle', () => {
    const grid = buildGrid(parseValidatedTable(html));
    expect(flattenGrid(grid, 'ORIGIN_EMPTY')).toBe(g49.expected.f_origin);
    expect(flattenGrid(grid, 'REPEAT_VALUE')).toBe(g49.expected.f_repeat);
    expect(g49.expected.f_origin).toContain(`${NBSP}x${NBSP}`);
  });

  it('inputHash equals the independent SHA-256 of the G49 HTML', () => {
    expect(g49.expected.inputHash).toBe(sha256Utf8(html));
  });
});

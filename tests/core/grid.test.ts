/**
 * P029-T011 formal test — taken over from the P029-T003 temporary test.
 *
 * 本文件是 P029-T003 的正式测试（P029-T011 接管，全部断言保留）：覆盖 parse.ts / grid.ts / headers.ts
 * 的直接行为（G01–G08 基础网格、G17–G24 跨行、拒绝用例、标题 UNKNOWN）。
 *  * 所有期望值均为手算（对照 PROJECT_BOOK.md v1.0.2 §3.2/§3.3/§6.3），
 * 未从被测实现复制。
 */
import { describe, expect, it } from 'vitest';
import { buildGrid } from '../../src/core/grid';
import { buildHeaderPaths, headerStatusFor } from '../../src/core/headers';
import { parseValidatedTable, TableForkInputError } from '../../src/core/parse';
import { isTableForkError } from '../../src/core/index';

function gridOf(html: string) {
  return buildGrid(parseValidatedTable(html));
}

/** 断言 parse + buildGrid 全流程抛指定枚举码（且为 TableForkInputError）。 */
function expectCode(html: string, code: string) {
  let caught: unknown;
  try {
    gridOf(html);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(TableForkInputError);
  expect(isTableForkError(caught)).toBe(true);
  expect((caught as TableForkInputError).code).toBe(code);
  expect(typeof (caught as TableForkInputError).message).toBe('string');
  expect((caught as TableForkInputError).message.length).toBeGreaterThan(0);
}

describe('G01–G08 basic grids', () => {
  it('G01: plain 2x2 td-only table, no headers', () => {
    const g = gridOf(
      '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>',
    );
    expect(g.rows).toBe(2);
    expect(g.cols).toBe(2);
    expect(g.slotOwner).toEqual([
      ['c00', 'c01'],
      ['c02', 'c03'],
    ]);
    expect(g.cells.map((c) => [c.id, c.row, c.col, c.text])).toEqual([
      ['c00', 0, 0, 'a'],
      ['c01', 0, 1, 'b'],
      ['c02', 1, 0, 'c'],
      ['c03', 1, 1, 'd'],
    ]);
    const paths = buildHeaderPaths(g);
    expect(paths[0][0].headerStatus).toBe('UNKNOWN');
    expect(paths[1][1].rowHeaders).toEqual([]);
    expect(paths[1][1].colHeaders).toEqual([]);
  });

  it('G02: single header row gives column paths, row paths stay unknown', () => {
    const g = gridOf(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
    expect(g.rows).toBe(2);
    expect(g.cols).toBe(2);
    const paths = buildHeaderPaths(g);
    expect(paths[1][0].colHeaders).toEqual(['A']);
    expect(paths[1][1].colHeaders).toEqual(['B']);
    expect(paths[1][0].rowHeaders).toEqual([]);
    expect(paths[1][1].headerStatus).toBe('UNKNOWN');
  });

  it('G03: thead th + tbody th scope=row gives KNOWN facts', () => {
    const g = gridOf(
      '<table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><th scope="row">R1</th><td>v</td></tr></tbody></table>',
    );
    const paths = buildHeaderPaths(g);
    expect(paths[1][1].rowHeaders).toEqual(['R1']);
    expect(paths[1][1].colHeaders).toEqual(['H2']);
    expect(paths[1][1].headerStatus).toBe('KNOWN');
    expect(g.cells[2]).toMatchObject({ role: 'TH', scope: 'row', section: 'tbody' });
  });

  it('G04: empty header text contributes no path item', () => {
    const g = gridOf(
      '<table><thead><tr><th></th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
    const paths = buildHeaderPaths(g);
    expect(paths[1][0].colHeaders).toEqual([]);
    expect(paths[1][1].colHeaders).toEqual(['B']);
    expect(paths[1][0].headerStatus).toBe('UNKNOWN');
  });

  it('G05: empty data cells are legal and keep empty text', () => {
    const g = gridOf('<table><tbody><tr><td></td><td> </td></tr></tbody></table>');
    expect(g.rows).toBe(1);
    expect(g.cols).toBe(2);
    expect(g.cells.map((c) => c.text)).toEqual(['', '']);
  });

  it('G06: single cell 1x1, bare <tr> counts as tbody', () => {
    const g = gridOf('<table><tr><td>only</td></tr></table>');
    expect(g.rows).toBe(1);
    expect(g.cols).toBe(1);
    expect(g.cells).toHaveLength(1);
    expect(g.cells[0]).toMatchObject({ id: 'c00', row: 0, col: 0, section: 'tbody' });
  });

  it('G07: thead-only table is valid', () => {
    const g = gridOf('<table><thead><tr><th>A</th><th>B</th></tr></thead></table>');
    expect(g.rows).toBe(1);
    expect(g.cols).toBe(2);
    expect(g.cells.every((c) => c.role === 'TH' && c.section === 'thead')).toBe(true);
  });

  it('G08: tbody-only table has no header paths', () => {
    const g = gridOf(
      '<table><tbody><tr><td>a</td></tr><tr><td>b</td></tr></tbody></table>',
    );
    const paths = buildHeaderPaths(g);
    expect(paths.flat().every((p) => p.headerStatus === 'UNKNOWN')).toBe(true);
  });

  it('numeric-looking text stays a string, never a JS Number', () => {
    const g = gridOf('<table><tr><td>12345678901234567890</td></tr></table>');
    expect(g.cells[0].text).toBe('12345678901234567890');
    expect(typeof g.cells[0].text).toBe('string');
  });
});

describe('PROJECT_BOOK §6.3 worked example + S0 P1-01 regression', () => {
  const html =
    '<table><thead><tr><th rowspan="2">产品</th><th colspan="2">2026预算</th></tr>' +
    '<tr><th>收入</th><th>成本</th></tr></thead>' +
    '<tbody><tr><td>A</td><td>120</td><td>80</td></tr></tbody></table>';

  it('slotOwner matrix and stable cell ids (120 is c05)', () => {
    const g = gridOf(html);
    expect(g.rows).toBe(3);
    expect(g.cols).toBe(3);
    expect(g.slotOwner).toEqual([
      ['c00', 'c01', 'c01'],
      ['c00', 'c02', 'c03'],
      ['c04', 'c05', 'c06'],
    ]);
    expect(g.cells.map((c) => [c.id, c.row, c.col, c.rowSpan, c.colSpan, c.text])).toEqual([
      ['c00', 0, 0, 2, 1, '产品'],
      ['c01', 0, 1, 1, 2, '2026预算'],
      ['c02', 1, 1, 1, 1, '收入'],
      ['c03', 1, 2, 1, 1, '成本'],
      ['c04', 2, 0, 1, 1, 'A'],
      ['c05', 2, 1, 1, 1, '120'],
      ['c06', 2, 2, 1, 1, '80'],
    ]);
  });

  it('column paths are two-level; row paths are empty (no th scope=row)', () => {
    const g = gridOf(html);
    const paths = buildHeaderPaths(g);
    expect(paths[2][0].colHeaders).toEqual(['产品']);
    expect(paths[2][1].colHeaders).toEqual(['2026预算', '收入']);
    expect(paths[2][2].colHeaders).toEqual(['2026预算', '成本']);
    // S0 P1-01: tbody has no th scope=row, so the first-column data value 'A'
    // must NOT become a row header; row title is unknown ('?'), not 'A'.
    expect(paths[2][1].rowHeaders).toEqual([]);
    expect(paths[2][1].headerStatus).toBe('UNKNOWN');
  });

  it('caption text is captured and does not affect the grid', () => {
    const parsed = parseValidatedTable(
      '<table><caption>Title</caption><tbody><tr><td>x</td></tr></tbody></table>',
    );
    expect(parsed.captionText).toBe('Title');
    expect(buildGrid(parsed).slotOwner).toEqual([['c00']]);
  });
});

describe('G17–G24 rowspan', () => {
  it('thead th rowspan=2 covers two rows; its text appears once in colPath', () => {
    const g = gridOf(
      '<table><thead><tr><th rowspan="2">A</th><th>B</th></tr><tr><th>C</th></tr></thead>' +
        '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
    expect(g.slotOwner).toEqual([
      ['c00', 'c01'],
      ['c00', 'c02'],
      ['c03', 'c04'],
    ]);
    const paths = buildHeaderPaths(g);
    expect(paths[2][0].colHeaders).toEqual(['A']);
    expect(paths[2][1].colHeaders).toEqual(['B', 'C']);
  });

  it('tbody th scope=row rowspan=2: continuation row reuses the same header once', () => {
    const g = gridOf(
      '<table><thead><tr><th>项目</th><th>数值</th></tr></thead><tbody>' +
        '<tr><th scope="row" rowspan="2">部门X</th><td>a</td></tr><tr><td>b</td></tr>' +
        '</tbody></table>',
    );
    expect(g.slotOwner).toEqual([
      ['c00', 'c01'],
      ['c02', 'c03'],
      ['c02', 'c04'],
    ]);
    const paths = buildHeaderPaths(g);
    expect(paths[1][1].rowHeaders).toEqual(['部门X']);
    expect(paths[2][1].rowHeaders).toEqual(['部门X']);
    expect(paths[2][1].colHeaders).toEqual(['数值']);
    expect(paths[2][1].headerStatus).toBe('KNOWN');
  });

  it('rowspan=3 fills three rows', () => {
    const g = gridOf(
      '<table><tbody><tr><td rowspan="3">A</td><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></tbody></table>',
    );
    expect(g.rows).toBe(3);
    expect(g.slotOwner).toEqual([
      ['c00', 'c01'],
      ['c00', 'c02'],
      ['c00', 'c03'],
    ]);
  });

  it('rowspan crossing the thead/tbody boundary is INVALID_SPAN', () => {
    expectCode(
      '<table><thead><tr><th rowspan="2">A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>',
      'INVALID_SPAN',
    );
  });

  it.each(['0', '9', 'abc', '2.5'])('rowspan="%s" is INVALID_SPAN', (span) => {
    expectCode(
      `<table><tbody><tr><td rowspan="${span}">A</td></tr></tbody></table>`,
      'INVALID_SPAN',
    );
  });

  it('rowspan beyond the last row is INVALID_SPAN', () => {
    expectCode(
      '<table><tbody><tr><td rowspan="2">A</td></tr></tbody></table>',
      'INVALID_SPAN',
    );
  });

  it.each(['9', '0'])('colspan="%s" is INVALID_SPAN', (span) => {
    expectCode(
      `<table><tbody><tr><td colspan="${span}">A</td></tr></tbody></table>`,
      'INVALID_SPAN',
    );
  });
});

describe('overlap / ragged / size limits', () => {
  it('colspan reaching into a rowspan from above is INVALID_GRID_OVERLAP', () => {
    expectCode(
      '<table><tbody><tr><td rowspan="2">A</td><td>B</td><td rowspan="2">C</td></tr>' +
        '<tr><td colspan="3">D</td></tr></tbody></table>',
      'INVALID_GRID_OVERLAP',
    );
  });

  it('short row is INVALID_RAGGED_GRID', () => {
    expectCode(
      '<table><tbody><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td><td>e</td></tr></tbody></table>',
      'INVALID_RAGGED_GRID',
    );
  });

  it('hole in the middle of a row (empty <tr> under rowspans) is INVALID_RAGGED_GRID', () => {
    expectCode(
      '<table><tbody><tr><td rowspan="2">A</td><td>B</td><td rowspan="2">C</td></tr><tr></tr></tbody></table>',
      'INVALID_RAGGED_GRID',
    );
  });

  it('row with no cells and no covering spans is INVALID_RAGGED_GRID', () => {
    expectCode(
      '<table><tbody><tr><td>a</td></tr><tr></tr></tbody></table>',
      'INVALID_RAGGED_GRID',
    );
  });

  it('33 rows is OVER_SIZE', () => {
    expectCode(`<table>${'<tr><td>x</td></tr>'.repeat(33)}</table>`, 'OVER_SIZE');
  });

  it('13 columns is OVER_SIZE', () => {
    expectCode(`<table><tr>${'<td>x</td>'.repeat(13)}</tr></table>`, 'OVER_SIZE');
  });

  it('132 DOM cells (11x12) is OVER_SIZE', () => {
    const row = `<tr>${'<td>x</td>'.repeat(12)}</tr>`;
    expectCode(`<table>${row.repeat(11)}</table>`, 'OVER_SIZE');
  });

  it('input over 64 KiB is OVER_SIZE', () => {
    expectCode(`<table><tr><td>${'x'.repeat(70000)}</td></tr></table>`, 'OVER_SIZE');
  });

  it('empty table (0 rows) is OVER_SIZE', () => {
    expectCode('<table></table>', 'OVER_SIZE');
  });
});

describe('unsupported / invalid inputs', () => {
  it('nested table inside a cell is UNSUPPORTED_NESTED_TABLE', () => {
    expectCode(
      '<table><tr><td><table><tr><td>inner</td></tr></table></td></tr></table>',
      'UNSUPPORTED_NESTED_TABLE',
    );
  });

  it('nested table inside a caption is UNSUPPORTED_NESTED_TABLE', () => {
    expectCode(
      '<table><caption><table><tr><td>x</td></tr></table></caption><tr><td>y</td></tr></table>',
      'UNSUPPORTED_NESTED_TABLE',
    );
  });

  it('two top-level tables are UNSUPPORTED_NESTED_TABLE', () => {
    expectCode(
      '<table><tr><td>a</td></tr></table><table><tr><td>b</td></tr></table>',
      'UNSUPPORTED_NESTED_TABLE',
    );
  });

  it.each(['th', 'td'])('headers attribute on <%s> is UNSUPPORTED_HEADER_SEMANTICS', (tag) => {
    expectCode(
      `<table><tr><${tag} headers="h1">x</${tag}></tr></table>`,
      'UNSUPPORTED_HEADER_SEMANTICS',
    );
  });

  it.each(['rowgroup', 'colgroup', 'foo'])(
    'scope="%s" is UNSUPPORTED_HEADER_SEMANTICS',
    (scope) => {
      expectCode(
        `<table><tr><th scope="${scope}">x</th></tr></table>`,
        'UNSUPPORTED_HEADER_SEMANTICS',
      );
    },
  );

  it('scope="col" on a tbody th is UNSUPPORTED_HEADER_SEMANTICS', () => {
    expectCode(
      '<table><tbody><tr><th scope="col">x</th></tr></tbody></table>',
      'UNSUPPORTED_HEADER_SEMANTICS',
    );
  });

  it('scope="row" on a thead th is UNSUPPORTED_HEADER_SEMANTICS', () => {
    expectCode(
      '<table><thead><tr><th scope="row">x</th></tr></thead></table>',
      'UNSUPPORTED_HEADER_SEMANTICS',
    );
  });

  it('disallowed element <b> inside a cell is rejected (INVALID_RAGGED_GRID)', () => {
    expectCode(
      '<table><tr><td><b>bold</b></td></tr></table>',
      'INVALID_RAGGED_GRID',
    );
  });

  it('script inside a cell is rejected, never executed', () => {
    expectCode(
      '<table><tr><td><script>alert(1)</script></td></tr></table>',
      'INVALID_RAGGED_GRID',
    );
  });

  it('element wrapping the table (<div>) is rejected', () => {
    expectCode(
      '<div><table><tr><td>x</td></tr></table></div>',
      'INVALID_RAGGED_GRID',
    );
  });

  it('no <table> at all is rejected', () => {
    expectCode('hello', 'INVALID_RAGGED_GRID');
    expectCode('', 'INVALID_RAGGED_GRID');
  });

  it('<tfoot> is not in the limited subset', () => {
    expectCode(
      '<table><tfoot><tr><td>x</td></tr></tfoot></table>',
      'INVALID_RAGGED_GRID',
    );
  });

  it('multiple <thead> / <tbody> sections are rejected', () => {
    expectCode(
      '<table><thead><tr><th>A</th></tr></thead><thead><tr><th>B</th></tr></thead></table>',
      'INVALID_RAGGED_GRID',
    );
    expectCode(
      '<table><tbody><tr><td>a</td></tr></tbody><tbody><tr><td>b</td></tr></tbody></table>',
      'INVALID_RAGGED_GRID',
    );
  });

  it('mismatched end tag (</td> closing <th>) is rejected', () => {
    expectCode('<table><tr><th>x</td></tr></table>', 'INVALID_RAGGED_GRID');
  });

  it('unclosed <table> is rejected', () => {
    expectCode('<table><tr><td>x</td></tr>', 'INVALID_RAGGED_GRID');
  });

  it('non-whitespace text directly inside <table> is rejected', () => {
    expectCode('<table>hello<tr><td>x</td></tr></table>', 'INVALID_RAGGED_GRID');
  });

  it('<td> outside <tr> is rejected', () => {
    expectCode('<table><td>x</td></table>', 'INVALID_RAGGED_GRID');
  });

  it('<colgroup> is not in the limited subset', () => {
    expectCode(
      '<table><colgroup><col span="2"></colgroup><tr><td>x</td></tr></table>',
      'INVALID_RAGGED_GRID',
    );
  });
});

describe('header UNKNOWN: never fabricate', () => {
  it('tbody th without scope is NOT a row header (scope null, row path empty)', () => {
    const g = gridOf(
      '<table><thead><tr><th>H</th><th>H2</th></tr></thead><tbody><tr><th>R?</th><td>v</td></tr></tbody></table>',
    );
    expect(g.cells[2].scope).toBeNull();
    const paths = buildHeaderPaths(g);
    expect(paths[1][1].rowHeaders).toEqual([]);
    expect(paths[1][1].colHeaders).toEqual(['H2']);
    expect(paths[1][1].headerStatus).toBe('UNKNOWN');
  });

  it('headerStatusFor: KNOWN only when both paths are non-empty', () => {
    expect(headerStatusFor([], [])).toBe('UNKNOWN');
    expect(headerStatusFor(['R'], [])).toBe('UNKNOWN');
    expect(headerStatusFor([], ['C'])).toBe('UNKNOWN');
    expect(headerStatusFor(['R'], ['C'])).toBe('KNOWN');
  });

  it('thead td is not a column header', () => {
    const g = gridOf(
      '<table><thead><tr><td>X</td><th>H</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
    const paths = buildHeaderPaths(g);
    expect(paths[1][0].colHeaders).toEqual([]);
    expect(paths[1][1].colHeaders).toEqual(['H']);
  });
});

describe('entities and whitespace normalisation (§3.1)', () => {
  it('decodes common entities', () => {
    const g = gridOf('<table><tr><td>a &amp; b</td><td>&lt;tag&gt; &quot;q&quot;</td></tr></table>');
    expect(g.cells.map((c) => c.text)).toEqual(['a & b', '<tag> "q"']);
  });

  it('decodes decimal and hex numeric references', () => {
    const g = gridOf('<table><tr><td>&#65;&#x42;</td></tr></table>');
    expect(g.cells[0].text).toBe('AB');
  });

  it('unknown named entity stays literal', () => {
    const g = gridOf('<table><tr><td>&nosuch;</td></tr></table>');
    expect(g.cells[0].text).toBe('&nosuch;');
  });

  it('collapses consecutive ASCII whitespace to one space and trims', () => {
    const g = gridOf('<table><tr><td>  a   b\n\t c  </td></tr></table>');
    expect(g.cells[0].text).toBe('a b c');
  });

  it('interior &nbsp; is preserved as U+00A0', () => {
    const g = gridOf('<table><tr><td>a&nbsp;b</td></tr></table>');
    expect(g.cells[0].text).toBe('a\u00A0b');
  });

  it('literal "<" not starting a tag stays text', () => {
    const g = gridOf('<table><tr><td>a < b</td></tr></table>');
    expect(g.cells[0].text).toBe('a < b');
  });
});

describe('HTML details and cancellation', () => {
  it('uppercase tags and comments are accepted', () => {
    const g = gridOf('<!-- hi --><TABLE><TR><TD>x</TD></TR></TABLE>');
    expect(g.slotOwner).toEqual([['c00']]);
  });

  it('implicit cell close by the next cell (HTML rule) is accepted', () => {
    const g = gridOf('<table><tr><td>a<td>b</tr></table>');
    expect(g.slotOwner).toEqual([['c00', 'c01']]);
  });

  it('implicit row close by the next row (HTML rule) is accepted', () => {
    const g = gridOf('<table><tr><td>a</td><tr><td>b</td></tr></table>');
    expect(g.slotOwner).toEqual([['c00'], ['c01']]);
  });

  it('aborted signal raises CANCELLED', () => {
    const controller = new AbortController();
    controller.abort();
    let caught: unknown;
    try {
      parseValidatedTable('<table><tr><td>x</td></tr></table>', { signal: controller.signal });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TableForkInputError);
    expect((caught as TableForkInputError).code).toBe('CANCELLED');
  });

  it('isTableForkError recognises the error shape only', () => {
    expect(isTableForkError({ code: 'OVER_SIZE', message: 'x' })).toBe(true);
    expect(isTableForkError({ code: 'NOPE', message: 'x' })).toBe(false);
    expect(isTableForkError(new Error('boom'))).toBe(false);
  });
});

/**
 * P029-T011 formal test — taken over from the P029-T004 temporary test.
 *
 * 本文件是 P029-T004 的正式测试（P029-T011 接管，全部断言保留）：覆盖 src/core/flatten.ts 的直接行为
 * （两种 F 策略逐字节输出、§6.3 例、逃逸、CRLF 输入、100 次确定性、
 * 空值格/空标题）。正式的 49 Golden（fixtures/golden + tests/core +
 * tests/property）由 T011 接管；本文件不声称测试已完备，T011 接管时可
 * 替换或并入正式套件。
 *
 * 所有期望值均为手算（对照 PROJECT_BOOK.md v1.0.2 §5.1/§6.3），未从被测
 * 实现复制。末行换行口径见 flatten.ts 头部 J-T004-1：每行以 LF 终止，
 * 含末行（输出以单个 LF 结尾）。
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  escapeMarkdownCell,
  flattenGrid,
  flattenOriginEmpty,
  flattenRepeatValue,
} from '../../src/core/flatten';
import { buildGrid } from '../../src/core/grid';
import { parseValidatedTable } from '../../src/core/parse';

function gridOf(html: string) {
  return buildGrid(parseValidatedTable(html));
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** PROJECT_BOOK §6.3 的原始 HTML A（逐字照抄项目书）。 */
const SECTION_63_HTML =
  '<table><thead>' +
  '<tr><th rowspan="2">产品</th><th colspan="2">2026预算</th></tr>' +
  '<tr><th>收入</th><th>成本</th></tr>' +
  '</thead><tbody><tr><td>A</td><td>120</td><td>80</td></tr></tbody></table>';

describe('§6.3 worked example (byte-exact)', () => {
  it('ORIGIN_EMPTY matches the four §6.3 lines byte-for-byte (incl. trailing LF)', () => {
    const out = flattenOriginEmpty(gridOf(SECTION_63_HTML));
    expect(out).toBe(
      '| 产品 | 2026预算 |  |\n' +
        '| --- | --- | --- |\n' +
        '|  | 收入 | 成本 |\n' +
        '| A | 120 | 80 |\n',
    );
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
    expect(out).not.toContain('\r');
  });

  it('REPEAT_VALUE repeats the origin text into every covered slot', () => {
    const out = flattenRepeatValue(gridOf(SECTION_63_HTML));
    expect(out).toBe(
      '| 产品 | 2026预算 | 2026预算 |\n' +
        '| --- | --- | --- |\n' +
        '| 产品 | 收入 | 成本 |\n' +
        '| A | 120 | 80 |\n',
    );
  });

  it('flattenGrid(strategy) agrees with the named helpers', () => {
    const g = gridOf(SECTION_63_HTML);
    expect(flattenGrid(g, 'ORIGIN_EMPTY')).toBe(flattenOriginEmpty(g));
    expect(flattenGrid(g, 'REPEAT_VALUE')).toBe(flattenRepeatValue(g));
    expect(flattenOriginEmpty(g)).not.toBe(flattenRepeatValue(g));
  });
});

describe('no-span tables: both strategies agree', () => {
  it('plain 2x2 td-only', () => {
    const g = gridOf(
      '<table><tbody><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></tbody></table>',
    );
    const expected = '| a | b |\n| --- | --- |\n| c | d |\n';
    expect(flattenOriginEmpty(g)).toBe(expected);
    expect(flattenRepeatValue(g)).toBe(expected);
  });

  it('1x1 single cell still gets a separator row after row 1', () => {
    const g = gridOf('<table><tbody><tr><td>only</td></tr></tbody></table>');
    expect(flattenOriginEmpty(g)).toBe('| only |\n| --- |\n');
  });
});

describe('colspan / rowspan splits (G09–G24 flavour)', () => {
  it('colspan=2 header: ORIGIN_EMPTY leaves the extension blank', () => {
    const g = gridOf(
      '<table><thead><tr><th colspan="2">预算</th></tr></thead>' +
        '<tbody><tr><td>120</td><td>80</td></tr></tbody></table>',
    );
    expect(flattenOriginEmpty(g)).toBe(
      '| 预算 |  |\n| --- | --- |\n| 120 | 80 |\n',
    );
  });

  it('colspan=2 header: REPEAT_VALUE copies the header into the extension', () => {
    const g = gridOf(
      '<table><thead><tr><th colspan="2">预算</th></tr></thead>' +
        '<tbody><tr><td>120</td><td>80</td></tr></tbody></table>',
    );
    expect(flattenRepeatValue(g)).toBe(
      '| 预算 | 预算 |\n| --- | --- |\n| 120 | 80 |\n',
    );
  });

  it('colspan=3 header grouping', () => {
    const g = gridOf(
      '<table><thead><tr><th colspan="3">总计</th></tr>' +
        '<tr><th>A</th><th>B</th><th>C</th></tr></thead>' +
        '<tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>',
    );
    expect(flattenOriginEmpty(g)).toBe(
      '| 总计 |  |  |\n' +
        '| --- | --- | --- |\n' +
        '| A | B | C |\n' +
        '| 1 | 2 | 3 |\n',
    );
    expect(flattenRepeatValue(g)).toBe(
      '| 总计 | 总计 | 总计 |\n' +
        '| --- | --- | --- |\n' +
        '| A | B | C |\n' +
        '| 1 | 2 | 3 |\n',
    );
  });

  it('rowspan=2 row header (TFK-B-like): ORIGIN_EMPTY blanks the continuation', () => {
    const g = gridOf(
      '<table><thead><tr><th>项目</th><th>数值</th></tr></thead><tbody>' +
        '<tr><th scope="row" rowspan="2">部门X</th><td>a</td></tr>' +
        '<tr><td>b</td></tr></tbody></table>',
    );
    expect(flattenOriginEmpty(g)).toBe(
      '| 项目 | 数值 |\n| --- | --- |\n| 部门X | a |\n|  | b |\n',
    );
  });

  it('rowspan=2 row header (TFK-B-like): REPEAT_VALUE repeats into the continuation', () => {
    const g = gridOf(
      '<table><thead><tr><th>项目</th><th>数值</th></tr></thead><tbody>' +
        '<tr><th scope="row" rowspan="2">部门X</th><td>a</td></tr>' +
        '<tr><td>b</td></tr></tbody></table>',
    );
    expect(flattenRepeatValue(g)).toBe(
      '| 项目 | 数值 |\n| --- | --- |\n| 部门X | a |\n| 部门X | b |\n',
    );
  });

  it('2x2 span: both strategies differ only in the extension slots', () => {
    const g = gridOf(
      '<table><tbody><tr><td rowspan="2" colspan="2">M</td><td>x</td></tr>' +
        '<tr><td>y</td></tr></tbody></table>',
    );
    expect(flattenOriginEmpty(g)).toBe(
      '| M |  | x |\n| --- | --- | --- |\n|  |  | y |\n',
    );
    expect(flattenRepeatValue(g)).toBe(
      '| M | M | x |\n| --- | --- | --- |\n| M | M | y |\n',
    );
  });
});

describe('escaping (§5.1: backslash first, then pipe)', () => {
  it('escapeMarkdownCell escapes backslash before pipe', () => {
    expect(escapeMarkdownCell('a|b')).toBe('a\\|b');
    expect(escapeMarkdownCell('a\\b')).toBe('a\\\\b');
    // Input `\|` (backslash + pipe): backslash first -> `\\|`, then pipe -> `\\\|`.
    expect(escapeMarkdownCell('\\|')).toBe('\\\\\\|');
    expect(escapeMarkdownCell('\\')).toBe('\\\\');
    expect(escapeMarkdownCell('|')).toBe('\\|');
    expect(escapeMarkdownCell('plain')).toBe('plain');
    expect(escapeMarkdownCell('')).toBe('');
  });

  it('pipe and backslash inside cells are escaped in both strategies', () => {
    const g = gridOf(
      '<table><tbody><tr><td>a|b\\c</td><td>x\\y|z</td></tr></tbody></table>',
    );
    const expected = '| a\\|b\\\\c | x\\\\y\\|z |\n| --- | --- |\n';
    expect(flattenOriginEmpty(g)).toBe(expected);
    expect(flattenRepeatValue(g)).toBe(expected);
  });

  it('other Markdown metacharacters are NOT escaped (J-T004-4)', () => {
    const g = gridOf(
      '<table><tbody><tr><td>*em* _u_ `code` #h</td><td>“你好”</td></tr></tbody></table>',
    );
    expect(flattenOriginEmpty(g)).toBe(
      '| *em* _u_ `code` #h | “你好” |\n| --- | --- |\n',
    );
  });
});

describe('CRLF input behaviour (§5.1: output is LF only)', () => {
  it('HTML with CRLF line breaks and CRLF inside a cell still yields LF-only output', () => {
    const html =
      '<table>\r\n<thead>\r\n<tr><th>A\r\nB</th><th>C</th></tr>\r\n</thead>\r\n' +
      '<tbody>\r\n<tr><td>1</td><td>2</td></tr>\r\n</tbody>\r\n</table>';
    const out = flattenOriginEmpty(gridOf(html));
    expect(out).toBe('| A B | C |\n| --- | --- |\n| 1 | 2 |\n');
    expect(out).not.toContain('\r');
    expect(flattenRepeatValue(gridOf(html))).toBe(out);
  });

  it('CR-only whitespace inside a cell also folds to a space (parse stage)', () => {
    const g = gridOf(
      '<table><tbody><tr><td>x\ry</td><td>z</td></tr></tbody></table>',
    );
    expect(flattenOriginEmpty(g)).toBe('| x y | z |\n| --- | --- |\n');
  });
});

describe('empty cells / empty headers', () => {
  it('empty header and empty data cells render as empty slots in both strategies', () => {
    const g = gridOf(
      '<table><thead><tr><th></th><th>H</th></tr></thead>' +
        '<tbody><tr><td></td><td>v</td></tr></tbody></table>',
    );
    const expected = '|  | H |\n| --- | --- |\n|  | v |\n';
    expect(flattenOriginEmpty(g)).toBe(expected);
    expect(flattenRepeatValue(g)).toBe(expected);
  });

  it('empty origin cell is indistinguishable from an empty extension slot (J-T004-2)', () => {
    const g = gridOf(
      '<table><tbody><tr><td colspan="2"></td><td>e</td></tr></tbody></table>',
    );
    expect(flattenOriginEmpty(g)).toBe('|  |  | e |\n| --- | --- | --- |\n');
    expect(flattenRepeatValue(g)).toBe('|  |  | e |\n| --- | --- | --- |\n');
  });
});

describe('determinism: 100 consecutive runs byte-identical', () => {
  it('§6.3 grid, both strategies, 100 runs each', () => {
    const g = gridOf(SECTION_63_HTML);
    for (const fn of [flattenOriginEmpty, flattenRepeatValue]) {
      const first = fn(g);
      const firstHash = sha256Hex(first);
      for (let i = 1; i < 100; i++) {
        const next = fn(g);
        expect(next).toBe(first);
        expect(sha256Hex(next)).toBe(firstHash);
      }
    }
  });
});

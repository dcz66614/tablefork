# REVIEW_PACK_03 — 单元测试（tests/core）

> P029 TableFork 终审源码分卷（规格 v1.0.2）。本卷全文展开以下 10 个文件，
> 不省略、不摘要。每块格式：`### <路径>` + `SHA-256` / `Bytes` / `Lines` +
> ```` 围栏内完整原文（与 `review/RELEASE_MANIFEST.json` 中该文件的 SHA-256 一致）。
> 生成：P029-REFREEZE（`npm run verify:release` 核对每卷每块）。

### tests/core/compare.test.ts
SHA-256: 20b483decbbe48dead553f75edd19f74cf1231527340fb425503c9b5269b9d8e
Bytes: 15328
Lines: 345

````ts
/**
 * P029-T011 formal test — taken over from the P029-T007 temporary test.
 *
 * 本文件是 P029-T007 的正式测试（P029-T011 接管，全部断言保留）：覆盖 src/core/compare.ts（用户
 * Markdown 严格对账）与 src/io/localText.ts（本地文本读取层）的直接行为。
 *  * 所有期望值均为手算（对照 PROJECT_BOOK.md v1.0.2 §5.3/§6.3 与
 * flatten.ts 的 J-T004-1 口径），未从被测实现复制。F(A) 一律由 flatten
 * 真实生成（§6.3 例的期望串逐字节钉死，见 T004 日志），不用手写假
 * Markdown 当 F。
 *
 * 关键口径（见 artifacts/logs/T007-compare.txt §7）：
 * - J-T007-1：undefined 或 '' → NOT_SUPPLIED；仅含空白的串是已提供输入。
 * - 字节下标按 UTF-8 计，字符下标按 Unicode 码点计（for...of 次序）。
 */
import { describe, expect, it } from 'vitest';
import { compareMarkdown, detectGfmPipeTable } from '../../src/core/compare';
import { flattenOriginEmpty, flattenRepeatValue } from '../../src/core/flatten';
import { buildGrid } from '../../src/core/grid';
import { parseValidatedTable } from '../../src/core/parse';
import { isTableForkError } from '../../src/core/types';
import {
  isRemoteUrl,
  readTextFromBlob,
  readTextFromFile,
  readTextFromSource,
  textFromPaste,
} from '../../src/io/localText';

function gridOf(html: string) {
  return buildGrid(parseValidatedTable(html));
}

/** PROJECT_BOOK §6.3 的原始 HTML A（逐字照抄项目书）。 */
const SECTION_63_HTML =
  '<table><thead>' +
  '<tr><th rowspan="2">产品</th><th colspan="2">2026预算</th></tr>' +
  '<tr><th>收入</th><th>成本</th></tr>' +
  '</thead><tbody><tr><td>A</td><td>120</td><td>80</td></tr></tbody></table>';

/** §6.3 ORIGIN_EMPTY 的真实 F 值（T004 已逐字节钉死：87 字节，单个末尾 LF）。 */
const SECTION_63_ORIGIN_EMPTY =
  '| 产品 | 2026预算 |  |\n' +
  '| --- | --- | --- |\n' +
  '|  | 收入 | 成本 |\n' +
  '| A | 120 | 80 |\n';

/** 小表 F（手算：每行 9/19/9 字节 + LF，便于逐字节定位）。 */
const SMALL_HTML =
  '<table><tbody><tr><td>a</td><td>b</td></tr>' +
  '<tr><td>c</td><td>d</td></tr></tbody></table>';
const SMALL_F = '| a | b |\n| --- | --- |\n| c | d |\n';

describe('EXACT_MATCH (§6.3 真实 F)', () => {
  it('§6.3 ORIGIN_EMPTY：M 与 F(A) 逐字节相同', () => {
    const canonical = flattenOriginEmpty(gridOf(SECTION_63_HTML));
    expect(canonical).toBe(SECTION_63_ORIGIN_EMPTY);
    const result = compareMarkdown(SECTION_63_ORIGIN_EMPTY, canonical);
    expect(result.status).toBe('EXACT_MATCH');
    expect(result.firstDiff).toBeUndefined();
    expect(result.suppliedByteLength).toBe(87);
    expect(result.canonicalByteLength).toBe(87);
    expect(result.gfm.status).toBe('SINGLE_PIPE_TABLE');
    expect(result.gfm.rowCount).toBe(4);
    expect(result.gfm.columnCount).toBe(3);
  });

  it('§6.3 REPEAT_VALUE：M 与 F(A) 逐字节相同', () => {
    const canonical = flattenRepeatValue(gridOf(SECTION_63_HTML));
    const result = compareMarkdown(canonical, canonical);
    expect(result.status).toBe('EXACT_MATCH');
    expect(result.gfm.status).toBe('SINGLE_PIPE_TABLE');
  });
});

describe('EXACT_DIFF：只差一个 LF（J-T004-1 口径）', () => {
  it('M 缺末尾 LF：首个不同字节是 F 末尾的 LF（下标 86）', () => {
    const canonical = flattenOriginEmpty(gridOf(SECTION_63_HTML));
    expect(canonical.length).toBe(71); // 71 个码点，87 个 UTF-8 字节
    const supplied = canonical.slice(0, -1); // 去掉末尾单个 LF
    const result = compareMarkdown(supplied, canonical);
    expect(result.status).toBe('EXACT_DIFF');
    expect(result.firstDiff?.byteOffset).toBe(86);
    expect(result.suppliedByteLength).toBe(86);
    expect(result.canonicalByteLength).toBe(87);
    // M 在该点已结束；F 侧该字节是 LF（0x0a），所属字符就是 '\n'（码点下标 70）。
    expect(result.firstDiff?.suppliedByteAtDiff).toBeUndefined();
    expect(result.firstDiff?.canonicalByteAtDiff).toBe(0x0a);
    expect(result.firstDiff?.suppliedCharIndex).toBeNull();
    expect(result.firstDiff?.canonicalCharIndex).toBe(70);
    expect(result.firstDiff?.canonicalCharAtDiff).toBe('\n');
    expect(result.firstDiff?.canonicalContext).toContain('80');
    // 末尾 LF 不是可忽略的差异：缺了就是 EXACT_DIFF，不是 EXACT_MATCH。
    expect(result.gfm.status).toBe('SINGLE_PIPE_TABLE');
  });

  it('M 多一个末尾 LF：首个不同字节是第 87 个字节', () => {
    const canonical = flattenOriginEmpty(gridOf(SECTION_63_HTML));
    const result = compareMarkdown(`${canonical}\n`, canonical);
    expect(result.status).toBe('EXACT_DIFF');
    expect(result.firstDiff?.byteOffset).toBe(87);
    expect(result.firstDiff?.suppliedByteAtDiff).toBe(0x0a);
    expect(result.firstDiff?.canonicalByteAtDiff).toBeUndefined();
    expect(result.firstDiff?.canonicalCharIndex).toBeNull();
  });

  it('M 用 CRLF：首个不同字节是第一行的换行处（下标 9），不折 CRLF', () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    expect(canonical).toBe(SMALL_F);
    const supplied = SMALL_F.replace(/\n/g, '\r\n');
    const result = compareMarkdown(supplied, canonical);
    expect(result.status).toBe('EXACT_DIFF');
    expect(result.firstDiff?.byteOffset).toBe(9);
    expect(result.firstDiff?.suppliedByteAtDiff).toBe(0x0d);
    expect(result.firstDiff?.canonicalByteAtDiff).toBe(0x0a);
    expect(result.firstDiff?.suppliedCharIndex).toBe(9);
    expect(result.firstDiff?.canonicalCharIndex).toBe(9);
  });

  it('行尾多一个空格也不 trim：首个不同字节是该空格（下标 9）', () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    const supplied = SMALL_F.replace('| a | b |\n', '| a | b | \n');
    const result = compareMarkdown(supplied, canonical);
    expect(result.status).toBe('EXACT_DIFF');
    expect(result.firstDiff?.byteOffset).toBe(9);
    expect(result.firstDiff?.suppliedByteAtDiff).toBe(0x20);
    expect(result.firstDiff?.canonicalByteAtDiff).toBe(0x0a);
  });
});

describe('EXACT_DIFF：CJK byte-offset（byte offset ≠ char offset）', () => {
  it('diff 点前有 CJK：字节下标 11，字符下标 7，两者数值不同', () => {
    const canonical = flattenOriginEmpty(
      gridOf('<table><tbody><tr><td>产品</td><td>甲</td></tr></tbody></table>'),
    );
    expect(canonical).toBe('| 产品 | 甲 |\n| --- | --- |\n');
    // 手算：F 共 31 个 UTF-8 字节、25 个码点（'产品''甲'各 3 字节；
    // 第 1 行 16 字节 + LF，第 2 行 13 字节 + LF）。
    expect(new TextEncoder().encode(canonical).length).toBe(31);
    expect([...canonical].length).toBe(25);
    const supplied = canonical.replace('甲', '乙');
    const result = compareMarkdown(supplied, canonical);
    expect(result.status).toBe('EXACT_DIFF');
    // '| ' 2 字节 + '产品' 6 字节 + ' | ' 3 字节 = 11；字符下标：甲是第 7 个码点。
    expect(result.firstDiff?.byteOffset).toBe(11);
    expect(result.firstDiff?.suppliedCharIndex).toBe(7);
    expect(result.firstDiff?.canonicalCharIndex).toBe(7);
    expect(result.firstDiff?.byteOffset).not.toBe(
      result.firstDiff?.suppliedCharIndex,
    );
    expect(result.firstDiff?.suppliedCharAtDiff).toBe('乙');
    expect(result.firstDiff?.canonicalCharAtDiff).toBe('甲');
    expect(result.firstDiff?.suppliedContext).toContain('乙');
    expect(result.firstDiff?.canonicalContext).toContain('甲');
    // 首个不同字节是甲/乙的首字节（E7 vs E4）。
    expect(result.firstDiff?.suppliedByteAtDiff).toBe(0xe4);
    expect(result.firstDiff?.canonicalByteAtDiff).toBe(0xe7);
  });

  it('BOM 存在即为字节差异：首个不同字节下标 0', () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    const supplied = '\uFEFF' + SMALL_F;
    const result = compareMarkdown(supplied, canonical);
    expect(result.status).toBe('EXACT_DIFF');
    expect(result.firstDiff?.byteOffset).toBe(0);
    expect(result.firstDiff?.suppliedByteAtDiff).toBe(0xef);
    expect(result.firstDiff?.canonicalByteAtDiff).toBe(0x7c); // '|'
  });
});

describe('NOT_SUPPLIED（J-T007-1）', () => {
  it('M 为 undefined → NOT_SUPPLIED，GFM 未检测', () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    const result = compareMarkdown(undefined, canonical);
    expect(result.status).toBe('NOT_SUPPLIED');
    expect(result.gfm.status).toBe('NOT_CHECKED');
    expect(result.suppliedByteLength).toBe(0);
    expect(result.firstDiff).toBeUndefined();
  });

  it("M 为空串 '' → NOT_SUPPLIED（与 undefined 同义：什么都没粘贴）", () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    const result = compareMarkdown('', canonical);
    expect(result.status).toBe('NOT_SUPPLIED');
    expect(result.gfm.status).toBe('NOT_CHECKED');
  });

  it("仅含空白的串是已提供的输入 → EXACT_DIFF，不是 NOT_SUPPLIED", () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    const result = compareMarkdown('   ', canonical);
    expect(result.status).toBe('EXACT_DIFF');
    expect(result.gfm.status).toBe('NOT_A_PIPE_TABLE');
  });
});

describe('GFM 子集检测（只诊断形状，不说成碰撞）', () => {
  it('M 是普通文本：EXACT_DIFF + NOT_A_PIPE_TABLE，且结果不含任何见证字段', () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    const result = compareMarkdown('hello world', canonical);
    expect(result.status).toBe('EXACT_DIFF');
    expect(result.gfm.status).toBe('NOT_A_PIPE_TABLE');
    expect(result.gfm.tableCount).toBe(0);
    expect(result.gfm.issues.length).toBeGreaterThan(0);
    // 诚信边界：比较结果绝不携带见证/碰撞字段。
    expect('witness' in result).toBe(false);
    expect('proof' in result).toBe(false);
    expect('collision' in result).toBe(false);
  });

  it('M 含两张 pipe 表 → MULTIPLE_TABLES', () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    const supplied = `${SMALL_F}\n${SMALL_F}`;
    const result = compareMarkdown(supplied, canonical);
    expect(result.status).toBe('EXACT_DIFF');
    expect(result.gfm.status).toBe('MULTIPLE_TABLES');
    expect(result.gfm.tableCount).toBe(2);
  });

  it('缺分隔行 → NOT_A_PIPE_TABLE，诊断定位到第 2 行', () => {
    const result = detectGfmPipeTable('| a | b |\n| c | d |\n');
    expect(result.status).toBe('NOT_A_PIPE_TABLE');
    expect(result.tableCount).toBe(0);
    expect(result.issues.join(' ')).toContain('分隔行');
    expect(result.issues.join(' ')).toContain('第 2 行');
  });

  it('列数不一 → NOT_A_PIPE_TABLE，诊断定位到第 3 行', () => {
    const result = detectGfmPipeTable(
      '| a | b | c |\n| --- | --- | --- |\n| x | y |\n',
    );
    expect(result.status).toBe('NOT_A_PIPE_TABLE');
    expect(result.issues.join(' ')).toContain('列数');
    expect(result.issues.join(' ')).toContain('第 3 行');
  });

  it('表后还有非表格文本 → NOT_A_PIPE_TABLE（不是“单个表”）', () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    const result = compareMarkdown(`${SMALL_F}\n说明文字\n`, canonical);
    expect(result.status).toBe('EXACT_DIFF');
    expect(result.gfm.status).toBe('NOT_A_PIPE_TABLE');
    expect(result.gfm.tableCount).toBe(1);
  });

  it('单元格含转义管道 \\|：不切分单元格，仍是单张 2 列表', () => {
    const canonical = flattenOriginEmpty(
      gridOf('<table><tbody><tr><td>a|b</td><td>c</td></tr></tbody></table>'),
    );
    expect(canonical).toBe('| a\\|b | c |\n| --- | --- |\n');
    const result = compareMarkdown(canonical, canonical);
    expect(result.status).toBe('EXACT_MATCH');
    expect(result.gfm.status).toBe('SINGLE_PIPE_TABLE');
    expect(result.gfm.columnCount).toBe(2);
  });

  it('空行分隔不成表的 pipe 行块 → NOT_A_PIPE_TABLE', () => {
    const result = detectGfmPipeTable('| a | b |\n\n| c | d |\n');
    expect(result.status).toBe('NOT_A_PIPE_TABLE');
    expect(result.tableCount).toBe(0);
  });
});

describe('错误路径（无效输入不产出比较状态）', () => {
  it('M 超过 64 KiB UTF-8 → 抛 TableForkError OVER_SIZE', () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    let caught: unknown;
    try {
      compareMarkdown('x'.repeat(65537), canonical);
    } catch (error) {
      caught = error;
    }
    expect(isTableForkError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe('OVER_SIZE');
  });

  it('M 恰好 64 KiB 不抛错（边界值可比较）', () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    const result = compareMarkdown('x'.repeat(65536), canonical);
    expect(result.status).toBe('EXACT_DIFF');
  });

  it('canonicalMarkdown 不是字符串 → 抛 TypeError（不冒用表结构错误码）', () => {
    expect(() =>
      compareMarkdown('x', undefined as unknown as string),
    ).toThrow(TypeError);
  });

  it('suppliedMarkdown 不是字符串也不是 undefined → 抛 TypeError', () => {
    const canonical = flattenOriginEmpty(gridOf(SMALL_HTML));
    expect(() =>
      compareMarkdown(123 as unknown as string, canonical),
    ).toThrow(TypeError);
  });
});

describe('src/io 本地文本读取（零网络）', () => {
  it('粘贴文本原样返回（不 trim、不 normalization）', () => {
    expect(textFromPaste('  | a |\n')).toBe('  | a |\n');
    expect(textFromPaste(SMALL_F)).toBe(SMALL_F);
  });

  it('粘贴文本超 64 KiB → 抛 OVER_SIZE', () => {
    let caught: unknown;
    try {
      textFromPaste('y'.repeat(65537));
    } catch (error) {
      caught = error;
    }
    expect(isTableForkError(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe('OVER_SIZE');
  });

  it('从本地 Blob 读 UTF-8 文本', async () => {
    const text = await readTextFromBlob(new Blob([SMALL_F], { type: 'text/markdown' }));
    expect(text).toBe(SMALL_F);
  });

  it('超限 Blob 在读之前就报 OVER_SIZE', async () => {
    await expect(
      readTextFromBlob(new Blob(['z'.repeat(65537)])),
    ).rejects.toMatchObject({ code: 'OVER_SIZE' });
  });

  it('从本地 File 读文本', async () => {
    const file = new File([SMALL_F], 'm.md', { type: 'text/markdown' });
    await expect(readTextFromFile(file)).resolves.toBe(SMALL_F);
  });

  it('远程 URL 来源直接拒绝（不 fetch）：isRemoteUrl 与 readTextFromSource', async () => {
    expect(isRemoteUrl('https://example.com/m.md')).toBe(true);
    expect(isRemoteUrl('http://example.com/m.md')).toBe(true);
    expect(isRemoteUrl('//example.com/m.md')).toBe(true);
    expect(isRemoteUrl('| a | b |')).toBe(false);
    await expect(
      readTextFromSource({ kind: 'url', url: 'https://example.com/m.md' }),
    ).rejects.toThrow(/拒绝远程 URL/);
  });

  it('readTextFromSource 按来源分发：paste / blob 均本地读取', async () => {
    await expect(
      readTextFromSource({ kind: 'paste', text: SMALL_F }),
    ).resolves.toBe(SMALL_F);
    await expect(
      readTextFromSource({ kind: 'blob', blob: new Blob([SMALL_F]) }),
    ).resolves.toBe(SMALL_F);
  });
});
````

### tests/core/flatten.test.ts
SHA-256: 9ba6c049ed7986aedc1e67e95870475ce8f276b4f6768465a185d464a97b1c09
Bytes: 9500
Lines: 248

````ts
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
````

### tests/core/golden.test.ts
SHA-256: c336bd551bd750ad55dd8b85a0a5e78f24b1cd361cc35666d6019e30e1ff1785
Bytes: 10886
Lines: 272

````ts
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
````

### tests/core/grid.test.ts
SHA-256: 0bd9bdb73a73ff5f63a5d718e12be66202c9531709dfb036156984725454e51b
Bytes: 18322
Lines: 518

````ts
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
````

### tests/core/nbsp.test.ts
SHA-256: 8b6276177c714fecd213fbf5468961e5f6877a935b032c53e3ec11b5b8238116
Bytes: 5448
Lines: 130

````ts
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
````

### tests/core/report-facts.test.ts
SHA-256: 22387317babd0f86139c4199e84fcb503286553b9cae4d688d1542f321317cbd
Bytes: 2672
Lines: 54

````ts
/**
 * P029 TableFork — 正式回归测试（P029-T013 接管自 T011-FIX-01 临时测试）
 *
 * 原临时文件 tests/core/t011fix01-temp.test.ts 已按 T011 接管惯例改名
 * 为正式测试（模块名 report-facts），内容一字未改、测试数不变（5 条）。
 * 回归测试：P029-T011-FIX-01 的两处 Oracle 修复在 TS 侧的行为锚点
 * （本文件只测 TS analyze()；Oracle 侧的同一行为由 `npm run oracle`
 * 49/49 与 /tmp 两侧对照脚本覆盖，见 artifacts/logs/T011-FIX-01.txt）。
 *
 * - (A) facts 定 TD-only（项目书 §5.4“对每个 td 占用的槽位”）：
 *   G02（thead 两 th + tbody 两 td）的 facts 为 2 条且均为 td。
 * - (B) 未知属性忽略（项目书 §3.1“有效标签”只限标签）：
 *   `<td data-x>`、`<table class>`、`<td style>` 三例 analyze() 均接受。
 * - 保留拒绝：headers 属性仍报 UNSUPPORTED_HEADER_SEMANTICS。
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/report';

const INPUT = { schema: 'tablefork.input/v1', strategy: 'ORIGIN_EMPTY' } as const;

describe('T011-FIX-01 (A): facts 只对 td 占用的槽位出记录', () => {
  it('G02 的 facts 为 2 条且均为 td（c02、c03），不含 th 槽 c00、c01', async () => {
    const result = await analyze({
      ...INPUT,
      html: '<table><thead><tr><th>名称</th><th>数量</th></tr></thead>'
        + '<tbody><tr><td>苹果</td><td>3</td></tr></tbody></table>',
    }, 'job-test-1');
    expect(result.facts).toHaveLength(2);
    expect(result.facts.map((f) => f.cellId)).toEqual(['c02', 'c03']);
    expect(result.facts.map((f) => `${f.row},${f.col}`)).toEqual(['1,0', '1,1']);
  });
});

describe('T011-FIX-01 (B): 未知属性被忽略，analyze() 接受', () => {
  it.each([
    ['<td data-x>', '<table><tbody><tr><td data-x="1">A</td><td>B</td></tr></tbody></table>'],
    ['<table class>', '<table class="x"><tbody><tr><td>A</td><td>B</td></tr></tbody></table>'],
    ['<td style>', '<table><tbody><tr><td style="color:red">A</td><td>B</td></tr></tbody></table>'],
  ])('%s 接受', async (_name, html) => {
    const result = await analyze({ ...INPUT, html }, 'job-test-1');
    expect(result.facts).toHaveLength(2);
  });
});

describe('T011-FIX-01: headers 属性仍报 UNSUPPORTED_HEADER_SEMANTICS', () => {
  it('headers 属性被拒绝（TS 与 Oracle 同码）', async () => {
    await expect(
      analyze({
        ...INPUT,
        html: '<table><tbody><tr><td headers="h1">A</td><td>B</td></tr></tbody></table>',
      }, 'job-test-1'),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_HEADER_SEMANTICS' });
  });
});
````

### tests/core/report.test.ts
SHA-256: dc5c00f5bf947716815fccab0e1dce454e1fbf3095e535d93c10e4bd00f069d9
Bytes: 21701
Lines: 513

````ts
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
````

### tests/core/sha256.test.ts
SHA-256: 79097708c7824ac66f787b0188f679555ce30a6f87f36f9cf4e79bae5fa432ae
Bytes: 3993
Lines: 99

````ts
/**
 * P029-T011 formal test — taken over from the P029-T009-FIX-01 temporary test.
 *
 * 本文件是 P029-T009-FIX-01 的正式测试（P029-T011 接管，全部断言保留）：覆盖纯 TypeScript 同步
 * SHA-256（src/core/sha256.ts）与改后 analyze() 的 §6.3 哈希钉死。
 *  * 所有已知向量期望值均为公开标准值（FIPS 180-4 / NIST 已知答案），
 * 未从被测实现复制；§6.3 哈希期望取自 T005/T008 已独立钉死的值。
 * Node 对照（createHash）只在测试内作交叉核对——生产代码
 * src/core/* 已不再 import node:crypto。
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Utf8 } from '../../src/core/sha256';
import { sha256Utf8 as witnessSha256 } from '../../src/core/witness';
import { analyze, sha256Utf8WebCrypto } from '../../src/core/report';
import { TFK_A_HTML } from '../../src/ui/presets';

const nodeSha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

describe('T009-FIX-01 pure-TS SHA-256 known vectors', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    [
      'a'.repeat(1_000_000),
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    ],
  ])('sha256(%s) == %s', (input, expected) => {
    expect(sha256Utf8(input)).toBe(expected);
    expect(sha256Utf8(input)).toBe(nodeSha256(input));
  });

  it('matches Node createHash across padding boundaries and unicode', () => {
    const inputs = [
      'x'.repeat(55), // 55 bytes: 1-block padding boundary
      'x'.repeat(56), // 56 bytes: spills to a second block
      'x'.repeat(63),
      'x'.repeat(64),
      'x'.repeat(119),
      'x'.repeat(120),
      'x'.repeat(128),
      'hello tablefork',
      '产品2026预算成本甲乙丙',
      '😀'.repeat(20), // astral plane, 4-byte UTF-8
      '\uD800', // lone high surrogate -> U+FFFD, same as TextEncoder / Node utf8
      '\uD800\uDC00', // valid surrogate pair -> U+10000
      'a'.repeat(1000),
    ];
    for (const input of inputs) {
      expect(sha256Utf8(input)).toBe(nodeSha256(input));
    }
  });

  it('witness.sha256Utf8 re-export is the same pure-TS function', () => {
    expect(witnessSha256('abc')).toBe(sha256Utf8('abc'));
    expect(witnessSha256('abc')).toBe(nodeSha256('abc'));
  });

  it('report sha256Utf8WebCrypto thin wrapper still agrees', async () => {
    await expect(sha256Utf8WebCrypto('abc')).resolves.toBe(nodeSha256('abc'));
    await expect(sha256Utf8WebCrypto('')).resolves.toBe(nodeSha256(''));
  });

  it('§6.3 example hashes unchanged after the fix', async () => {
    const origin = await analyze({
      schema: 'tablefork.input/v1',
      html: TFK_A_HTML,
      strategy: 'ORIGIN_EMPTY',
    }, 'job-test-1');
    expect(origin.proof?.aGraphSha256).toBe(
      'dbd4b9cebec9a13f40cfdff378c78d1f59325cdc0e721faa0b4068eb90de157d',
    );
    expect(origin.proof?.bGraphSha256).toBe(
      'a9ec182caf420715248a255286d2daef973a8e22719691db813dd05d88238bc5',
    );
    expect(origin.proof?.markdownSha256).toBe(
      '83da510440918640ba87eff47fa11cad70444955f6ce7e36724e4d26765338c1',
    );
    const repeat = await analyze({
      schema: 'tablefork.input/v1',
      html: TFK_A_HTML,
      strategy: 'REPEAT_VALUE',
    }, 'job-test-1');
    expect(repeat.proof?.aGraphSha256).toBe(
      'dbd4b9cebec9a13f40cfdff378c78d1f59325cdc0e721faa0b4068eb90de157d',
    );
    expect(repeat.proof?.bGraphSha256).toBe(
      'ba552bb47172087248e45ce9ad5d71a8c5a4435719c1faac360be665c17e1bd1',
    );
    expect(repeat.proof?.markdownSha256).toBe(
      'e97edc1bda41731291466e2a64d0338df9abcf7b30f947ce1768592eba0bdffb',
    );
  });
});
````

### tests/core/witness.test.ts
SHA-256: bf1832540562996315fa862b0c381b2660ab1813069bbaddf576eb3ffba72f45
Bytes: 15158
Lines: 310

````ts
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
````

### tests/core/worker.test.ts
SHA-256: 991c89a79fa583dd5f2f9f01fedb05aa302e0364c3a4a1325fe4dbdc1c3304b2
Bytes: 12800
Lines: 333

````ts
/**
 * P029-T011 formal test — taken over from the P029-T010 temporary test.
 *
 * 本文件是 P029-T010 的正式测试（P029-T011 接管，全部断言保留）：覆盖 src/worker/tablefork.worker.ts
 * （纯函数消息处理器 createWorkerMessageHandler）与 fixtures/TFK-A..D.json
 * （经 CLI 与 Worker 的一致性）。正式的 49 Golden（fixtures/golden +
 * tests/core + tests/property）由 T011 接管；本文件不声称测试已完备，
 * T011 接管时可替换或并入正式套件。
 *
 * 覆盖要点（见 artifacts/logs/T010-worker-cli.txt §2/§5/§7）：
 * - ANALYZE 得 RESULT，且与直接调 analyze() 的结果逐字段 deep-equal
 *   （Worker 与 CLI 走同一个 src/core 内核；CLI 文件侧的逐字段比对见
 *   日志 §3，由 /tmp 浏览器脚本对 artifacts/reports/TFK-*.json 实测）。
 * - 无效输入得 ERROR，且 code 为 ErrorCode 枚举值（T008 J-T008-2 的
 *   兜底桶口径：analyze 入口校验失败报 INVALID_RAGGED_GRID）。
 * - CANCEL 后旧 job 无 RESULT/ERROR；连续两个 ANALYZE 只有最新 job 的
 *   结果被采纳（版本号守卫）；取消一个已被取代的旧 job 不误杀最新 job。
 * - 全项目只有一个 Worker 文件（src/worker 下仅 protocol.ts 与
 *   tablefork.worker.ts），DoD 的一部分。
 *
 * 所有期望值均为手算或取自已钉死的旧日志（T005/T008/T009 的哈希），
 * 未从被测实现复制。Worker 处理器在让步一个 macrotask 后才执行
 * analyze()（J-T010-2），测试里 await 处理器 Promise 即足以等到投递。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/core/report';
import { ERROR_CODES, SPEC_VERSION, type AnalyzeInput } from '../../src/core/types';
import { sha256Utf8 } from '../../src/core/witness';
import { PRESETS } from '../../src/ui/presets';
import {
  createWorkerMessageHandler,
  type WorkerResponseMessage,
} from '../../src/worker/tablefork.worker';

/** 收集投递的回复；每个测试用独立处理器（独立状态，互不干扰）。 */
function makeCollector(): {
  messages: WorkerResponseMessage[];
  handle: (message: unknown) => Promise<void>;
} {
  const messages: WorkerResponseMessage[] = [];
  const handle = createWorkerMessageHandler((message) => {
    messages.push(message);
  });
  return { messages, handle };
}

/** 由 fixture 文件读 AnalyzeInput（fixture 与 presets.ts 同源，见日志 §4）。 */
function fixtureInput(id: string): AnalyzeInput {
  const fixture = JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), `../../fixtures/${id}.json`),
      'utf8',
    ) as string,
  ) as {
    input: AnalyzeInput;
  };
  return fixture.input;
}

describe('P029-T010 worker message handler', () => {
  it('ANALYZE TFK-A: RESULT deep-equal to direct analyze() (field by field)', async () => {
    const { messages, handle } = makeCollector();
    await handle({
      jobId: 'job-a',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-A'),
    });
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.type).toBe('RESULT');
    expect(reply?.jobId).toBe('job-a');
    if (reply?.type !== 'RESULT') {
      throw new Error('expected RESULT');
    }
    const direct = await analyze(fixtureInput('TFK-A'), 'job-a');
    expect(reply.data).toEqual(direct);
    // FIX-02：Worker 传消息外层 jobId，RESULT 的 data.jobId 与外层一致；
    // inputHash 为输入 HTML 原文的 SHA-256，specVersion 为 SPEC_VERSION。
    expect(reply.data.jobId).toBe('job-a');
    expect(reply.data.inputHash).toBe(sha256Utf8(fixtureInput('TFK-A').html));
    expect(reply.data.specVersion).toBe('1.0.2');
    expect(reply.data.specVersion).toBe(SPEC_VERSION);
    // 逐字段点名（T005/T008 已钉死的哈希，不是从实现复制的）：
    expect(reply.data.schema).toBe('tablefork.report/v1');
    expect(reply.data.compare).toBe('NOT_SUPPLIED');
    expect(reply.data.witness).toBe('CERTIFIED_COLLISION');
    expect(reply.data.proof?.sourceCellId).toBe('c01');
    expect(reply.data.proof?.splitCost).toBe(1);
    expect(reply.data.proof?.headerAssociationChanged).toBe(true);
    expect(reply.data.proof?.aGraphSha256).toBe(
      'dbd4b9cebec9a13f40cfdff378c78d1f59325cdc0e721faa0b4068eb90de157d',
    );
    expect(reply.data.proof?.bGraphSha256).toBe(
      'a9ec182caf420715248a255286d2daef973a8e22719691db813dd05d88238bc5',
    );
    expect(reply.data.proof?.markdownSha256).toBe(
      '83da510440918640ba87eff47fa11cad70444955f6ce7e36724e4d26765338c1',
    );
    expect(reply.data.facts).toHaveLength(3);
  });

  it('ANALYZE TFK-B: CERTIFIED_COLLISION, source c02, header changed', async () => {
    const { messages, handle } = makeCollector();
    await handle({
      jobId: 'job-b',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-B'),
    });
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.type).toBe('RESULT');
    if (reply?.type !== 'RESULT') {
      throw new Error('expected RESULT');
    }
    expect(reply.data.witness).toBe('CERTIFIED_COLLISION');
    expect(reply.data.proof?.sourceCellId).toBe('c02');
    expect(reply.data.proof?.headerAssociationChanged).toBe(true);
    // T009 已钉死的 TFK-B ORIGIN_EMPTY 哈希前缀（全值见日志 §3）：
    expect(reply.data.proof?.markdownSha256.startsWith('07ee8352')).toBe(true);
    expect(reply.data.proof?.aGraphSha256.startsWith('7671d3ba')).toBe(true);
    expect(reply.data.jobId).toBe('job-b');
    expect(reply.data.inputHash).toBe(sha256Utf8(fixtureInput('TFK-B').html));
    expect(reply.data.specVersion).toBe('1.0.2');
    expect(reply.data).toEqual(await analyze(fixtureInput('TFK-B'), 'job-b'));
  });

  it('ANALYZE TFK-C: NO_WITNESS_FOUND, proof field omitted', async () => {
    const { messages, handle } = makeCollector();
    await handle({
      jobId: 'job-c',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-C'),
    });
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.type).toBe('RESULT');
    if (reply?.type !== 'RESULT') {
      throw new Error('expected RESULT');
    }
    expect(reply.data.witness).toBe('NO_WITNESS_FOUND');
    expect('proof' in reply.data).toBe(false);
    expect(reply.data.jobId).toBe('job-c');
    expect(reply.data.inputHash).toBe(sha256Utf8(fixtureInput('TFK-C').html));
    expect(reply.data.specVersion).toBe('1.0.2');
    expect(reply.data).toEqual(await analyze(fixtureInput('TFK-C'), 'job-c'));
  });

  it('ANALYZE TFK-D: ERROR UNSUPPORTED_HEADER_SEMANTICS (enum code)', async () => {
    const { messages, handle } = makeCollector();
    await handle({
      jobId: 'job-d',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-D'),
    });
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.type).toBe('ERROR');
    if (reply?.type !== 'ERROR') {
      throw new Error('expected ERROR');
    }
    expect(reply.code).toBe('UNSUPPORTED_HEADER_SEMANTICS');
    expect(ERROR_CODES).toContain(reply.code);
    expect(typeof reply.message).toBe('string');
  });

  it('invalid inputs: ERROR with an ErrorCode enum value, never a RESULT', async () => {
    const cases: Array<{ name: string; payload: unknown; code: string }> = [
      {
        name: 'bad schema',
        payload: {
          schema: 'tablefork.input/v2',
          html: '<table><tbody><tr><td>a</td></tr></tbody></table>',
          strategy: 'ORIGIN_EMPTY',
        },
        code: 'INVALID_RAGGED_GRID',
      },
      {
        name: 'bad strategy',
        payload: {
          schema: 'tablefork.input/v1',
          html: '<table><tbody><tr><td>a</td></tr></tbody></table>',
          strategy: 'NOPE',
        },
        code: 'INVALID_RAGGED_GRID',
      },
      {
        name: 'nested table',
        payload: {
          schema: 'tablefork.input/v1',
          html: '<table><tbody><tr><td><table><tr><td>x</td></tr></table></td></tr></tbody></table>',
          strategy: 'ORIGIN_EMPTY',
        },
        code: 'UNSUPPORTED_NESTED_TABLE',
      },
      {
        name: 'missing payload',
        payload: undefined,
        code: 'INVALID_RAGGED_GRID',
      },
    ];
    for (const [index, testCase] of cases.entries()) {
      const { messages, handle } = makeCollector();
      await handle({
        jobId: `job-invalid-${index}`,
        type: 'ANALYZE',
        payload: testCase.payload,
      });
      expect(messages).toHaveLength(1);
      const reply = messages[0];
      expect(reply?.type).toBe('ERROR');
      if (reply?.type !== 'ERROR') {
        throw new Error(`expected ERROR for ${testCase.name}`);
      }
      expect(reply.code).toBe(testCase.code);
      expect(ERROR_CODES).toContain(reply.code);
    }
  });

  it('malformed messages without a usable jobId post nothing', async () => {
    const { messages, handle } = makeCollector();
    await handle(null);
    await handle('not-an-object');
    await handle({ type: 'ANALYZE', payload: fixtureInput('TFK-A') });
    await handle({ jobId: 42, type: 'ANALYZE', payload: fixtureInput('TFK-A') });
    await handle({ jobId: '', type: 'ANALYZE', payload: fixtureInput('TFK-A') });
    expect(messages).toHaveLength(0);
  });

  it('unknown message type: ERROR INVALID_RAGGED_GRID (catch-all bucket)', async () => {
    const { messages, handle } = makeCollector();
    await handle({ jobId: 'job-unknown', type: 'PING' });
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.type).toBe('ERROR');
    if (reply?.type !== 'ERROR') {
      throw new Error('expected ERROR');
    }
    expect(reply.code).toBe('INVALID_RAGGED_GRID');
  });

  it('CANCEL after ANALYZE: the old job produces no RESULT/ERROR', async () => {
    const { messages, handle } = makeCollector();
    const pending = handle({
      jobId: 'job-cancel',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-A'),
    });
    await handle({ jobId: 'job-cancel', type: 'CANCEL' });
    await pending;
    expect(messages).toHaveLength(0);
  });

  it('CANCEL of an unknown jobId posts nothing', async () => {
    const { messages, handle } = makeCollector();
    await handle({ jobId: 'job-never-seen', type: 'CANCEL' });
    expect(messages).toHaveLength(0);
  });

  it('two ANALYZEs back to back: only the latest job result is adopted', async () => {
    const { messages, handle } = makeCollector();
    const first = handle({
      jobId: 'job-old',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-A'),
    });
    const second = handle({
      jobId: 'job-new',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-B'),
    });
    await Promise.all([first, second]);
    expect(messages).toHaveLength(1);
    const reply = messages[0];
    expect(reply?.jobId).toBe('job-new');
    expect(reply?.type).toBe('RESULT');
    if (reply?.type !== 'RESULT') {
      throw new Error('expected RESULT');
    }
    expect(reply.data.proof?.sourceCellId).toBe('c02');
  });

  it('stale CANCEL of a superseded job does not kill the latest job', async () => {
    const { messages, handle } = makeCollector();
    const first = handle({
      jobId: 'job-old',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-A'),
    });
    const second = handle({
      jobId: 'job-new',
      type: 'ANALYZE',
      payload: fixtureInput('TFK-B'),
    });
    await handle({ jobId: 'job-old', type: 'CANCEL' });
    await Promise.all([first, second]);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.jobId).toBe('job-new');
    expect(messages[0]?.type).toBe('RESULT');
  });

  it('fixtures reuse the preset HTML verbatim (single source: src/ui/presets.ts)', () => {
    for (const preset of PRESETS) {
      const fixture = JSON.parse(
        readFileSync(
          join(
            dirname(fileURLToPath(import.meta.url)),
            `../../fixtures/${preset.id}.json`,
          ),
          'utf8',
        ) as string,
      ) as { fixture_id: string; schema: string; input: AnalyzeInput };
      expect(fixture.fixture_id).toBe(preset.id);
      expect(fixture.schema).toBe('tablefork.fixture/v1');
      expect(fixture.input.html).toBe(preset.html);
      expect(fixture.input.strategy).toBe('ORIGIN_EMPTY');
    }
  });

  it('only one Worker file exists in src/worker (protocol + implementation)', () => {
    const workerDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../src/worker',
    );
    expect(readdirSync(workerDir).sort()).toEqual([
      'protocol.ts',
      'tablefork.worker.ts',
    ]);
  });
});
````

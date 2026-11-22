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

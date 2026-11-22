/**
 * P029 TableFork — 用户 Markdown 严格对账 (P029-T007)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §5.3（Markdown 对账不是碰撞证明）、
 * §6.1（CompareStatus）、§6.2（Worker 协议 jobId 合同）；IMPLEMENTATION_PLAN.md
 * §4.2（JSON 与 worker 失败合同）、§6 P029-T007 卡。
 *
 * 本模块只回答一个问题：用户粘贴的 M 与本工具生成的 F(A) 在 UTF-8 字节流上
 * 是否完全相同。它**绝不**回答、**绝不**引用任何见证状态（本文件不 import
 * witness.ts，不出现 WitnessStatus / CollisionProof；见 J-T007-6）。
 *
 * 冻结规则（§5.3）：
 * - EXACT_MATCH 当且仅当 UTF-8 字节完全相同。
 * - EXACT_DIFF 报告首个不同字节下标（byte offset，从 0 起）及相邻显示字符。
 * - NOT_SUPPLIED 表示未输入 M，页面可预览生成值。
 * - 除非 M 与 F(A) 相等，不得把 F(A)=F(B) 的证书写成 M=F(B)。
 * - Markdown 语法解析仅用于视图定位和校验单个 GFM pipe 表，不解释语义。
 *
 * 不做 normalization（写进函数注释与证据日志，见 compareMarkdown）：
 * 不做 NFC/NFD、不把 CRLF 折成 LF、不去尾空格、不剥 BOM、不 trim。
 * BOM 存在即为字节差异；末尾 LF 缺失/多余也是字节差异（与 J-T004-1
 * 口径一致：F 输出以单个 LF 结尾，比较时不得把末尾 LF 当作可忽略的差异）。
 *
 * 本模块是纯函数：无 DOM、无 Node 专属调用、无随机、无时间、无 I/O、
 * 无状态、无缓存。日后 analyze()（T008）与 Worker ANALYZE 路径（T010）
 * 直接调用 compareMarkdown；jobId 只存在于协议信封
 * （src/worker/protocol.ts 的 WorkerRequestMessage / WorkerResponseMessage）
 * 中，本模块不接收、不返回、不缓存 jobId（见 §7 J-T007-7）。
 */

import { MAX_INPUT_BYTES } from './index';
import { fail } from './parse';
import type { CompareStatus } from './types';

/** GFM 子集检测的结论（只描述 M 的形状，不描述 M 与 F(A) 的关系）。 */
export type GfmTableStatus =
  | 'SINGLE_PIPE_TABLE'
  | 'NOT_A_PIPE_TABLE'
  | 'MULTIPLE_TABLES'
  | 'NOT_CHECKED';

/**
 * GFM pipe 表检测结果。
 * - status 为 SINGLE_PIPE_TABLE 时，rowCount / columnCount 为该表的行/列数。
 * - status 为 MULTIPLE_TABLES 时，rowCount / columnCount 为首张表的行/列数。
 * - issues 为逐条结构问题（均含 1-based 行号），SINGLE_PIPE_TABLE 时为空。
 * - NOT_CHECKED 只出现在 M 未提供（NOT_SUPPLIED）时：没有输入可供检测，
 *   不把“未提供”说成“不是 pipe 表”。
 */
export interface GfmCheckResult {
  status: GfmTableStatus;
  /** 人类可读诊断（中文）。 */
  reason: string;
  /** 检测到的合法 pipe 表块数（0 / 1 / ≥2；NOT_CHECKED 时为 0）。 */
  tableCount: number;
  /** 首张表的行数（含表头行与分隔行）。 */
  rowCount?: number;
  /** 首张表的列数。 */
  columnCount?: number;
  /** 逐条结构问题（行号 + 原因）。 */
  issues: string[];
}

/**
 * 首个不同字节的定位报告。
 * - byteOffset：首个不同 UTF-8 字节下标（从 0 起）。
 * - suppliedCharIndex / canonicalCharIndex：该字节在 M / F(A) 中所属字符的
 *   码点下标（for...of 迭代次序；BMP 字符与 UTF-16 单元下标相同，astral
 *   字符不同，见 J-T007-3）。字符串已在该点结束时为 null。
 * - suppliedByteAtDiff / canonicalByteAtDiff：该字节的值（0–255）；字符串
 *   已在该点结束时为 undefined（即一方是另一方的前缀）。
 * - suppliedCharAtDiff / canonicalCharAtDiff：该字节所属的完整字符；字符串
 *   已在该点结束时为 undefined。
 * - suppliedContext / canonicalContext：diff 点前后各最多 16 个字符的可显示
 *   文本（diff 字符本身包含在内；位于串尾时只取尾部文本）。
 */
export interface FirstDiff {
  byteOffset: number;
  suppliedCharIndex: number | null;
  canonicalCharIndex: number | null;
  suppliedByteAtDiff?: number;
  canonicalByteAtDiff?: number;
  suppliedCharAtDiff?: string;
  canonicalCharAtDiff?: string;
  suppliedContext: string;
  canonicalContext: string;
}

/**
 * 比较结果。只含 M 与 F(A) 的关系与 GFM 形状诊断。
 * 本类型刻意不含 witness / proof / 任何见证字段（J-T007-6）。
 */
export interface CompareResult {
  status: CompareStatus;
  /** GFM 子集检测结果（NOT_SUPPLIED 时为 NOT_CHECKED）。 */
  gfm: GfmCheckResult;
  /** 仅 EXACT_DIFF 时存在。 */
  firstDiff?: FirstDiff;
  /** M 的 UTF-8 字节长度（未提供时为 0）。 */
  suppliedByteLength: number;
  /** F(A) 的 UTF-8 字节长度。 */
  canonicalByteLength: number;
  /** 一句话中文摘要（供 UI 状态栏与日志引用，不作机器判定依据）。 */
  summary: string;
}

/** 上下文窗口：diff 点前后各取最多这么多个字符。 */
const CONTEXT_CHARS = 16;

const utf8Encoder = new TextEncoder();

/**
 * 逐码点走查：返回每字符起始字节下标数组，末尾追加总字节长。
 * 例：'甲'（3 字节）后一位字符的起始下标比前一位大 3。
 * 字符下标按 Unicode 码点计（for...of 迭代），与 JS string.length
 * （UTF-16 单元数）在 astral 字符处不同，见 J-T007-3。
 */
function charByteOffsets(text: string): number[] {
  const offsets: number[] = [];
  let byte = 0;
  for (const ch of text) {
    offsets.push(byte);
    byte += utf8Encoder.encode(ch).length;
  }
  offsets.push(byte);
  return offsets;
}

/** 给定字节下标，定位其所属字符（码点下标与完整字符）；串已结束时返回 null。 */
function locateChar(
  text: string,
  offsets: number[],
  byteOffset: number,
): { charIndex: number | null; charAtDiff?: string } {
  if (byteOffset >= offsets[offsets.length - 1]) {
    return { charIndex: null };
  }
  let charIndex = 0;
  for (let i = 0; i < offsets.length - 1; i++) {
    if (offsets[i] <= byteOffset) {
      charIndex = i;
    } else {
      break;
    }
  }
  return { charIndex, charAtDiff: [...text][charIndex] };
}

/** 取 diff 字符前后各最多 CONTEXT_CHARS 个字符的可显示文本。 */
function contextAround(text: string, charIndex: number | null): string {
  const chars = [...text];
  if (charIndex === null) {
    return chars.slice(Math.max(0, chars.length - CONTEXT_CHARS)).join('');
  }
  const start = Math.max(0, charIndex - CONTEXT_CHARS);
  const end = Math.min(chars.length, charIndex + CONTEXT_CHARS + 1);
  return chars.slice(start, end).join('');
}

/**
 * 把一行按“未转义的 |”切成单元格。
 * - 返回 null 表示该行不是 pipe 表行（无未转义的 |）。
 * - `\|` 不切分（F 按 §5.1 把单元格内的 | 写成 \|，检测必须认得它）。
 * - 行首/行尾的 | 是可选的外框，切分后丢弃由此产生的首/尾空段。
 * - 单元格不做内容清洗，只去首尾空白后用于形状判定（分隔行识别、
 *   列数统计）；字节比较永远不对原文做任何处理。
 */
function splitPipeRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (trimmed === '') {
    return null;
  }
  const segments: string[] = [];
  let current = '';
  let backslashes = 0;
  let sawUnescapedPipe = false;
  for (const ch of trimmed) {
    if (ch === '\\') {
      backslashes += 1;
      current += ch;
      continue;
    }
    if (ch === '|' && backslashes % 2 === 0) {
      sawUnescapedPipe = true;
      segments.push(current);
      current = '';
    } else {
      current += ch;
    }
    backslashes = 0;
  }
  segments.push(current);
  if (!sawUnescapedPipe) {
    return null;
  }
  // 行首 '|' 产生的首空段、行尾未转义 '|' 产生的尾空段是外框，不是单元格。
  // 行尾 '|' 是否转义看它前面连续反斜杠的奇偶：`\|` 是转义（不切分），
  // `\\|` 是“转义的反斜杠 + 真管道”（切分）。
  if (trimmed.startsWith('|')) {
    segments.shift();
  }
  let trailingBackslashes = 0;
  for (let i = trimmed.length - 2; i >= 0 && trimmed[i] === '\\'; i--) {
    trailingBackslashes += 1;
  }
  if (trimmed.endsWith('|') && trailingBackslashes % 2 === 0) {
    segments.pop();
  }
  return segments;
}

/** 分隔行判定：每格都是可选冒号 + 至少一个 - + 可选冒号（去空白后）。 */
function isDelimiterRow(cells: string[]): boolean {
  if (cells.length === 0) {
    return false;
  }
  return cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

interface RowLine {
  /** 1-based 行号。 */
  lineNo: number;
  cells: string[];
  isDelimiter: boolean;
}

interface TableBlock {
  /** 块首行号（1-based）。 */
  startLine: number;
  rows: RowLine[];
}

/**
 * 检测 M 是否为单个 GFM pipe 表（项目书 §5.3“校验单个 GFM pipe 表”）。
 *
 * 判定规则（完整版见 artifacts/logs/T007-compare.txt §7 J-T007-4/J-T007-5）：
 * - 合法表块 = 连续的 pipe 行，第 2 行是分隔行，且各行列数一致。
 * - 恰好 1 个合法表块、块外只有空行 → SINGLE_PIPE_TABLE。
 * - ≥2 个合法表块 → MULTIPLE_TABLES。
 * - 其余（无 pipe 行、缺分隔行、列数不一、表外还有非表格文本）→
 *   NOT_A_PIPE_TABLE，并把每条结构问题写进 issues（含行号）。
 * - 本函数只做形状分类：它从不改写输入、不做 normalization；CRLF 行尾的
 *   \r 只在按行 trim 时被忽略形状判定，字节比较不受影响。
 * - 空串输入返回 NOT_A_PIPE_TABLE（无行可供检测）；“未提供”由
 *   compareMarkdown 在调用前拦截为 NOT_CHECKED，不经过本函数。
 */
export function detectGfmPipeTable(markdown: string): GfmCheckResult {
  const lines = markdown.split('\n');
  const issues: string[] = [];
  const blocks: TableBlock[] = [];
  const tables: TableBlock[] = [];
  const otherLines: number[] = [];

  let current: RowLine[] = [];
  const flush = (): void => {
    if (current.length > 0) {
      blocks.push({ startLine: current[0].lineNo, rows: current });
      current = [];
    }
  };

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const trimmed = rawLine.trim();
    if (trimmed === '') {
      flush();
      return;
    }
    const cells = splitPipeRow(rawLine);
    if (cells === null) {
      flush();
      otherLines.push(lineNo);
      return;
    }
    current.push({ lineNo, cells, isDelimiter: isDelimiterRow(cells) });
  });
  flush();

  for (const block of blocks) {
    const first = block.rows[0];
    const columnCount = first.cells.length;
    if (block.rows.length < 2) {
      issues.push(
        `第 ${block.startLine} 行：只有一行 pipe 行，缺少分隔行（第 2 行应为 | --- | ... |）。`,
      );
      continue;
    }
    if (!block.rows[1].isDelimiter) {
      issues.push(
        `第 ${block.rows[1].lineNo} 行：不是合法分隔行（应为每格 :?-+:?，如 | --- | --- |）。`,
      );
      continue;
    }
    const ragged = block.rows.find((row) => row.cells.length !== columnCount);
    if (ragged !== undefined) {
      issues.push(
        `第 ${ragged.lineNo} 行：列数 ${ragged.cells.length} 与表头列数 ${columnCount} 不一致。`,
      );
      continue;
    }
    tables.push(block);
  }
  for (const lineNo of otherLines) {
    issues.push(`第 ${lineNo} 行：非表格文本（不在任何 pipe 表行内）。`);
  }

  if (tables.length === 0) {
    return {
      status: 'NOT_A_PIPE_TABLE',
      reason:
        issues.length > 0
          ? `M 不是单个 GFM pipe 表：${issues[0]}`
          : 'M 不含任何 pipe 表行。',
      tableCount: 0,
      issues,
    };
  }
  if (tables.length >= 2) {
    return {
      status: 'MULTIPLE_TABLES',
      reason: `M 含有 ${tables.length} 张 pipe 表（首张在第 ${tables[0].startLine} 行），不是单个 GFM pipe 表。`,
      tableCount: tables.length,
      rowCount: tables[0].rows.length,
      columnCount: tables[0].rows[0].cells.length,
      issues: [
        ...issues,
        `检测到 ${tables.length} 张合法 pipe 表，分别起始于第 ${tables.map((t) => t.startLine).join('、')} 行。`,
      ],
    };
  }
  // 恰好一张合法表：块外若有非表格文本或不成表的 pipe 行块，仍不是“单个表”。
  const extraBlocks = blocks.length - 1;
  if (otherLines.length > 0 || extraBlocks > 0) {
    const extra = [
      ...issues,
      ...(extraBlocks > 0
        ? [`除首张表外还有 ${extraBlocks} 个不成表的 pipe 行块。`]
        : []),
    ];
    return {
      status: 'NOT_A_PIPE_TABLE',
      reason: `M 除一张 pipe 表外还有其他内容：${extra[0]}`,
      tableCount: 1,
      rowCount: tables[0].rows.length,
      columnCount: tables[0].rows[0].cells.length,
      issues: extra,
    };
  }
  return {
    status: 'SINGLE_PIPE_TABLE',
    reason: 'M 是单个 GFM pipe 表。',
    tableCount: 1,
    rowCount: tables[0].rows.length,
    columnCount: tables[0].rows[0].cells.length,
    issues: [],
  };
}

/**
 * 严格字节比较 M 与 F(A)（项目书 §5.3）。
 *
 * 不做 normalization：比较前不对任一输入做 NFC/NFD、不把 CRLF 折成 LF、
 * 不去尾空格、不剥 BOM、不 trim。两串先经 TextEncoder 编成 UTF-8 再逐字节
 * 比对；BOM（U+FEFF → EF BB BF）存在即为字节差异；末尾 LF 缺失/多余也是
 * 字节差异（J-T004-1 口径：F 以单个 LF 结尾）。
 *
 * @param suppliedMarkdown 用户粘贴的 M；undefined 或 '' 表示未提供。
 * @param canonicalMarkdown 本工具 flatten 生成的 F(A)（不得手写假 Markdown 当 F）。
 * @returns CompareResult（只含 M 与 F(A) 的关系；不含任何见证字段）。
 * @throws TableForkInputError（code OVER_SIZE）当 M 超过 64 KiB UTF-8
 *   （项目书 §3.1：Markdown 输入最大 64 KiB UTF-8）。
 * @throws TypeError 当任一参数不是字符串（调用方编程错误，无适用的
 *   ErrorCode 枚举，不冒用表结构错误码，见 J-T007-2）。
 */
export function compareMarkdown(
  suppliedMarkdown: string | undefined,
  canonicalMarkdown: string,
): CompareResult {
  if (typeof canonicalMarkdown !== 'string') {
    throw new TypeError(
      'compareMarkdown: canonicalMarkdown 必须是字符串（应由 flatten 生成的 F(A)）。',
    );
  }
  if (typeof suppliedMarkdown !== 'string') {
    if (suppliedMarkdown !== undefined) {
      throw new TypeError('compareMarkdown: suppliedMarkdown 必须是字符串或 undefined。');
    }
  }

  const canonicalBytes = utf8Encoder.encode(canonicalMarkdown);
  const canonicalByteLength = canonicalBytes.length;

  // J-T007-1（NOT_SUPPLIED 判定）：undefined 或空串 '' 都算“未输入 M”。
  // 空串在 UI 文本区里就是“什么都没粘贴”，与 undefined 同义；把它算成
  // EXACT_DIFF 会误导用户以为“已输入但不匹配”。仅含空白的串（' '、'\n'）
  // 是已提供的输入，走正常比较（EXACT_DIFF + GFM 诊断），不在此列。
  if (suppliedMarkdown === undefined || suppliedMarkdown === '') {
    return {
      status: 'NOT_SUPPLIED',
      gfm: {
        status: 'NOT_CHECKED',
        reason: 'M 未提供，未做 GFM pipe 表检测。',
        tableCount: 0,
        issues: [],
      },
      suppliedByteLength: 0,
      canonicalByteLength,
      summary: '未输入 M（NOT_SUPPLIED）；页面可预览 F(A)。',
    };
  }

  const suppliedBytes = utf8Encoder.encode(suppliedMarkdown);
  const suppliedByteLength = suppliedBytes.length;
  if (suppliedByteLength > MAX_INPUT_BYTES) {
    fail(
      'OVER_SIZE',
      `supplied Markdown is ${suppliedByteLength} UTF-8 bytes, exceeding the ${MAX_INPUT_BYTES} byte limit`,
    );
  }

  const gfm = detectGfmPipeTable(suppliedMarkdown);

  const minLength = Math.min(suppliedByteLength, canonicalByteLength);
  let byteOffset = 0;
  while (byteOffset < minLength && suppliedBytes[byteOffset] === canonicalBytes[byteOffset]) {
    byteOffset += 1;
  }
  if (byteOffset === minLength && suppliedByteLength === canonicalByteLength) {
    return {
      status: 'EXACT_MATCH',
      gfm,
      suppliedByteLength,
      canonicalByteLength,
      summary: 'M 与 F(A) 逐字节相同（EXACT_MATCH）。',
    };
  }

  // EXACT_DIFF：byteOffset 是首个不同字节；若一方是另一方的前缀，
  // byteOffset 等于较短串的长度，该方在该点“已结束”。
  const suppliedOffsets = charByteOffsets(suppliedMarkdown);
  const canonicalOffsets = charByteOffsets(canonicalMarkdown);
  const suppliedLoc = locateChar(suppliedMarkdown, suppliedOffsets, byteOffset);
  const canonicalLoc = locateChar(canonicalMarkdown, canonicalOffsets, byteOffset);
  const firstDiff: FirstDiff = {
    byteOffset,
    suppliedCharIndex: suppliedLoc.charIndex,
    canonicalCharIndex: canonicalLoc.charIndex,
    suppliedByteAtDiff:
      byteOffset < suppliedByteLength ? suppliedBytes[byteOffset] : undefined,
    canonicalByteAtDiff:
      byteOffset < canonicalByteLength ? canonicalBytes[byteOffset] : undefined,
    suppliedCharAtDiff: suppliedLoc.charAtDiff,
    canonicalCharAtDiff: canonicalLoc.charAtDiff,
    suppliedContext: contextAround(suppliedMarkdown, suppliedLoc.charIndex),
    canonicalContext: contextAround(canonicalMarkdown, canonicalLoc.charIndex),
  };
  return {
    status: 'EXACT_DIFF',
    gfm,
    firstDiff,
    suppliedByteLength,
    canonicalByteLength,
    summary:
      `M 与 F(A) 在第 ${byteOffset} 个字节处不同（EXACT_DIFF）；` +
      `M 侧字符下标 ${suppliedLoc.charIndex ?? '（串已结束）'}，F(A) 侧字符下标 ${canonicalLoc.charIndex ?? '（串已结束）'}。`,
  };
}

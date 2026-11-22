# REVIEW_PACK_01 — 核心算法（src/core）

> P029 TableFork 终审源码分卷（规格 v1.0.2）。本卷全文展开以下 11 个文件，
> 不省略、不摘要。每块格式：`### <路径>` + `SHA-256` / `Bytes` / `Lines` +
> ```` 围栏内完整原文（与 `review/RELEASE_MANIFEST.json` 中该文件的 SHA-256 一致）。
> 生成：P029-REFREEZE（`npm run verify:release` 核对每卷每块）。

### src/core/compare.ts
SHA-256: dd4ec5ac7b3675edf2fde5ebfe3c4b7da0a3bfe293f03b910347f996b01dba80
Bytes: 17821
Lines: 467

````ts
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
````

### src/core/flatten.ts
SHA-256: 19f185f523a28337f483b6658387b52b8d0fe2516fe3ef4865be63885d58da27
Bytes: 4563
Lines: 91

````ts
/**
 * P029 TableFork — 双策略 Markdown 投影 (P029-T004)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §5.1（两个扁平化映射）、§6.3
 * （端到端样例）；IMPLEMENTATION_PLAN.md §4.1（流程：… → F_ORIGIN_EMPTY /
 * F_REPEAT_VALUE → …）。
 *
 * 冻结规则（§5.1）：
 * - 每个 HTML 原表行按 grid.slotOwner[r][x] 生成 `| cell |`；在第 1 行后插入
 *   Markdown 分隔行 `| --- |...|`；换行统一为 LF。
 * - 单元格文本：先转义反斜杠 `\` → `\\`，再转义管道 `|` → `\|`
 *   （顺序冻结：先转义反斜杠，否则后引入的 `\` 会被二次转义）。
 * - ORIGIN_EMPTY：槽位是单元格左上原点时显示 text，否则填空字符串。
 * - REPEAT_VALUE：该单元格覆盖的每个槽位都显示 text。
 * - 两种策略使用相同的网格，只在延展槽值填充上不同。
 * - 输入文本换行统一表示为单个空格是在 HTML 文本抽取阶段（parse.ts）
 *   完成的事；本模块只投影 grid 已规范化的 text，不再做空白折叠、
 *   不读 HTML、不抛错（非法输入已在 parse/grid 拒绝）。
 *
 * 本模块是纯函数：无随机、无时间、无环境依赖、无 I/O；同一输入连续
 * 100 次输出逐字节相同（见 tests/core/t004-temp.test.ts 的确定性测试）。
 *
 * 显式裁决（冻结规格未钉死的点，记录在案，供 T011 / 终审复核）：
 * J-T004-1（末行换行）：§5.1 “最后统一 LF 换行”读作“每个生成的行都以
 *   LF 终止”，即输出以单个 LF 结尾（末行后也有换行）。§6.3 的四行示例
 *   在本卡测试中按此口径逐字节钉死（含末尾 LF）。若 T011 / 独立 Oracle
 *   认定应为“行间 LF 分隔、末行无换行”，改为 `lines.join('\n')` 即可，
 *   是一行改动；但在改动前本口径为冻结行为。
 * J-T004-2（空值格）：空字符串单元格在两种策略下都生成空槽位
 *   （`|  |` 中的空段），ORIGIN_EMPTY 的延展格与空值原点格在输出中
 *   不可区分——这是 §5.1 定义的 F 的信息损失本身，不是本模块的缺陷。
 * J-T004-3（分隔行）：分隔行固定为每列一个 `---`（`| --- | --- |`），
 *   与列标题内容无关；即使第 1 行是 tbody 数据行也照此插入（§5.1
 *   只说“在第 1 行后插入”，不分节）。
 * J-T004-4（转义范围）：只转义 `\` 与 `|` 两个字符；`*`、`_`、反引号、
 *   `#` 等其他 Markdown 元字符不转义（§5.1 只冻结这两项）。
 */

import type { Strategy } from './index';
import type { GridResult } from './grid';

/**
 * 转义单个单元格文本：先反斜杠、后管道（§5.1 冻结顺序）。
 * 纯函数；不做空白折叠（那是 parse.ts 的职责）。
 */
export function escapeMarkdownCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

/**
 * 按策略把 canonical grid 投影为 Markdown 文本（§5.1 的 F_p）。
 * 行以 LF 终止（含末行，见 J-T004-1）；分隔行插在第 1 行之后。
 */
export function flattenGrid(grid: GridResult, strategy: Strategy): string {
  const byId = new Map(grid.cells.map((cell) => [cell.id, cell]));
  const lines: string[] = [];
  for (let r = 0; r < grid.rows; r++) {
    const rendered: string[] = [];
    for (let x = 0; x < grid.cols; x++) {
      const cell = byId.get(grid.slotOwner[r][x]);
      // slotOwner 由 buildGrid 保证指向已排序 cells 中的有效 id；
      // 防御性兜底：未知 id 视为空槽位（不抛错，不编造文本）。
      if (cell === undefined) {
        rendered.push('');
        continue;
      }
      const isOrigin = cell.row === r && cell.col === x;
      if (strategy === 'REPEAT_VALUE' || isOrigin) {
        rendered.push(escapeMarkdownCell(cell.text));
      } else {
        rendered.push('');
      }
    }
    lines.push(`| ${rendered.join(' | ')} |`);
    if (r === 0) {
      lines.push(`| ${new Array<string>(grid.cols).fill('---').join(' | ')} |`);
    }
  }
  if (lines.length === 0) return '';
  return `${lines.join('\n')}\n`;
}

/** ORIGIN_EMPTY 策略的 F（§5.1 策略 1：原点留值、延展格留空）。 */
export function flattenOriginEmpty(grid: GridResult): string {
  return flattenGrid(grid, 'ORIGIN_EMPTY');
}

/** REPEAT_VALUE 策略的 F（§5.1 策略 2：每个覆盖格复制原值）。 */
export function flattenRepeatValue(grid: GridResult): string {
  return flattenGrid(grid, 'REPEAT_VALUE');
}
````

### src/core/grid.ts
SHA-256: 7431eacaa7a88990954dadaf655de424b02c8bcda41bee10b57c16832d5eb618
Bytes: 7154
Lines: 180

````ts
/**
 * P029 TableFork — 覆盖网格 (P029-T003)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §3.2（网格形式定义）、§3.1（输入上限）；
 * IMPLEMENTATION_PLAN.md §4.1（流程：parseValidatedTable → buildGrid → buildHeaderPaths）。
 *
 * 输入 parseValidatedTable 的 ParsedTable，按 DOM 序逐行放置单元格：
 * 每个单元格的原点列是该行从左至右第一个未占用列（§3.2），覆盖矩形
 * S_i = [r_i, r_i+h_i) × [x_i, x_i+w_i)。
 *
 * 合法性（全部显式拒绝，不猜测、不回退）：
 * - 行数 1–32、列数 1–12、DOM 单元格 ≤128，超限报 OVER_SIZE（parse.ts 已做
 *   行/格数初查，此处对直接传入的手工 ParsedTable 再做一次防御性复查）。
 * - rowspan 越过最后一行、或覆盖行跨越 thead/tbody 节边界，报 INVALID_SPAN。
 * - 任一覆盖槽已被占用，报 INVALID_GRID_OVERLAP（附首个重叠槽坐标与双方来源）。
 * - 放置完成后每行必须从列 0 连续覆盖到总列数减一；缺失格、中间空洞，
 *   一律报 INVALID_RAGGED_GRID（附首个缺失槽坐标）。
 * - 无跨度的空值格（文本为空字符串）合法存在；整行被上方 rowspan 覆盖
 *   的空 <tr> 合法（该行无 DOM 单元格但全部槽位已被占用）。
 *
 * cellId：按原点行、原点列、DOM 序稳定排序后赋 c00、c01、…（超过 99 为 c100…，
 * 即 `c` + 序号左补零到两位）。数值一律以 string 携带，本模块不产生任何 Number
 * 形式的单元格文本（span/坐标是结构整数，不是数值内容）。
 */

import { MAX_COLS, MAX_DOM_CELLS, MAX_ROWS, type Cell } from './index';
import { fail, type ParsedTable } from './parse';

/** 覆盖网格结果：排序后的 Cell、每槽的归属 cellId、行列数。 */
export interface GridResult {
  /** 按 (原点行, 原点列, DOM 序) 排序的单元格，id 已赋为 c00、c01、… */
  cells: Cell[];
  /** slotOwner[r][x] = 覆盖槽位 (r, x) 的单元格 id；维度 rows × cols。 */
  slotOwner: string[][];
  /** 实际行数（<tr> 数）。 */
  rows: number;
  /** 总列数（所有单元格原点列 + colspan 的最大值）。 */
  cols: number;
}

interface Placed {
  cell: ParsedTable['cells'][number];
  row: number;
  col: number;
  id: string;
}

/**
 * 由 ParsedTable 构建覆盖网格。
 * 失败抛 TableForkInputError（code 必为冻结枚举之一），不返回部分网格。
 */
export function buildGrid(parsed: ParsedTable): GridResult {
  const rowCount = parsed.rows.length;
  if (rowCount < 1 || rowCount > MAX_ROWS) {
    fail('OVER_SIZE', `table has ${rowCount} rows; the limit is 1–${MAX_ROWS}`);
  }
  if (parsed.cells.length > MAX_DOM_CELLS) {
    fail('OVER_SIZE', `table has ${parsed.cells.length} DOM cells; the limit is ${MAX_DOM_CELLS}`);
  }

  // 占用表：只开 MAX_COLS 宽；超宽在放置时即报 OVER_SIZE。
  const occupied: boolean[][] = Array.from({ length: rowCount }, () =>
    new Array<boolean>(MAX_COLS).fill(false),
  );
  const ownerIdx: number[][] = Array.from({ length: rowCount }, () =>
    new Array<number>(MAX_COLS).fill(-1),
  );
  const placed: Placed[] = [];

  for (let r = 0; r < rowCount; r++) {
    const row = parsed.rows[r];
    for (const cell of row.cells) {
      // 原点列：该行从左至右第一个未占用列（§3.2）。
      let x = 0;
      while (x < MAX_COLS && occupied[r][x]) x++;
      if (x >= MAX_COLS) {
        fail(
          'OVER_SIZE',
          `row ${r} already covers all ${MAX_COLS} columns, leaving no room for the cell at DOM #${cell.domIndex}`,
        );
      }
      const lastRow = r + cell.rowSpan - 1;
      if (lastRow >= rowCount) {
        fail(
          'INVALID_SPAN',
          `cell at row ${r} (DOM #${cell.domIndex}) has rowspan=${cell.rowSpan} extending beyond the last row ${rowCount - 1}`,
        );
      }
      // 不可跨 thead/tbody 边界：覆盖的每一行必须与该单元格同节。
      for (let rr = r; rr <= lastRow; rr++) {
        if (parsed.rows[rr].section !== cell.section) {
          fail(
            'INVALID_SPAN',
            `cell at row ${r} column ${x} (DOM #${cell.domIndex}, ${cell.section}) has rowspan=${cell.rowSpan} crossing into a ${parsed.rows[rr].section} row ${rr}`,
          );
        }
      }
      if (x + cell.colSpan > MAX_COLS) {
        fail(
          'OVER_SIZE',
          `cell at row ${r} column ${x} (DOM #${cell.domIndex}) has colspan=${cell.colSpan}, exceeding the ${MAX_COLS}-column limit`,
        );
      }
      // 重叠：矩形内任一槽已被占用即拒绝，报首个重叠槽。
      for (let rr = r; rr <= lastRow; rr++) {
        for (let xx = x; xx < x + cell.colSpan; xx++) {
          if (occupied[rr][xx]) {
            const other = placed[ownerIdx[rr][xx]];
            fail(
              'INVALID_GRID_OVERLAP',
              `cell at row ${r} column ${x} (DOM #${cell.domIndex}) overlaps slot (${rr},${xx}) already occupied by the cell at row ${other.row} column ${other.col} (DOM #${other.cell.domIndex})`,
            );
          }
        }
      }
      for (let rr = r; rr <= lastRow; rr++) {
        for (let xx = x; xx < x + cell.colSpan; xx++) {
          occupied[rr][xx] = true;
          ownerIdx[rr][xx] = placed.length;
        }
      }
      placed.push({ cell, row: r, col: x, id: '' });
    }
  }

  // 总列数 = 所有单元格右沿的最大值；无单元格时为 0（行数 ≥1 但无格，属超限）。
  let totalCols = 0;
  for (const p of placed) {
    totalCols = Math.max(totalCols, p.col + p.cell.colSpan);
  }
  if (totalCols < 1) {
    fail('OVER_SIZE', 'table has no columns; the limit is 1–12 columns');
  }
  if (totalCols > MAX_COLS) {
    fail('OVER_SIZE', `table has ${totalCols} columns; the limit is ${MAX_COLS}`);
  }

  // Ragged：每行必须从列 0 连续覆盖到总列数减一，报首个缺失槽。
  for (let r = 0; r < rowCount; r++) {
    for (let x = 0; x < totalCols; x++) {
      if (!occupied[r][x]) {
        fail(
          'INVALID_RAGGED_GRID',
          `row ${r} has no cell covering column ${x} (table has ${totalCols} columns); coverage must run continuously from column 0 to column ${totalCols - 1}`,
        );
      }
    }
  }

  // cellId：按 (原点行, 原点列, DOM 序) 稳定排序后赋 c00、c01、…。
  const sorted = [...placed].sort(
    (a, b) => a.row - b.row || a.col - b.col || a.cell.domIndex - b.cell.domIndex,
  );
  sorted.forEach((p, i) => {
    p.id = `c${String(i).padStart(2, '0')}`;
  });

  const cells: Cell[] = sorted.map((p) => ({
    id: p.id,
    row: p.row,
    col: p.col,
    rowSpan: p.cell.rowSpan,
    colSpan: p.cell.colSpan,
    role: p.cell.role,
    scope: p.cell.scope,
    text: p.cell.text,
    section: p.cell.section,
  }));

  const slotOwner: string[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const line: string[] = [];
    for (let x = 0; x < totalCols; x++) {
      line.push(placed[ownerIdx[r][x]].id);
    }
    slotOwner.push(line);
  }

  return { cells, slotOwner, rows: rowCount, cols: totalCols };
}
````

### src/core/headers.ts
SHA-256: 33a80b2f0412ba261e465ca82a6c70f58b28d15083e8fc4ad6d8d7f16ca155d0
Bytes: 4243
Lines: 111

````ts
/**
 * P029 TableFork — 明示标题路径 (P029-T003)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §3.3（标题路径语义）、§5.4（交接稿示例）；
 * IMPLEMENTATION_PLAN.md §4.1（流程：… → buildHeaderPaths）。
 *
 * 规则（只认已声明的标题，绝不编造）：
 * - 列标题：对列槽 x，在 thead 中按行由上至下取覆盖 x 的所有非空 th 文本。
 *   同一 cellId 的延展槽在路径中只出现一次（按 cellId 去重）。
 *   thead 中的 td 不是标题；空文本 th 不产生路径项。
 * - 行标题：对行槽 r，在 tbody 的该行从左至右取拥有 scope="row" 的非空 th。
 *   rowspan 延续行仍使用同一来源 cellId，但不生成重复文本（按 cellId 去重，
 *   排序按列从左至右——延续行的来源格可能原点行更早，不能按原点行排）。
 *   tbody 中无 scope 的 th 不是行标题（S0 勘误 P1-01：不得用首列数据值充当
 *   行标题）；thead 行的行路径恒为空数组。
 * - headerStatus：行、列路径任一缺失即 'UNKNOWN'，两者齐全才 'KNOWN'。
 *   缺失标题时路径为空数组，调用方（T008 records.ts）写 '?'，此处不写问号、
 *   不编造任何标题文本。
 * - 跨多行/多列、不同槽位标题路径不同的 td，本模块不强行压成一条记录：
 *   本函数按槽输出路径，逐槽分歧的合并与 SHARED_SOURCE_CELL 标注是 T008 的活。
 *
 * 本函数是纯函数：输入 GridResult，不读 HTML，不抛错（非法输入已在
 * parseValidatedTable / buildGrid 拒绝）。
 */

import type { HeaderStatus } from './index';
import type { GridResult } from './grid';

/** 单个槽位的标题路径：行/列路径数组与已知状态。 */
export interface SlotHeaderPaths {
  row: number;
  col: number;
  rowHeaders: string[];
  colHeaders: string[];
  headerStatus: HeaderStatus;
}

/**
 * 由行、列标题路径判定已知状态：两者齐全为 'KNOWN'，任一缺失为 'UNKNOWN'。
 * 供 T008 的 SlotFact 复用，保持口径一致。
 */
export function headerStatusFor(rowHeaders: string[], colHeaders: string[]): HeaderStatus {
  return rowHeaders.length > 0 && colHeaders.length > 0 ? 'KNOWN' : 'UNKNOWN';
}

/**
 * 对网格的每一个槽位 (r, x) 计算行标题路径与列标题路径。
 * 返回 rows × cols 的二维数组，下标与 grid.slotOwner 对齐。
 */
export function buildHeaderPaths(grid: GridResult): SlotHeaderPaths[][] {
  const { cells, rows, cols } = grid;

  // 列路径：逐列扫描 thead th（cells 已按 (行, 列, DOM 序) 排，即由上至下）。
  const colPaths: string[][] = [];
  for (let x = 0; x < cols; x++) {
    const path: string[] = [];
    const seen = new Set<string>();
    for (const cell of cells) {
      if (cell.section !== 'thead' || cell.role !== 'TH') continue;
      if (cell.text === '') continue;
      if (cell.col <= x && x < cell.col + cell.colSpan && !seen.has(cell.id)) {
        seen.add(cell.id);
        path.push(cell.text);
      }
    }
    colPaths.push(path);
  }

  // 行路径：逐行取覆盖该行的 tbody th scope="row"，按列从左至右。
  const rowPaths: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const path: string[] = [];
    const seen = new Set<string>();
    const covering = cells
      .filter(
        (cell) =>
          cell.section === 'tbody' &&
          cell.role === 'TH' &&
          cell.scope === 'row' &&
          cell.text !== '' &&
          cell.row <= r &&
          r < cell.row + cell.rowSpan,
      )
      .sort((a, b) => a.col - b.col);
    for (const cell of covering) {
      if (!seen.has(cell.id)) {
        seen.add(cell.id);
        path.push(cell.text);
      }
    }
    rowPaths.push(path);
  }

  const out: SlotHeaderPaths[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: SlotHeaderPaths[] = [];
    for (let x = 0; x < cols; x++) {
      const rowHeaders = [...rowPaths[r]];
      const colHeaders = [...colPaths[x]];
      line.push({
        row: r,
        col: x,
        rowHeaders,
        colHeaders,
        headerStatus: headerStatusFor(rowHeaders, colHeaders),
      });
    }
    out.push(line);
  }
  return out;
}
````

### src/core/index.ts
SHA-256: a04cbab6a3ca5982557e87a8d56418e379a9d3484facaefa66a2655855e03b6e
Bytes: 3455
Lines: 118

````ts
/**
 * P029 TableFork — 核心公共出口 (P029-T002 主控，P029-T013 挂载)
 *
 * 后续任务（T003–T014、CLI、UI）一律从这里 import 公共类型 / 枚举 / 常量 / Worker 协议，
 * 不得各自猜字段、不得绕过本文件直接深 import 后再改口径。
 *
 * 本文件只做 re-export，不放任何实现。T013 已按本文件头原注把全部核心模块
 * 一次性挂到本出口（records/report/compare/witness/parse/grid/headers/
 * flatten/sha256 + T002 冻结的契约 + Worker 协议）；挂载后 typecheck +
 * build + 全测试全绿（见 artifacts/logs/T013-release.txt）。
 *
 * 去重口径（挂载时唯一需要裁决的点，行为零改动）：
 * - sha256Utf8 只从 ./sha256 导出一次：witness.ts 与 report.ts 只是
 *   re-export 同一实现，多处导出会造成歧义导出，改由本文件统一出口。
 * - isTableForkError 只从 ./types 导出一次：report.ts 只是 re-export
 *   同一函数，同样归一到 types。
 * 其余各模块导出名无冲突，全数挂载，不省略、不改名。
 */

export type {
  AnalyzeInput,
  AnalyzeResult,
  Cell,
  CollisionKind,
  CollisionProof,
  CompareStatus,
  ErrorCode,
  HeaderStatus,
  SlotFact,
  Strategy,
  TableForkError,
  WitnessStatus,
} from './types';
export {
  ERROR_CODES,
  INPUT_SCHEMA,
  MAX_COLS,
  MAX_DOM_CELLS,
  MAX_INPUT_BYTES,
  MAX_ROWS,
  MAX_SPAN,
  REPORT_SCHEMA,
  SPEC_VERSION,
  isTableForkError,
} from './types';

// parse.ts（T003）：严格限定 HTML 解析与输入校验。
export {
  TableForkInputError,
  decodeEntities,
  fail,
  normalizeCellText,
  parseValidatedTable,
} from './parse';
export type { ParsedCell, ParsedRow, ParsedTable, ParseOptions } from './parse';

// grid.ts（T003）：覆盖网格。
export { buildGrid } from './grid';
export type { GridResult } from './grid';

// headers.ts（T003）：明示标题路径。
export { buildHeaderPaths, headerStatusFor } from './headers';
export type { SlotHeaderPaths } from './headers';

// flatten.ts（T004）：双策略 Markdown 投影。
export {
  escapeMarkdownCell,
  flattenGrid,
  flattenOriginEmpty,
  flattenRepeatValue,
} from './flatten';

// witness.ts（T005）：单格拆分与反事实碰撞证明。
export {
  buildAlternativeHtml,
  canonicalCellGraph,
  collisionKindOf,
  findWitness,
  headerPathsChanged,
  splitCost,
  utf8BytesEqual,
} from './witness';
export type { WitnessResult } from './witness';

// compare.ts（T007）：用户 Markdown 严格对账。
export { compareMarkdown, detectGfmPipeTable } from './compare';
export type {
  CompareResult,
  FirstDiff,
  GfmCheckResult,
  GfmTableStatus,
} from './compare';

// records.ts（T008）：逐槽来源证据。
export {
  UNKNOWN_TITLE,
  buildSlotFacts,
  formatSlotFact,
  formatSlotFacts,
} from './records';

// report.ts（T008）：公共浏览器内核与结果 JSON。
export { analyze, sha256Utf8WebCrypto } from './report';

// sha256.ts（T009-FIX-01）：浏览器安全同步 SHA-256（FIPS 180-4）。
// 本文件是 sha256Utf8 的唯一出口（见文件头去重口径）。
export { sha256Utf8 } from './sha256';

export type {
  AnalyzeRequestMessage,
  CancelMessage,
  WorkerErrorMessage,
  WorkerMessage,
  WorkerRequestMessage,
  WorkerResponseMessage,
  WorkerResultMessage,
} from '../worker/protocol';
export { isWorkerRequestMessage, isWorkerResponseMessage } from '../worker/protocol';
````

### src/core/parse.ts
SHA-256: f302eec9dcd5a5a2a14ccabfd15016e85a03463c0e75410986e869bc82bafc25
Bytes: 26506
Lines: 775

````ts
/**
 * P029 TableFork — 限定 HTML 子集解析 (P029-T003)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §3.1（输入契约）、§3.2（网格形式定义）、
 * §3.3（标题路径规则）、§5.5（错误枚举）；IMPLEMENTATION_PLAN.md §4.1
 * （流程：parseValidatedTable → buildGrid → buildHeaderPaths）。
 *
 * 本模块只做解析与结构校验，不做占槽（那是 grid.ts 的活）：
 * 输入必须是单个顶层 <table>，标签只允许 table/thead/tbody/tr/th/td/caption，
 * 单元格内只允许纯文本。其他一律按 §5.5 的枚举错误拒绝，绝不猜测、不回退为“有效”。
 *
 * 显式裁决（冻结规格未钉死的点，记录在案，供 T011 / 终审复核）：
 * 1. 冻结的 ErrorCode 只有 7 个，没有 INVALID_HTML / UNSUPPORTED_MARKUP。
 *    因此“无 <table>”、结构错位（多 thead/tbody、错位 tr/td、标签未闭合、
 *    表外杂散文本/元素、不在限定子集内的元素如 <div>/<b>/<script>/<tfoot>）
 *    一律报 INVALID_RAGGED_GRID，并附精确说明。这是“网格无法按限定子集构成”
 *    的兜底桶，不是说这些输入是 ragged 行——消息正文写明真实原因。
 * 2. 多个顶层 <table> 与嵌套 <table> 一律报 UNSUPPORTED_NESTED_TABLE（§3.1
 *    “多 <table>、嵌套表格拒绝”）。
 * 3. thead 的 th 一律作列标题；tbody 的 th 只有 scope="row" 才作行标题；
 *    scope="row" 在 thead、scope="col" 在 tbody、scope=rowgroup/colgroup、
 *    任意非法 scope 值、任何单元格上的 headers 属性，一律报
 *    UNSUPPORTED_HEADER_SEMANTICS。tbody 的 th 无 scope 时 scope=null，
 *    视为语义未知（不是错误，占槽但不产生标题路径——S0 勘误 P1-01 的教训）。
 *    td 上的 scope="row"/"col" 无定义含义，忽略；rowgroup/colgroup/非法值照样拒绝。
 * 4. 行数 1–32、DOM 单元格 ≤128、输入 ≤64 KiB 超限报 OVER_SIZE；
 *    rowspan/colspan 不是 1–8 的整数报 INVALID_SPAN。
 * 5. 文本抽取：只解码以 ';' 结尾的字符引用（命名实体见 NAMED_ENTITIES 表，
 *    未知命名实体保持原样，不猜测；数值引用须为合法 Unicode 标量值），
 *    再把连续 ASCII 空白（空格/Tab/LF/FF/CR/垂直制表符）折叠为一个 U+0020，首尾 trim
 *    （仅去 ASCII 空白；U+00A0 保留——FIX-03 按项目书 §3.1 口径实现，
 *    与 Oracle normalize_text 一致；此前 .trim() 会误去首尾 U+00A0）。
 *    FIX-04：折叠与 trim 的字符集补上 U+000B（\v），与 Oracle 的
 *    "[ \t\n\r\f\v]" 完全一致（此前 TS 的 "[ \t\n\f\r]" 漏了 \v）。
 *    单元格内单个 U+00A0（&nbsp;）予以保留——它是 deliberate 的字符而非排版空白。
 * 6. 结束标签遵循 HTML 的确定性隐含闭合：新单元格开始时隐含闭合上一单元格，
 *    新行开始时隐含闭合上一行，</tr>/</thead>/</tbody>/</table> 隐含闭合其内
 *    未闭合的单元格/行；EOF 不是边界——EOF 时仍有未闭合元素即报
 *    INVALID_RAGGED_GRID。<caption> 必须显式闭合。
 * 7. 直接位于 <table> 下的 <tr> 按 HTML 规则视为隐式 tbody 行；thead/tbody
 *    的先后顺序不限（各最多一个），span 越界检查以每行实际 section 为准。
 *    <html>/<head>/<body> 等文档外壳不在限定子集内，出现即拒绝。
 * 8. 与网格无关的属性（class/id/style/data-* 等）忽略；只读 rowspan、colspan、
 *    scope、headers 四个语义属性。CSS 视觉合并一律不推断（§3.2）。
 * 9. CANCELLED：仅在入口处（解析开始、tokenize 完成后）检查 AbortSignal；
 *    解析本身是 ≤64 KiB 的同步纯函数，无中途取消点。
 */

import {
  MAX_DOM_CELLS,
  MAX_INPUT_BYTES,
  MAX_ROWS,
  MAX_SPAN,
  type ErrorCode,
  type TableForkError,
} from './index';

/**
 * 结构化输入错误：Error 子类，同时满足 T002 冻结的 TableForkError 形状
 * （{ code: ErrorCode; message: string }），isTableForkError() 可识别。
 * grid.ts / headers.ts 复用本类，不另建错误载体。
 */
export class TableForkInputError extends Error implements TableForkError {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'TableForkInputError';
    this.code = code;
  }
}

/** 抛一个 TableForkInputError（返回 never，便于在表达式位置使用）。 */
export function fail(code: ErrorCode, message: string): never {
  throw new TableForkInputError(code, message);
}

/** 供解析器与调用方复用的解析选项：目前只有取消信号。 */
export interface ParseOptions {
  signal?: AbortSignal;
}

/** 解析出的单个 DOM 单元格（DOM 序；坐标由 grid.ts 赋予）。 */
export interface ParsedCell {
  /** DOM 文档序（0-based），cellId 排序的第三关键字。 */
  domIndex: number;
  role: 'TH' | 'TD';
  /** th 的 scope；tbody 的行标题只认 'row'；无 scope 为 null（语义未知）。 */
  scope: 'row' | 'col' | null;
  rowSpan: number;
  colSpan: number;
  /** 解码 + 空白折叠 + trim 后的纯文本（永远是 string，绝不解析为 Number）。 */
  text: string;
  section: 'thead' | 'tbody';
  /** 该单元格所在 <tr> 在全表中的行号（0-based，thead 行在前按 DOM 序）。 */
  rowIndex: number;
}

/** 解析出的一行（<tr>），section 为其所属节；直接位于 <table> 下的 <tr> 记为 tbody。 */
export interface ParsedRow {
  section: 'thead' | 'tbody';
  cells: ParsedCell[];
}

/** 解析出的整表：行按 DOM 序，cells 为同一批对象的扁平 DOM 序视图。 */
export interface ParsedTable {
  rows: ParsedRow[];
  cells: ParsedCell[];
  /** 首个 <caption> 的规范化文本；无 caption 为 null。caption 不参与网格。 */
  captionText: string | null;
}

// ---------------------------------------------------------------------------
// 实体解码
// ---------------------------------------------------------------------------

/** 支持的命名实体表（HTML 常用子集 + Latin-1 字母）。未列出的命名实体保持原样。 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  bdquo: '„',
  dagger: '†',
  Dagger: '‡',
  permil: '‰',
  lsaquo: '‹',
  rsaquo: '›',
  ensp: '\u2002',
  emsp: '\u2003',
  thinsp: '\u2009',
  zwnj: '\u200C',
  zwj: '\u200D',
  lrm: '\u200E',
  rlm: '\u200F',
  iexcl: '¡',
  cent: '¢',
  pound: '£',
  curren: '¤',
  yen: '¥',
  brvbar: '¦',
  sect: '§',
  uml: '¨',
  ordf: 'ª',
  ordm: 'º',
  macr: '¯',
  acute: '´',
  cedil: '¸',
  iquest: '¿',
  times: '×',
  divide: '÷',
  plusmn: '±',
  deg: '°',
  micro: 'µ',
  para: '¶',
  middot: '·',
  bull: '•',
  szlig: 'ß',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup1: '¹',
  sup2: '²',
  sup3: '³',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
  Agrave: 'À',
  Aacute: 'Á',
  Acirc: 'Â',
  Atilde: 'Ã',
  Auml: 'Ä',
  Aring: 'Å',
  AElig: 'Æ',
  Ccedil: 'Ç',
  Egrave: 'È',
  Eacute: 'É',
  Ecirc: 'Ê',
  Euml: 'Ë',
  Igrave: 'Ì',
  Iacute: 'Í',
  Icirc: 'Î',
  Iuml: 'Ï',
  Ntilde: 'Ñ',
  Ograve: 'Ò',
  Oacute: 'Ó',
  Ocirc: 'Ô',
  Otilde: 'Õ',
  Ouml: 'Ö',
  Oslash: 'Ø',
  Ugrave: 'Ù',
  Uacute: 'Ú',
  Ucirc: 'Û',
  Uuml: 'Ü',
  Yacute: 'Ý',
};

/**
 * 解码以 ';' 结尾的字符引用：命名实体（仅上表）、十进制/十六进制数值引用。
 * 未知命名实体、非法数值（越界、代理区）保持原样，不猜测。
 */
export function decodeEntities(raw: string): string {
  return raw.replace(
    /&(#(?:[xX][0-9a-fA-F]+|\d+)|[a-zA-Z][a-zA-Z0-9]+);/g,
    (whole: string, body: string): string => {
      if (body.startsWith('#')) {
        const digits = body.slice(1);
        const codePoint =
          digits.startsWith('x') || digits.startsWith('X')
            ? Number.parseInt(digits.slice(1), 16)
            : Number.parseInt(digits, 10);
        if (
          !Number.isFinite(codePoint) ||
          codePoint < 0 ||
          codePoint > 0x10ffff ||
          (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ) {
          return whole;
        }
        return String.fromCodePoint(codePoint);
      }
      const named = NAMED_ENTITIES[body];
      return named !== undefined ? named : whole;
    },
  );
}

/**
 * 单元格文本规范化（§3.1）：解码实体 → 连续 ASCII 空白折为一个 U+0020 →
 * 首尾 trim（仅去 ASCII 空白；U+00A0 保留，FIX-03，R1 P2 #3）。
 * 保留 Unicode 码点；单个 U+00A0 等非 ASCII 空白字符不参与折叠（见文件头裁决 5）。
 * 注意：JS 的 String.prototype.trim() 会去掉首尾 U+00A0，故此处不用 .trim()，
 * 而用仅匹配 ASCII 空白的显式首尾替换，与 Oracle normalize_text 的
 * .strip(" \t\n\r\f\v") 口径一致（见 FIX-03.txt §1）。
 */
export function normalizeCellText(raw: string): string {
  return decodeEntities(raw)
    .replace(/[ \t\n\f\r\v]+/g, ' ')
    .replace(/^[ \t\n\f\r\v]+|[ \t\n\f\r\v]+$/g, '');
}

// ---------------------------------------------------------------------------
// 词法：手写分词器（不依赖 DOMParser / jsdom；纯函数、确定性）
// ---------------------------------------------------------------------------

type Token =
  | { type: 'startTag'; name: string; attrs: Map<string, string>; pos: number }
  | { type: 'endTag'; name: string; pos: number }
  | { type: 'text'; value: string; pos: number };

const ASCII_WS = /[ \t\n\f\r]/;
const TAG_NAME_START = /[A-Za-z]/;

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    if (html[i] !== '<') {
      const start = i;
      while (i < n && html[i] !== '<') i++;
      tokens.push({ type: 'text', value: html.slice(start, i), pos: start });
      continue;
    }
    const next = html[i + 1];
    if (next === '!') {
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        if (end === -1) {
          fail('INVALID_RAGGED_GRID', `unterminated comment at offset ${i}`);
        }
        i = end + 3;
        continue;
      }
      // <!DOCTYPE ...> / <![CDATA[...]]> / 其他 <!...>：跳到下一个 '>'
      const end = html.indexOf('>', i + 2);
      if (end === -1) {
        fail('INVALID_RAGGED_GRID', `unterminated markup declaration at offset ${i}`);
      }
      i = end + 1;
      continue;
    }
    if (next === '?') {
      const end = html.indexOf('?>', i + 2);
      if (end === -1) {
        fail('INVALID_RAGGED_GRID', `unterminated processing instruction at offset ${i}`);
      }
      i = end + 2;
      continue;
    }
    if (next === '/') {
      const m = /^[A-Za-z][A-Za-z0-9-]*/.exec(html.slice(i + 2));
      if (!m) {
        fail('INVALID_RAGGED_GRID', `malformed end tag at offset ${i}`);
      }
      const name = m[0].toLowerCase();
      let j = i + 2 + m[0].length;
      while (j < n && html[j] !== '>') {
        if (!ASCII_WS.test(html[j])) {
          fail('INVALID_RAGGED_GRID', `unexpected content in end tag </${name}> at offset ${j}`);
        }
        j++;
      }
      if (j >= n) {
        fail('INVALID_RAGGED_GRID', `unterminated end tag </${name}> at offset ${i}`);
      }
      tokens.push({ type: 'endTag', name, pos: i });
      i = j + 1;
      continue;
    }
    if (next !== undefined && TAG_NAME_START.test(next)) {
      const m = /^[A-Za-z][A-Za-z0-9-]*/.exec(html.slice(i + 1));
      if (!m) {
        fail('INVALID_RAGGED_GRID', `malformed start tag at offset ${i}`);
      }
      const name = m[0].toLowerCase();
      let j = i + 1 + m[0].length;
      const attrs = new Map<string, string>();
      let closed = false;
      while (j < n) {
        while (j < n && ASCII_WS.test(html[j])) j++;
        if (j >= n) break;
        if (html[j] === '>') {
          closed = true;
          j++;
          break;
        }
        if (html[j] === '/') {
          // 非 void 元素上的 '/' 按 HTML 规则忽略（元素仍需闭合）；'/>' 之外报错。
          if (html[j + 1] === '>') {
            closed = true;
            j += 2;
            break;
          }
          fail('INVALID_RAGGED_GRID', `unexpected '/' in <${name}> at offset ${j}`);
        }
        const am = /^[^\s=/>]+/.exec(html.slice(j));
        if (!am) {
          fail('INVALID_RAGGED_GRID', `malformed attribute in <${name}> at offset ${j}`);
        }
        const attrName = am[0].toLowerCase();
        j += am[0].length;
        while (j < n && ASCII_WS.test(html[j])) j++;
        let attrValue = '';
        if (html[j] === '=') {
          j++;
          while (j < n && ASCII_WS.test(html[j])) j++;
          const quote = html[j];
          if (quote === '"' || quote === "'") {
            const end = html.indexOf(quote, j + 1);
            if (end === -1) {
              fail('INVALID_RAGGED_GRID', `unterminated attribute value in <${name}> at offset ${j}`);
            }
            attrValue = decodeEntities(html.slice(j + 1, end));
            j = end + 1;
          } else {
            const vm = /^[^\s>]+/.exec(html.slice(j));
            if (!vm) {
              fail('INVALID_RAGGED_GRID', `missing attribute value in <${name}> at offset ${j}`);
            }
            attrValue = decodeEntities(vm[0]);
            j += vm[0].length;
          }
        }
        // 重复属性：第一个生效（HTML 规则）。
        if (!attrs.has(attrName)) attrs.set(attrName, attrValue);
      }
      if (!closed) {
        fail('INVALID_RAGGED_GRID', `unterminated start tag <${name}> at offset ${i}`);
      }
      tokens.push({ type: 'startTag', name, attrs, pos: i });
      i = j;
      continue;
    }
    // '<' 后不是标签开头：按字面 '<' 计入文本。
    const start = i;
    i++;
    while (i < n && html[i] !== '<') i++;
    tokens.push({ type: 'text', value: html.slice(start, i), pos: start });
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// 单元格属性校验（parse 时即校验：span 语法/范围、header 语义）
// ---------------------------------------------------------------------------

function parseSpan(
  attrs: Map<string, string>,
  attrName: 'rowspan' | 'colspan',
  tagName: string,
  pos: number,
): number {
  if (!attrs.has(attrName)) return 1;
  const raw = (attrs.get(attrName) as string).trim();
  if (!/^[+-]?\d+$/.test(raw)) {
    fail(
      'INVALID_SPAN',
      `<${tagName}> ${attrName}="${raw}" is not an integer (offset ${pos}); rowspan/colspan must be integers 1–${MAX_SPAN}`,
    );
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_SPAN) {
    fail(
      'INVALID_SPAN',
      `<${tagName}> ${attrName}=${value} is outside 1–${MAX_SPAN} (offset ${pos})`,
    );
  }
  return value;
}

interface OpenCell {
  role: 'TH' | 'TD';
  scope: 'row' | 'col' | null;
  rowSpan: number;
  colSpan: number;
  section: 'thead' | 'tbody';
  raw: string;
}

function openCellFromTag(
  tagName: 'th' | 'td',
  attrs: Map<string, string>,
  section: 'thead' | 'tbody',
  pos: number,
): OpenCell {
  const role: 'TH' | 'TD' = tagName === 'th' ? 'TH' : 'TD';
  // headers 属性：任何单元格上一律不支持（§3.1 / §4.2）。
  if (attrs.has('headers')) {
    fail(
      'UNSUPPORTED_HEADER_SEMANTICS',
      `<${tagName}> uses a headers attribute (offset ${pos}); explicit headers references are not supported`,
    );
  }
  // scope：只认 row / col；rowgroup / colgroup / 非法值一律不支持。
  let scope: 'row' | 'col' | null = null;
  if (attrs.has('scope')) {
    const rawScope = (attrs.get('scope') as string).trim().toLowerCase();
    if (rawScope === 'rowgroup' || rawScope === 'colgroup') {
      fail(
        'UNSUPPORTED_HEADER_SEMANTICS',
        `<${tagName}> scope="${rawScope}" is not supported (offset ${pos}); only scope="row" in tbody and scope="col" in thead are supported`,
      );
    }
    if (rawScope !== 'row' && rawScope !== 'col') {
      fail(
        'UNSUPPORTED_HEADER_SEMANTICS',
        `<${tagName}> has an invalid scope value "${rawScope}" (offset ${pos}); expected "row" or "col"`,
      );
    }
    if (role === 'TH') {
      if (rawScope === 'row' && section === 'thead') {
        fail(
          'UNSUPPORTED_HEADER_SEMANTICS',
          `<th> scope="row" inside <thead> is contradictory (offset ${pos}); thead th are column headers`,
        );
      }
      if (rawScope === 'col' && section === 'tbody') {
        fail(
          'UNSUPPORTED_HEADER_SEMANTICS',
          `<th> scope="col" inside <tbody> is contradictory (offset ${pos}); scope="col" is only allowed in thead`,
        );
      }
      scope = rawScope;
    }
    // td 上的 scope="row"/"col" 无定义含义，忽略（rowgroup/colgroup/非法值已在上面拒绝）。
  }
  return {
    role,
    scope,
    rowSpan: parseSpan(attrs, 'rowspan', tagName, pos),
    colSpan: parseSpan(attrs, 'colspan', tagName, pos),
    section,
    raw: '',
  };
}

// ---------------------------------------------------------------------------
// 主入口：parseValidatedTable
// ---------------------------------------------------------------------------

/**
 * 解析并校验单个顶层 <table>（限定 HTML 子集）。
 * 成功返回 ParsedTable（行/单元格均按 DOM 序）；失败抛 TableForkInputError，
 * 其 code 必为 T002 冻结的 7 个枚举之一。
 * 本函数不做占槽：坐标、重叠、ragged 判定由 buildGrid（grid.ts）负责。
 */
export function parseValidatedTable(html: string, options?: ParseOptions): ParsedTable {
  if (options?.signal?.aborted) {
    fail('CANCELLED', 'parse cancelled before start');
  }
  if (typeof html !== 'string') {
    fail('INVALID_RAGGED_GRID', 'input html must be a string');
  }
  const byteLength = new TextEncoder().encode(html).length;
  if (byteLength > MAX_INPUT_BYTES) {
    fail(
      'OVER_SIZE',
      `input is ${byteLength} UTF-8 bytes, exceeding the ${MAX_INPUT_BYTES} byte limit`,
    );
  }
  const tokens = tokenize(html);
  if (options?.signal?.aborted) {
    fail('CANCELLED', 'parse cancelled');
  }

  const rows: ParsedRow[] = [];
  const cells: ParsedCell[] = [];
  let captionText: string | null = null;
  let captionOpen = false;
  let captionRaw = '';
  let seenTable = false;
  let tableDone = false;
  let theadSeen = false;
  let tbodySeen = false;
  let openSection: 'thead' | 'tbody' | null = null;
  let openRow: { section: 'thead' | 'tbody'; cells: ParsedCell[] } | null = null;
  let openCell: OpenCell | null = null;

  const closeCell = (): void => {
    if (openCell === null || openRow === null) return;
    const cell: ParsedCell = {
      domIndex: cells.length,
      role: openCell.role,
      scope: openCell.scope,
      rowSpan: openCell.rowSpan,
      colSpan: openCell.colSpan,
      text: normalizeCellText(openCell.raw),
      section: openCell.section,
      rowIndex: rows.length,
    };
    openRow.cells.push(cell);
    cells.push(cell);
    openCell = null;
  };

  const closeRow = (): void => {
    closeCell();
    if (openRow === null) return;
    rows.push({ section: openRow.section, cells: openRow.cells });
    openRow = null;
  };

  const closeCaption = (): void => {
    captionText = normalizeCellText(captionRaw);
    captionRaw = '';
    captionOpen = false;
  };

  for (const token of tokens) {
    if (token.type === 'text') {
      if (openCell !== null) {
        openCell.raw += token.value;
        continue;
      }
      if (captionOpen) {
        captionRaw += token.value;
        continue;
      }
      // 单元格/caption 之外只允许空白（含实体解码后的空白）。
      if (!/^[\s]*$/.test(decodeEntities(token.value))) {
        const snippet = normalizeCellText(token.value).slice(0, 20);
        fail(
          'INVALID_RAGGED_GRID',
          `non-whitespace text outside table cells at offset ${token.pos}: "${snippet}"`,
        );
      }
      continue;
    }

    if (token.type === 'startTag') {
      const { name, attrs } = token;
      if (name === 'table') {
        if (!seenTable && !tableDone) {
          seenTable = true;
          continue;
        }
        fail(
          'UNSUPPORTED_NESTED_TABLE',
          tableDone
            ? `multiple top-level <table> elements are not supported (offset ${token.pos}); import one table at a time`
            : `nested <table> is not supported (offset ${token.pos})`,
        );
      }
      if (!seenTable || tableDone) {
        fail(
          'INVALID_RAGGED_GRID',
          `element <${name}> outside the single top-level <table> at offset ${token.pos}`,
        );
      }
      switch (name) {
        case 'caption': {
          if (captionOpen || openSection !== null || openRow !== null || openCell !== null || captionText !== null) {
            fail(
              'INVALID_RAGGED_GRID',
              `<caption> must be a direct child of <table> and appear at most once (offset ${token.pos})`,
            );
          }
          captionOpen = true;
          captionRaw = '';
          break;
        }
        case 'thead':
        case 'tbody': {
          // 新节开始隐含闭合上一行与上一节（确定性 HTML 规则）；caption 必须已显式闭合。
          if (captionOpen) {
            fail('INVALID_RAGGED_GRID', `<${name}> appears before </caption> (offset ${token.pos})`);
          }
          closeRow();
          if (openSection !== null) openSection = null;
          if (name === 'thead' && theadSeen) {
            fail('INVALID_RAGGED_GRID', `multiple <thead> sections are not supported (offset ${token.pos})`);
          }
          if (name === 'tbody' && tbodySeen) {
            fail('INVALID_RAGGED_GRID', `multiple <tbody> sections are not supported (offset ${token.pos})`);
          }
          if (name === 'thead') theadSeen = true;
          else tbodySeen = true;
          openSection = name;
          break;
        }
        case 'tr': {
          if (captionOpen) {
            fail('INVALID_RAGGED_GRID', `<tr> appears before </caption> (offset ${token.pos})`);
          }
          // 新行开始隐含闭合上一行（确定性 HTML 规则）。
          closeRow();
          openRow = { section: openSection ?? 'tbody', cells: [] };
          break;
        }
        case 'th':
        case 'td': {
          if (openRow === null || captionOpen) {
            fail(
              'INVALID_RAGGED_GRID',
              `<${name}> outside <tr> at offset ${token.pos}`,
            );
          }
          // 新单元格开始隐含闭合上一单元格（确定性 HTML 规则）。
          closeCell();
          openCell = openCellFromTag(name, attrs, openRow.section, token.pos);
          break;
        }
        default:
          fail(
            'INVALID_RAGGED_GRID',
            `element <${name}> is not in the limited table subset (table/thead/tbody/tr/th/td/caption) at offset ${token.pos}`,
          );
      }
      continue;
    }

    // endTag
    const { name } = token;
    if (name === 'table') {
      if (!seenTable || tableDone) {
        fail('INVALID_RAGGED_GRID', `stray </table> at offset ${token.pos}`);
      }
      closeRow();
      if (openSection !== null) openSection = null;
      if (captionOpen) closeCaption();
      tableDone = true;
      continue;
    }
    if (!seenTable || tableDone) {
      fail('INVALID_RAGGED_GRID', `end tag </${name}> outside the single <table> at offset ${token.pos}`);
    }
    switch (name) {
      case 'caption': {
        if (!captionOpen) {
          fail('INVALID_RAGGED_GRID', `stray </caption> at offset ${token.pos}`);
        }
        closeCaption();
        break;
      }
      case 'thead':
      case 'tbody': {
        if (openSection !== name) {
          fail('INVALID_RAGGED_GRID', `mismatched </${name}> at offset ${token.pos}`);
        }
        closeRow();
        openSection = null;
        break;
      }
      case 'tr': {
        if (openRow === null) {
          fail('INVALID_RAGGED_GRID', `stray </tr> at offset ${token.pos}`);
        }
        closeRow();
        break;
      }
      case 'th':
      case 'td': {
        if (openCell === null || (openCell.role === 'TH') !== (name === 'th')) {
          fail('INVALID_RAGGED_GRID', `mismatched </${name}> at offset ${token.pos}`);
        }
        closeCell();
        break;
      }
      default:
        fail(
          'INVALID_RAGGED_GRID',
          `end tag </${name}> is not in the limited table subset at offset ${token.pos}`,
        );
    }
  }

  // EOF 不是边界：仍有未闭合元素即结构不完整。
  if (openCell !== null || openRow !== null || openSection !== null || captionOpen) {
    const unclosed = [
      openCell !== null ? `<${openCell.role === 'TH' ? 'th' : 'td'}>` : null,
      openRow !== null ? '<tr>' : null,
      openSection !== null ? `<${openSection}>` : null,
      captionOpen ? '<caption>' : null,
    ]
      .filter((x): x is string => x !== null)
      .join(', ');
    fail('INVALID_RAGGED_GRID', `unclosed element(s) at end of input: ${unclosed}`);
  }
  if (!seenTable) {
    fail('INVALID_RAGGED_GRID', 'no <table> element found in input');
  }
  if (!tableDone) {
    fail('INVALID_RAGGED_GRID', 'missing </table>');
  }
  if (rows.length < 1 || rows.length > MAX_ROWS) {
    fail('OVER_SIZE', `table has ${rows.length} rows; the limit is 1–${MAX_ROWS}`);
  }
  if (cells.length > MAX_DOM_CELLS) {
    fail('OVER_SIZE', `table has ${cells.length} DOM cells; the limit is ${MAX_DOM_CELLS}`);
  }

  return { rows, cells, captionText };
}
````

### src/core/records.ts
SHA-256: 310fbd75fd76d5cdbec2e1649eed63274888c8e1074564b0eac12dd0ec27d158
Bytes: 4394
Lines: 93

````ts
/**
 * P029 TableFork — 逐槽来源证据 (P029-T008)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §5.4（逐格交接文本）、§3.3
 * （标题路径语义）、§6.1（SlotFact 权威字段）；IMPLEMENTATION_PLAN.md
 * §4.1（流程：… → renderFacts）、§6 的 P029-T008 卡。
 *
 * 规则（只认已声明的标题，绝不编造）：
 * - 对每个 td 占用的槽位出一条 SlotFact（§5.4 / §3.3）：跨多行/多列的
 *   td 不压成一条记录；同一来源格占用的多个槽位各出一条，共享同一
 *   cellId——逐槽记录本身即表达“共享来源格”，SlotFact 冻结字段里没有
 *   另设 SHARED_SOURCE_CELL 字段的位置，故不在此加字段（见 J-T008-4）。
 * - value 永远是字符串，绝不转 Number（计划 §4.2：17 位 ID 精度问题）。
 *   本模块不解析、不 trim 之外的任何改写：value 就是 grid 中该格的
 *   text 原样（parse.ts 已做实体解码与空白折叠）。
 * - 行标题来源仅限 §3.3 的 tbody th scope=row（headers.ts 已按此算出
 *   路径）；行标题/列标题缺失时路径为空数组，序列化时写 '?'，不得靠
 *   启发式编造，不得用首列数据值充当行标题（项目书 v1.0.1 勘误）。
 * - 标题路径用 ' > ' 连接；行列坐标为 0-based 网格坐标。
 *
 * 本模块是纯函数：无 Node 专属调用、无随机、无时间、无 I/O。
 * 不 import witness.ts（不依赖哈希）；不改任何上游文件。
 */

import type { SlotFact } from './index';
import type { GridResult } from './grid';
import { buildHeaderPaths } from './headers';

/** 标题缺失时交接文本中的占位符（§5.4：写 '?'，不得编造）。 */
export const UNKNOWN_TITLE = '?' as const;

/**
 * 由覆盖网格生成逐槽 SlotFact（§6.1 权威字段）。
 *
 * - 只对 role 为 TD 的单元格占用的槽位出记录；th 槽位不出事实行
 *   （th 是标题本身，不是数据值）。
 * - 行主序（row 递增，row 内 col 递增），确定性顺序。
 * - 每个事实行的 rowHeaders/colHeaders 取自 buildHeaderPaths 的逐槽
 *   路径（已按 §3.3 去重：同一 cellId 的延展槽在路径中只出现一次）；
 *   headerStatus 由 headers.ts 的同一口径判定（任一路径缺失即
 *   'UNKNOWN'，两者齐全才 'KNOWN'）。
 * - value 为来源格的 text 原样字符串；跨槽共享的来源格在每个槽位
 *   上重复同一字符串值（这是逐槽事实，不是复制错误）。
 */
export function buildSlotFacts(grid: GridResult): SlotFact[] {
  const paths = buildHeaderPaths(grid);
  const byId = new Map(grid.cells.map((cell) => [cell.id, cell]));
  const facts: SlotFact[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = byId.get(grid.slotOwner[r][x]);
      if (cell === undefined || cell.role !== 'TD') {
        continue;
      }
      const slotPaths = paths[r][x];
      facts.push({
        row: r,
        col: x,
        cellId: cell.id,
        rowHeaders: [...slotPaths.rowHeaders],
        colHeaders: [...slotPaths.colHeaders],
        headerStatus: slotPaths.headerStatus,
        value: cell.text,
      });
    }
  }
  return facts;
}

/**
 * 单条 SlotFact 的 §5.4 交接文本序列化。
 *
 * 格式：`[R{row}C{col} source={cellId}] 行标题: {行路径或 ?} | 列标题: {列路径或 ?} | 数值: {value}`
 * - 行列坐标为 0-based 网格坐标（§6.3 例：120 在 (2,1)，故 R2C1）。
 * - 标题路径用 ' > ' 连接；任一路径为空数组时该侧写 '?'。
 * - 数值原样输出（字符串，不转 Number，不加引号）。
 */
export function formatSlotFact(fact: SlotFact): string {
  const rowTitle = fact.rowHeaders.length > 0 ? fact.rowHeaders.join(' > ') : UNKNOWN_TITLE;
  const colTitle = fact.colHeaders.length > 0 ? fact.colHeaders.join(' > ') : UNKNOWN_TITLE;
  return (
    `[R${fact.row}C${fact.col} source=${fact.cellId}] ` +
    `行标题: ${rowTitle} | 列标题: ${colTitle} | 数值: ${fact.value}`
  );
}

/**
 * 整份交接稿：每条事实一行，按行主序，用 LF 连接，末尾不加换行。
 * 空 facts 返回空字符串（不凭空产生一行）。
 */
export function formatSlotFacts(facts: SlotFact[]): string {
  return facts.map((fact) => formatSlotFact(fact)).join('\n');
}
````

### src/core/report.ts
SHA-256: 2f81faa0f01aaa1c8945d0d0aabc24ef9d4d9aa0f97aab587efdcea0dbfb5469
Bytes: 9630
Lines: 198

````ts
/**
 * P029 TableFork — 公共浏览器内核与结果 JSON (P029-T008)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §6.1（AnalyzeInput /
 * AnalyzeResult / CollisionProof 权威字段）、§6.2（公共浏览器内核
 * analyze(input, jobId): Promise<AnalyzeResult>，无 Node 专属调用）、§5.3
 * （Markdown 对账不是碰撞证明）、§5.2（碰撞证书）；IMPLEMENTATION_PLAN.md
 * §4.1（流程）、§4.2（JSON 与失败合同）、§6 的 P029-T008 卡。
 *
 * 流程（计划 §4.1）：解析 → 网格 → 标题（records.ts 内含）→ F（按
 * input.strategy 生成 canonicalMarkdown）→ 比较（input.suppliedMarkdown
 * 提供时调 compareMarkdown，未提供时 NOT_SUPPLIED）→ 见证（调
 * findWitness，其 proof 原样放入 proof）→ facts（调 records.ts）→
 * warnings。
 *
 * 失败语义（计划 §4.2）：无效输入抛 TableForkError（枚举错误码），
 * 绝不返回误导性的分析结果。parse/grid/findWitness 抛出的
 * TableForkInputError 原样传播（code 不变）；analyze 入口自身的
 * schema/strategy/类型校验同样抛 TableForkInputError（见 J-T008-2）。
 * 因此 AnalyzeResult.witness 的 'UNSUPPORTED' 在本层永不产出——
 * 不支持的输入在到达结果组装前已抛错（见 J-T008-1）。
 *
 * 浏览器安全：本文件不 import 'node:crypto'（§6.2 公共浏览器内核
 * 无 Node 专属调用）。witness.ts 的哈希在 P029-T009-FIX-01 中已换成
 * 纯 TypeScript 同步实现（src/core/sha256.ts，FIPS 180-4），本文件
 * 的复核直接调用同一共享函数；WebCrypto 助手 sha256Utf8WebCrypto
 * 保留为薄包装（仍导出，t008 测试 import 它），不再是复核路径。
 * T008 报告层原注明的“T013 挂载时须换哈希”已由本修复卡提前完成。
 *
 * 结果全部 JSON 可序列化：只含 string / number / boolean / 数组 /
 * 普通对象，无函数、无 undefined、无 Map。proof 不存在时字段整个
 * 省略（不写 `proof: undefined`），见 J-T008-3。
 */

import {
  INPUT_SCHEMA,
  REPORT_SCHEMA,
  SPEC_VERSION,
  isTableForkError,
  type AnalyzeInput,
  type AnalyzeResult,
  type Strategy,
} from './index';
import { compareMarkdown } from './compare';
import { flattenGrid } from './flatten';
import { buildGrid } from './grid';
import { parseValidatedTable, TableForkInputError } from './parse';
import { buildSlotFacts } from './records';
import { canonicalCellGraph, findWitness, sha256Utf8 } from './witness';
import { sha256Utf8 as sha256Sync } from './sha256';

/**
 * 浏览器安全的 SHA-256（hex 小写），对输入字符串的 UTF-8 字节算。
 *
 * P029-T009-FIX-01：本函数保留为薄包装——直接委托给共享同步实现
 * （src/core/sha256.ts，FIPS 180-4），不再走 WebCrypto。保留原因：
 * 它是已导出的公共助手，t008 临时测试 import 它；删除会断测试。
 * analyze() 内部的复核改用同步共享函数（见 analyze 内 J-T008-5 新注），
 * 与 witness 的 proof 用同一实现算出，不再需要异步的 WebCrypto 路径。
 * 同步签名不变；analyze() 保持 async 签名（公共 API）。
 */
export async function sha256Utf8WebCrypto(text: string): Promise<string> {
  return sha256Sync(text);
}

/** analyze 入口校验失败时抛 TableForkInputError（J-T008-2 的兜底桶口径）。 */
function failInput(message: string): never {
  throw new TableForkInputError('INVALID_RAGGED_GRID', `analyze: ${message}`);
}

/**
 * 公共浏览器内核（§6.2）：对一份输入出完整 tablefork.report/v1。
 *
 * P029-FIX-02（R1 P1-02，项目书 §9 优先）：签名改为 analyze(input, jobId)，
 * jobId 为必填第二参数，不得给空串默认值（fail-closed：非空字符串校验
 * 不通过时与无效输入同码抛错，不返回无 jobId 的结果）。结果携带三字段：
 * jobId（传入值原样）、inputHash（输入 HTML 原文的 SHA-256 十六进制，
 * 与 witness 的 proof 用同一同步实现 src/core/sha256.ts 算出）、
 * specVersion（SPEC_VERSION 常量，当前 '1.0.2'）。
 *
 * @param input schema 必须为 'tablefork.input/v1'，html 为字符串，
 *   strategy 为 'ORIGIN_EMPTY' | 'REPEAT_VALUE'，suppliedMarkdown
 *   如提供必须为字符串。
 * @param jobId 调用方传入的任务标识，非空字符串（Worker 传消息外层
 *   jobId；CLI 传 `cli-<fixture_id>`；测试传确定性 id）。
 * @returns 完整 AnalyzeResult；proof 仅在见证成立时存在（否则字段省略）。
 * @throws TableForkInputError 输入无效/不支持时抛枚举错误，不返回结果。
 * @throws Error 内部哈希复核不一致时抛普通 Error（实现不一致，不是输入问题）。
 */
export async function analyze(input: AnalyzeInput, jobId: string): Promise<AnalyzeResult> {
  if (typeof jobId !== 'string' || jobId === '') {
    failInput('jobId must be a non-empty string');
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    failInput('input must be an object with schema "tablefork.input/v1"');
  }
  if (input.schema !== INPUT_SCHEMA) {
    failInput(`schema must be "${INPUT_SCHEMA}", got ${JSON.stringify(input.schema)}`);
  }
  if (typeof input.html !== 'string') {
    failInput('html must be a string');
  }
  if (input.strategy !== 'ORIGIN_EMPTY' && input.strategy !== 'REPEAT_VALUE') {
    failInput(
      `strategy must be "ORIGIN_EMPTY" or "REPEAT_VALUE", got ${JSON.stringify(input.strategy)}`,
    );
  }
  if (input.suppliedMarkdown !== undefined && typeof input.suppliedMarkdown !== 'string') {
    failInput('suppliedMarkdown must be a string when provided');
  }
  const strategy: Strategy = input.strategy;

  // 解析 → 网格（非法/不支持在此抛 TableForkInputError，原样传播）。
  const parsed = parseValidatedTable(input.html);
  const grid = buildGrid(parsed);

  // F（按策略生成 canonicalMarkdown）。
  const canonicalMarkdown = flattenGrid(grid, strategy);

  // 比较：未提供 M 时 compareMarkdown 返回 NOT_SUPPLIED；
  // M 超 64 KiB 时它抛 OVER_SIZE（TableForkInputError），原样传播。
  const compare = compareMarkdown(input.suppliedMarkdown, canonicalMarkdown);

  // 见证：proof 原样放入结果；合法输入无候选时为 NO_WITNESS_FOUND。
  // findWitness 对非法输入会抛错，但上游 parse 已先行校验，到此不会再抛。
  const witnessResult = findWitness(input.html, strategy);

  // facts：逐槽记录（records.ts）。
  const facts = buildSlotFacts(grid);

  // 哈希复核（J-T008-5，P029-T009-FIX-01 改为共享同步实现）：
  // 用与 witness 同一的同步 SHA-256（src/core/sha256.ts）重算
  // canonicalMarkdown 与 A 图的哈希，与 witness 的 proof 逐字节核对。
  // 原 WebCrypto 异步复核已撤下：同一实现算两遍仍能捕获“proof 与
  // canonicalMarkdown / A 图不一致”的装配错误，且 analyze 不再依赖
  // crypto.subtle 在调用环境中存在；与 node:crypto / WebCrypto 的
  // 等价性由 tests/core/t009fix01-temp.test.ts 的已知向量钉死。
  // 无 proof 时（NO_WITNESS_FOUND）仍跳过复核（见原注）。
  if (witnessResult.proof !== undefined) {
    const markdownHash = sha256Sync(canonicalMarkdown);
    const aGraphHash = sha256Sync(canonicalCellGraph(grid));
    if (markdownHash !== witnessResult.proof.markdownSha256) {
      throw new Error(
        `analyze: internal hash mismatch: markdown SHA-256 ${markdownHash} ` +
          `!= witness markdownSha256 ${witnessResult.proof.markdownSha256}`,
      );
    }
    if (aGraphHash !== witnessResult.proof.aGraphSha256) {
      throw new Error(
        `analyze: internal hash mismatch: A-graph SHA-256 ${aGraphHash} ` +
          `!= witness aGraphSha256 ${witnessResult.proof.aGraphSha256}`,
      );
    }
  }

  // warnings：固定顺序、确定性文案；无触发条件时为空数组。
  const warnings: string[] = [];
  if (compare.status === 'EXACT_DIFF') {
    warnings.push(
      'M 与 F(A) 不一致（EXACT_DIFF）：碰撞证书只对 F(A) 生效，不适用于 M。',
    );
  }
  if (witnessResult.status === 'NO_WITNESS_FOUND') {
    warnings.push(
      '未找到单格拆分见证（NO_WITNESS_FOUND）：只表示在限定构造器里没找到，不表示表格保真。',
    );
  }
  const unknownCount = facts.filter((fact) => fact.headerStatus === 'UNKNOWN').length;
  if (unknownCount > 0) {
    warnings.push(
      `${unknownCount} 个数据槽的标题未知（headerStatus=UNKNOWN），交接稿中写 ?，不得据此宣称业务归属。`,
    );
  }

  // 组装：proof 不存在时字段整个省略（J-T008-3），不写 proof: undefined。
  // FIX-02：三字段齐全——jobId 由传入参数填入；inputHash 为输入 HTML
  // 原文的 SHA-256（与 witness 的 proof 同一同步实现）；specVersion
  // 为 SPEC_VERSION 常量。最终序列化的 JSON（UI 下载、CLI 输出、
  // Worker RESULT 的 data）由此三字段齐全（项目书 §9）。
  const result: AnalyzeResult = {
    schema: REPORT_SCHEMA,
    jobId,
    inputHash: sha256Sync(input.html),
    specVersion: SPEC_VERSION,
    compare: compare.status,
    witness: witnessResult.status,
    canonicalMarkdown,
    facts,
    warnings,
  };
  if (witnessResult.proof !== undefined) {
    result.proof = witnessResult.proof;
  }
  return result;
}

/** 供调用方复用的重导出：判定未知值是否为 TableForkError 形状。 */
export { isTableForkError, sha256Utf8 };
````

### src/core/sha256.ts
SHA-256: 697acf3a98415995479b6b50f2b30b016d3666f6b9c45448fb64bd3eeb70e9d9
Bytes: 5183
Lines: 132

````ts
/**
 * P029 TableFork — 纯 TypeScript 同步 SHA-256 (P029-T009-FIX-01)
 *
 * 来源与选择理由（详见 artifacts/logs/T009-FIX-01.txt §2）：
 * - 算法：FIPS 180-4 SHA-256，64 轮压缩函数，标准 K 常量与初始 H 值，
 *   按规范手写，无第三方依赖。
 * - 为什么不用 WebCrypto：witness.ts 的见证搜索是同步的，WebCrypto
 *   crypto.subtle.digest 是异步的，无法直接替换；本实现同步返回，
 *   与原 node:crypto 的 sha256Utf8 签名 `(text: string) => string`
 *   完全一致。
 * - 为什么不用 node:crypto：公共浏览器内核（项目书 §6.2）要求无 Node
 *   专属调用；`import { createHash } from 'node:crypto'` 使 vite build
 *   失败（`"createHash" is not exported by "__vite-browser-external"`），
 *   UI 与 T010 的 Worker 都撞同一堵墙。
 * - UTF-8 编码：TextEncoder（浏览器 / Node / Vitest 三处均有，与 Node
 *   'utf8' 编码一致：孤立代理项按 U+FFFD 计）。
 * - 本文件不 import 任何 Node 模块，不依赖 WebCrypto；浏览器 + Node +
 *   Vitest 三处都能跑。输出 hex 小写。
 */

/** SHA-256 轮常量 K[0..63]（FIPS 180-4 §4.2.2，前 64 个素数立方根小数部分的前 32 位）。 */
const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** SHA-256 初始哈希值 H0[0..7]（FIPS 180-4 §5.3.3，前 8 个素数平方根小数部分的前 32 位）。 */
const H0: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * SHA-256（hex 小写），对输入字符串的 UTF-8 字节算。
 * 与 Node `createHash('sha256').update(text, 'utf8').digest('hex')`
 * 及 WebCrypto `crypto.subtle.digest('SHA-256', …)` 逐字节一致
 * （同一算法同一输入必同值；已知向量与对照见 tests/core/t009fix01-temp.test.ts）。
 */
export function sha256Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;

  // 填充：0x80，0x00 至长度 ≡ 56 (mod 64)，末尾 8 字节大端 bit 长度。
  const paddedLen = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLenHi = Math.floor(bitLen / 0x100000000);
  const bitLenLo = bitLen >>> 0;
  padded[paddedLen - 8] = (bitLenHi >>> 24) & 0xff;
  padded[paddedLen - 7] = (bitLenHi >>> 16) & 0xff;
  padded[paddedLen - 6] = (bitLenHi >>> 8) & 0xff;
  padded[paddedLen - 5] = bitLenHi & 0xff;
  padded[paddedLen - 4] = (bitLenLo >>> 24) & 0xff;
  padded[paddedLen - 3] = (bitLenLo >>> 16) & 0xff;
  padded[paddedLen - 2] = (bitLenLo >>> 8) & 0xff;
  padded[paddedLen - 1] = bitLenLo & 0xff;

  const h = [...H0];
  const w = new Array<number>(64);

  for (let block = 0; block < paddedLen; block += 64) {
    for (let t = 0; t < 16; t++) {
      const i = block + t * 4;
      w[t] =
        ((padded[i] << 24) |
          (padded[i + 1] << 16) |
          (padded[i + 2] << 8) |
          padded[i + 3]) >>>
        0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let t = 0; t < 64; t++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + K[t] + w[t]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  let out = '';
  for (let i = 0; i < 8; i++) {
    out += (h[i] >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}
````

### src/core/types.ts
SHA-256: 4eba6f80b85a6d5e84627cb1cf361c090c5e3dc94f489391c0a1f219cbc5285c
Bytes: 5026
Lines: 148

````ts
/**
 * P029 TableFork — 冻结数据契约 (P029-T002)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §6.1（核心类型）、§5.5 / §4.2（错误枚举）、§3.1（输入上限）。
 * 本文件只含类型、常量与错误载体，不含任何网格/解析/序列化算法（那是 T003–T005 的活）。
 * 字段与 §6.1 一字不差；超出 §6.1 的补充（错误载体、schema 常量、输入上限常量、
 * 碰撞种类）均在 artifacts/logs/T002-contract.txt 中逐项登记为“补充”，不得悄悄改规格。
 *
 * 约定：
 * - 源格坐标从 0 开始；cellId 按原点行、原点列、DOM 序稳定排序（c00, c01, ...）。
 * - 标题路径为数组；缺失标题时对应路径为空数组，headerStatus 为 'UNKNOWN'，不得编造。
 * - 数值一律以 string 携带，绝不解析为 JS Number（避免 17 位 ID 精度损坏，见计划 §4.2）。
 */

export type Strategy = 'ORIGIN_EMPTY' | 'REPEAT_VALUE';

export type HeaderStatus = 'KNOWN' | 'UNKNOWN';

export type CompareStatus = 'EXACT_MATCH' | 'EXACT_DIFF' | 'NOT_SUPPLIED';

export type WitnessStatus = 'CERTIFIED_COLLISION' | 'NO_WITNESS_FOUND' | 'UNSUPPORTED';

export interface Cell {
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

export interface SlotFact {
  row: number;
  col: number;
  cellId: string;
  rowHeaders: string[];
  colHeaders: string[];
  headerStatus: HeaderStatus;
  value: string;
}

export interface AnalyzeInput {
  schema: 'tablefork.input/v1';
  html: string;
  suppliedMarkdown?: string;
  strategy: Strategy;
}

export interface CollisionProof {
  sourceCellId: string;
  alternativeHtml: string;
  aGraphSha256: string;
  bGraphSha256: string;
  markdownSha256: string;
  splitCost: number;
  headerAssociationChanged: boolean;
}

export interface AnalyzeResult {
  schema: 'tablefork.report/v1';
  jobId: string;
  inputHash: string;
  specVersion: string;
  compare: CompareStatus;
  witness: WitnessStatus;
  canonicalMarkdown: string;
  facts: SlotFact[];
  proof?: CollisionProof;
  warnings: string[];
}

/**
 * 冻结 schema 字面量（项目书 §6.2 / 计划 §4.2）。
 * AnalyzeInput.schema 必须是 'tablefork.input/v1'，报告必须是 'tablefork.report/v1'；
 * 未来不兼容更改必须提高 major。
 */
export const INPUT_SCHEMA = 'tablefork.input/v1' as const;
export const REPORT_SCHEMA = 'tablefork.report/v1' as const;

/** 冻结规格版本（项目书封面 SPEC_VERSION 1.0.2；报告携带 specVersion，见项目书 §9）。 */
export const SPEC_VERSION = '1.0.2' as const;

/**
 * 冻结输入上限（项目书 §3.1）。数值单位：字节为 UTF-8 字节数。
 * 超出上限的输入直接显式拒绝（OVER_SIZE / INVALID_SPAN），不进入二次修复或猜测分支。
 */
export const MAX_INPUT_BYTES = 64 * 1024;
export const MAX_ROWS = 32;
export const MAX_COLS = 12;
export const MAX_DOM_CELLS = 128;
export const MAX_SPAN = 8;

/**
 * API / Worker 错误码枚举（项目书 §5.5、§4.2、计划 §4.2）。
 * 全部 7 个，缺一不可；对无效表只报枚举错误，不返回误导性的分析结果。
 */
export type ErrorCode =
  | 'INVALID_SPAN'
  | 'INVALID_GRID_OVERLAP'
  | 'INVALID_RAGGED_GRID'
  | 'OVER_SIZE'
  | 'UNSUPPORTED_NESTED_TABLE'
  | 'UNSUPPORTED_HEADER_SEMANTICS'
  | 'CANCELLED';

/** 全部 7 个错误码的只读清单（供穷尽检查与测试枚举；顺序与 ErrorCode 定义一致）。 */
export const ERROR_CODES: readonly ErrorCode[] = [
  'INVALID_SPAN',
  'INVALID_GRID_OVERLAP',
  'INVALID_RAGGED_GRID',
  'OVER_SIZE',
  'UNSUPPORTED_NESTED_TABLE',
  'UNSUPPORTED_HEADER_SEMANTICS',
  'CANCELLED',
] as const;

/**
 * 结构化错误载体（补充，§6.1 未定义；仅为“报枚举错误”提供统一形状）。
 * 实现层（parse/grid/worker）抛错或回 ERROR 消息时使用此形状：
 * code 必须是 ErrorCode 之一，message 为人类可读说明（含行列定位时写明坐标）。
 */
export interface TableForkError {
  code: ErrorCode;
  message: string;
}

/** 判定一个未知值是否为 TableForkError 形状（code 在枚举内且 message 为字符串）。 */
export function isTableForkError(value: unknown): value is TableForkError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { code?: unknown; message?: unknown };
  return (
    typeof candidate.message === 'string' &&
    typeof candidate.code === 'string' &&
    (ERROR_CODES as readonly string[]).includes(candidate.code)
  );
}

/**
 * 碰撞种类标签（补充；项目书 §5.2 / §4.2 的两行断言标签）。
 * 仅当 proof.headerAssociationChanged 为 true 时取 'HEADER_ASSOCIATION_CHANGED'，
 * 否则只说 'STRUCTURAL_COLLISION'；标题未知时不得推测“改变”。
 */
export type CollisionKind = 'HEADER_ASSOCIATION_CHANGED' | 'STRUCTURAL_COLLISION';
````

### src/core/witness.ts
SHA-256: 57bc4e9a2e183caf7b06650ddc5d8030cc30117907815ac5163d2fd7a1a0a6e9
Bytes: 17982
Lines: 401

````ts
/**
 * P029 TableFork — 单格拆分与反事实碰撞证明 (P029-T005)
 *
 * 唯一权威：docs/PROJECT_BOOK.md v1.0.2 §5.2（碰撞证书与“最短”定义）、
 * §5.1（两种 F 策略）、§6.3（§6.3 例：把 `colspan=2` 拆成两个 th 的 B）、
 * §3.2–§3.3（网格/标题）；IMPLEMENTATION_PLAN.md §4.1（流程与“待统一的
 * 选择顺序”：标题路径改变优先 → extra_slots 递增 → 原点 row,col,id 字典序）、
 * §6 的 P029-T005 卡、§7.1（Golden 分组 G09–G32）。
 *
 * 本模块只做见证构造与验证，不改任何上游文件：parse/grid/headers/flatten
 * 一律只 import 不修改；`src/core/index.ts` 的挂载由 T013 集成时一次性处理，
 * 本卡的模块先由测试直接 import 相对路径。
 *
 * 算法（冻结顺序，§5.2 + 计划 §4.1）：
 * 1. 解析 A（parseValidatedTable + buildGrid），算 F_p(A) 与 A 的 canonical
 *    cell graph；无效输入直接抛 TableForkInputError（见 J-T005-3）。
 * 2. 枚举全部合并格（h×w > 1）为候选，按 (extra_slots = h×w − 1 递增，
 *    原点 row、原点 col、cellId 字典序）排序。
 * 3. 对每个候选构造 B = split(A)：其他 DOM 单元格原样；源格覆盖的每个槽位
 *    改为独立 1×1 单格，原点复制原文，延续槽位按策略填空（ORIGIN_EMPTY）
 *    或填同文（REPEAT_VALUE），保留原格的 role/scope/section（见 J-T005-2）。
 *    B 的 HTML 用 T003 的 parse + grid 重新解析验证合法；非法即跳过该候选。
 * 4. 逐字节比较 F_p(A) == F_p(B)（UTF-8 字节相等，含 J-T004-1 的末尾 LF
 *    口径）；比较 canonical cell graph 是否不同。两者同时成立才算该候选成功。
 * 5. 在成功候选中优先选使已声明标题路径改变者（同组内仍按第 2 步的顺序）；
 *    若无标题路径变化者，再按同一顺序选结构碰撞候选。全部失败则返回
 *    NO_WITNESS_FOUND——“未找到见证”绝不写成“无歧义”或“保真”。
 *
 * 哈希口径（CollisionProof 的三个 SHA-256，均为 hex 小写）：
 * - aGraphSha256：对 canonicalCellGraph(gridA) 的 UTF-8 字节算 SHA-256。
 * - bGraphSha256：对 canonicalCellGraph(gridB) 的 UTF-8 字节算 SHA-256，
 *   其中 gridB 是把 alternativeHtml 用 T003 的 parse + grid 独立重算得到的。
 * - markdownSha256：对 F_p(A) 输出字符串的 UTF-8 字节算 SHA-256；证书成立
 *   时 F_p(B) 的 UTF-8 字节与之一致（已逐字节比对过），故同一哈希同时标识
 *   两份 Markdown。
 *
 * 显式裁决（冻结规格未钉死的点，记录在案，供 T011 / 终审复核）：
 * J-T005-1（拆分按策略参数化）：§5.2 写明“延续槽位在 ORIGIN_EMPTY 中填空、
 *   在 REPEAT_VALUE 中填同文”，故 split 是按策略参数化的构造：同一张 B
 *   一般不可能同时在两种策略下碰撞（除非源格文本为空——ORIGIN_EMPTY 要求
 *   延续格为空，REPEAT_VALUE 要求延续格为原文）。因此 findWitness(html,
 *   strategy) 一次只对一种策略出证；两种策略都碰撞是指两次调用各自出证，
 *   各自的 B 不同。§6.3 项目书示例的 B（第二格为空 th）即 ORIGIN_EMPTY
 *   的构造；REPEAT_VALUE 的 B 是第二格填同文的另一张表。
 * J-T005-2（拆分格保留 role/scope/section）：只把 span 改为 1×1、按策略填
 *   文本；不改动单元格种类与所属节（§5.2“保留原点所属 rowgroup”）。直接
 *   后果：就 colspan 拆分这一候选而言，REPEAT_VALUE 下被重复的文本会恢复
 *   同样的已声明标题路径（按 §3.3 标题路径是文本数组，不是单元格身份），
 *   故 §6.3 例的 colspan 格与 TFK-B 在 REPEAT_VALUE 下只构成
 *   STRUCTURAL_COLLISION；但按冻结选择顺序，§6.3 例在 REPEAT_VALUE 下
 *   实际选中的是 rowspan 格（见 J-T005-7），其证书仍为
 *   HEADER_ASSOCIATION_CHANGED。这是按规格如实区分两种证书，不是对
 *   REPEAT_VALUE 的“标题未变”作任何语义外推。
 * J-T005-3（无效输入抛错，不返回 NO_WITNESS_FOUND）：与 parse/grid 一致，
 *   非法/不支持的输入抛 TableForkInputError（code 为冻结枚举之一）；
 *   NO_WITNESS_FOUND 只用于合法输入且无候选成功。AnalyzeResult.witness
 *   的 'UNSUPPORTED' 由 T008 报告层把这里抛出的错误映射过去，本模块不吞错。
 * J-T005-4（canonical cell graph 的内容）：JSON（固定键序、无空白）：
 *   { rows, cols, cells, slotOwner }；cells 为 grid.cells 全字段
 *   （id/row/col/rowSpan/colSpan/role/scope/text/section），已按
 *   (原点行, 原点列, DOM 序) 排好；slotOwner 为 grid 的每槽归属 cellId。
 *   graph 含文本：拆分改变了“哪些槽位属于哪个格、格的 span 与文本分布”，
 *   文本分布是结构身份的一部分；只比 span 会漏掉 ORIGIN_EMPTY 与
 *   REPEAT_VALUE 下延续格文本的不同。
 * J-T005-5（标题路径比较的口径）：按 §3.3 用 buildHeaderPaths 分别算 A/B
 *   每槽的 rowHeaders/colHeaders 文本数组，逐槽比对；任一槽位任一路径不同
 *   即 headerAssociationChanged = true。标题未知（路径为空）时不推测“改变”：
 *   两边都空即相同，不算改变。
 * J-T005-6（B 非法的一种真实情形）：A 合法但 DOM 单元格已达 128 上限时，
 *   拆分会使 B 的 DOM 单元格数超过 128，parse 按 OVER_SIZE 拒绝 B，该候选
 *   被跳过；若全部候选都因此失败，返回 NO_WITNESS_FOUND 并在 reason 中写明。
 * J-T005-7（§6.3 例在 REPEAT_VALUE 下选中 rowspan 格，不是 colspan 格）：
 *   ORIGIN_EMPTY 下选 colspan 格 c01（项目书 §6.3 的原话，B 的第二格为空 th）。
 *   REPEAT_VALUE 下：colspan 格的拆分不改变标题路径（延续格填同文后 col2
 *   路径仍是 ['2026预算','成本']，故只是 STRUCTURAL_COLLISION）；而 rowspan
 *   格“产品”的拆分会让 col0 路径从 ['产品'] 变成 ['产品','产品']——§3.3
 *   的去重只按 cellId，不按文本，两个不同格的相同文本都会进路径——故它
 *   同样是标题路径改变者，且 (代价 1, 行 0, 列 0) 排在 colspan 格
 *   (代价 1, 行 0, 列 1) 之前，按冻结选择顺序必须选中 rowspan 格。这是
 *   冻结的 headers.ts 与冻结的选择顺序共同决定的结果，不是实现自由裁量；
 *   两种策略都出证、都带 HEADER_ASSOCIATION_CHANGED，只是选中的源格不同。
 */

import { sha256Utf8 } from './sha256';
import type {
  Cell,
  CollisionKind,
  CollisionProof,
  Strategy,
  WitnessStatus,
} from './index';
import { flattenGrid } from './flatten';
import type { GridResult } from './grid';
import { buildGrid } from './grid';
import { buildHeaderPaths } from './headers';
import { parseValidatedTable, type ParsedTable } from './parse';

/** findWitness 的返回：证书成立时带 proof 与 kind，否则只带 reason。 */
export interface WitnessResult {
  status: WitnessStatus;
  /** CERTIFIED_COLLISION 时的证书（T002 冻结的 CollisionProof）；否则 undefined。 */
  proof?: CollisionProof;
  /** CERTIFIED_COLLISION 时的种类标签；否则 undefined。 */
  kind?: CollisionKind;
  /** NO_WITNESS_FOUND 时的理由（“无合并格”或“全部候选失败及首因”）；否则 undefined。 */
  reason?: string;
  /** 本次评估过的合并格候选数。 */
  candidatesTried: number;
  /** 本次通过全部检查（合法 + graph 不同 + F 字节相等）的候选数。 */
  candidatesCertified: number;
}

/**
 * SHA-256（hex 小写），对输入字符串的 UTF-8 字节算。
 * 纯 TypeScript 同步实现（./sha256，FIPS 180-4），与 Node 的 'utf8'
 * 编码一致（孤立代理项按 U+FFFD 计，与 TextEncoder 相同）。
 * P029-T009-FIX-01：原 node:crypto 的 createHash 已换成浏览器安全实现；
 * 见证搜索逻辑一字未动。
 */
export { sha256Utf8 } from './sha256';

/** 严格的 UTF-8 字节相等（不用 JS 字符串 ==，以免孤立代理项等边界口径分歧）。 */
export function utf8BytesEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  return ea.every((value, i) => value === eb[i]);
}

/**
 * 拆分代价 extra_slots = h×w − 1（§5.2 / 计划 §4.1 的“最小拆分代价”）。
 * 1×1 格代价为 0，但 1×1 格永远不是候选（见 findWitness 的过滤）。
 */
export function splitCost(cell: Cell): number {
  return cell.rowSpan * cell.colSpan - 1;
}

/**
 * canonical cell graph（J-T005-4）：固定键序、无空白的 JSON 字符串。
 * { rows, cols, cells: 全字段, slotOwner }。同一网格两次调用逐字节相同；
 * 不同网格（span、归属、文本分布任一不同）即字符串不同。
 */
export function canonicalCellGraph(grid: GridResult): string {
  const cells = grid.cells.map((cell) => ({
    id: cell.id,
    row: cell.row,
    col: cell.col,
    rowSpan: cell.rowSpan,
    colSpan: cell.colSpan,
    role: cell.role,
    scope: cell.scope,
    text: cell.text,
    section: cell.section,
  }));
  return JSON.stringify({
    rows: grid.rows,
    cols: grid.cols,
    cells,
    slotOwner: grid.slotOwner,
  });
}

/**
 * 标题路径是否改变（J-T005-5）：按 §3.3 分别算 A/B 每槽的
 * rowHeaders/colHeaders 文本数组，逐槽比对；任一不同即 true。
 * 两边路径都空（标题未知）即相同，不算改变。
 */
export function headerPathsChanged(gridA: GridResult, gridB: GridResult): boolean {
  if (gridA.rows !== gridB.rows || gridA.cols !== gridB.cols) {
    // 拆分保持行列数不变；维度不同本身就是结构变化，标题路径无法对齐比较。
    return true;
  }
  const pathsA = buildHeaderPaths(gridA);
  const pathsB = buildHeaderPaths(gridB);
  for (let r = 0; r < gridA.rows; r++) {
    for (let x = 0; x < gridA.cols; x++) {
      const a = pathsA[r][x];
      const b = pathsB[r][x];
      if (
        JSON.stringify(a.rowHeaders) !== JSON.stringify(b.rowHeaders) ||
        JSON.stringify(a.colHeaders) !== JSON.stringify(b.colHeaders)
      ) {
        return true;
      }
    }
  }
  return false;
}

/** 由 headerAssociationChanged 取 CollisionKind 标签（T002 冻结的两种标签）。 */
export function collisionKindOf(headerAssociationChanged: boolean): CollisionKind {
  return headerAssociationChanged ? 'HEADER_ASSOCIATION_CHANGED' : 'STRUCTURAL_COLLISION';
}

/** HTML 文本转义（重建 B 的 HTML 时用）：只转义 &、<、> 三项。 */
function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface SplitPiece {
  row: number;
  col: number;
  role: 'TH' | 'TD';
  scope: 'row' | 'col' | null;
  text: string;
}

/**
 * 重建替代 HTML B（§5.2 的 split_s(A)；J-T005-1 / J-T005-2）：
 * - 行数、列数、节划分与 A 相同；每行都输出一个 <tr>（即使该行在 B 中
 *   没有原点格——全被上方 rowspan 覆盖的行仍需 <tr></tr> 占位，否则行数会变）。
 * - 源格覆盖的每个槽位改为独立 1×1 单格：原点复制原文，延续槽位按策略
 *   填空（ORIGIN_EMPTY）或填同文（REPEAT_VALUE）；role/scope/section 保留。
 * - 其余单元格原样（span 与 scope 保留），同行内按列从左至右输出，
 *   以保证重解析时原点列的“第一个未占用列”口径与 A 一致。
 * - caption 若存在则保留在 <table> 之后（parse 只认一个直接子 caption）。
 * 本函数是纯函数；返回的 HTML 是否合法由调用方用 parse + grid 重验。
 */
export function buildAlternativeHtml(
  parsed: ParsedTable,
  grid: GridResult,
  source: Cell,
  strategy: Strategy,
): string {
  const pieces: SplitPiece[] = [];
  for (let dr = 0; dr < source.rowSpan; dr++) {
    for (let dc = 0; dc < source.colSpan; dc++) {
      pieces.push({
        row: source.row + dr,
        col: source.col + dc,
        role: source.role,
        scope: source.scope,
        text:
          dr === 0 && dc === 0
            ? source.text
            : strategy === 'ORIGIN_EMPTY'
              ? ''
              : source.text,
      });
    }
  }

  const emitCell = (
    role: 'TH' | 'TD',
    scope: 'row' | 'col' | null,
    rowSpan: number,
    colSpan: number,
    text: string,
  ): string => {
    const tag = role === 'TH' ? 'th' : 'td';
    const spanAttrs =
      (rowSpan > 1 ? ` rowspan="${rowSpan}"` : '') +
      (colSpan > 1 ? ` colspan="${colSpan}"` : '');
    const scopeAttr = scope === null ? '' : ` scope="${scope}"`;
    return `<${tag}${spanAttrs}${scopeAttr}>${escapeHtmlText(text)}</${tag}>`;
  };

  let out = '<table>';
  if (parsed.captionText !== null) {
    out += `<caption>${escapeHtmlText(parsed.captionText)}</caption>`;
  }
  let openSection: 'thead' | 'tbody' | null = null;
  for (let r = 0; r < grid.rows; r++) {
    const section = parsed.rows[r].section;
    if (section !== openSection) {
      if (openSection !== null) out += `</${openSection}>`;
      out += `<${section}>`;
      openSection = section;
    }
    // 本行原点格（不含源格）+ 落在本行的拆分片，按列排序后输出。
    const rowCells = grid.cells
      .filter((cell) => cell.row === r && cell.id !== source.id)
      .map((cell) => ({
        col: cell.col,
        html: emitCell(cell.role, cell.scope, cell.rowSpan, cell.colSpan, cell.text),
      }));
    const rowPieces = pieces
      .filter((piece) => piece.row === r)
      .map((piece) => ({
        col: piece.col,
        html: emitCell(piece.role, piece.scope, 1, 1, piece.text),
      }));
    const ordered = [...rowCells, ...rowPieces].sort((a, b) => a.col - b.col);
    out += '<tr>';
    for (const item of ordered) out += item.html;
    out += '</tr>';
  }
  if (openSection !== null) out += `</${openSection}>`;
  out += '</table>';
  return out;
}

/** 候选排序（冻结选择顺序，§5.2 / 计划 §4.1）：代价 → 行 → 列 → id。 */
function compareCandidates(a: Cell, b: Cell): number {
  return (
    splitCost(a) - splitCost(b) ||
    a.row - b.row ||
    a.col - b.col ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

interface EvaluatedCandidate {
  cell: Cell;
  alternativeHtml: string;
  gridB: GridResult;
  headerChanged: boolean;
}

/**
 * 按冻结选择顺序构造并验证单格拆分见证（§5.2 / 计划 §4.1）。
 *
 * @param html 原表 A 的 HTML（单个顶层 <table>，限定子集）。
 * @param strategy 本次出证所针对的 F 策略（J-T005-1：拆分按策略参数化）。
 * @returns CERTIFIED_COLLISION + proof/kind，或 NO_WITNESS_FOUND + reason。
 * @throws TableForkInputError 输入非法/不支持时直接抛错（J-T005-3），
 *   不把“输入无效”写成 NO_WITNESS_FOUND。
 */
export function findWitness(html: string, strategy: Strategy): WitnessResult {
  const parsedA = parseValidatedTable(html);
  const gridA = buildGrid(parsedA);
  const markdownA = flattenGrid(gridA, strategy);
  const aGraph = canonicalCellGraph(gridA);
  const aGraphSha256 = sha256Utf8(aGraph);
  const markdownSha256 = sha256Utf8(markdownA);

  const candidates = gridA.cells
    .filter((cell) => cell.rowSpan * cell.colSpan > 1)
    .sort(compareCandidates);

  const successes: EvaluatedCandidate[] = [];
  const failures: string[] = [];
  for (const cell of candidates) {
    const alternativeHtml = buildAlternativeHtml(parsedA, gridA, cell, strategy);
    let gridB: GridResult;
    try {
      gridB = buildGrid(parseValidatedTable(alternativeHtml));
    } catch (err) {
      // B 非法即跳过该候选（J-T005-6 如 DOM 格数超 128 的 OVER_SIZE）。
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${cell.id}: B rejected on re-parse/re-grid (${message})`);
      continue;
    }
    const markdownB = flattenGrid(gridB, strategy);
    if (!utf8BytesEqual(markdownA, markdownB)) {
      failures.push(`${cell.id}: F(B) differs from F(A) byte-for-byte`);
      continue;
    }
    const bGraph = canonicalCellGraph(gridB);
    if (bGraph === aGraph) {
      failures.push(`${cell.id}: canonical cell graph identical to A`);
      continue;
    }
    successes.push({
      cell,
      alternativeHtml,
      gridB,
      headerChanged: headerPathsChanged(gridA, gridB),
    });
  }

  if (successes.length === 0) {
    if (candidates.length === 0) {
      return {
        status: 'NO_WITNESS_FOUND',
        reason:
          'no merged cells in the table (all cells are 1x1); no single-split candidate exists',
        candidatesTried: 0,
        candidatesCertified: 0,
      };
    }
    return {
      status: 'NO_WITNESS_FOUND',
      reason:
        `all ${candidates.length} candidate(s) failed: ` +
        failures.join('; '),
      candidatesTried: candidates.length,
      candidatesCertified: 0,
    };
  }

  // 标题路径改变者优先；同组内仍按 (代价, 行, 列, id) 顺序（successes 已排好）。
  const headerChanged = successes.filter((item) => item.headerChanged);
  const picked = (headerChanged.length > 0 ? headerChanged : successes)[0];
  const proof: CollisionProof = {
    sourceCellId: picked.cell.id,
    alternativeHtml: picked.alternativeHtml,
    aGraphSha256,
    bGraphSha256: sha256Utf8(canonicalCellGraph(picked.gridB)),
    markdownSha256,
    splitCost: splitCost(picked.cell),
    headerAssociationChanged: picked.headerChanged,
  };
  return {
    status: 'CERTIFIED_COLLISION',
    proof,
    kind: collisionKindOf(picked.headerChanged),
    candidatesTried: candidates.length,
    candidatesCertified: successes.length,
  };
}
````

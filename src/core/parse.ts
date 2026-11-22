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

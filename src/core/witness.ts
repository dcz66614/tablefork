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

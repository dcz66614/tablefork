/**
 * P029-T011 property generator — deterministic seeded random tables.
 *
 * Seeds are fixed: 0..199 (see SEEDS). The same seed always yields the same
 * table: the PRNG is mulberry32(seed), no Date / Math.random / I/O anywhere.
 *
 * Generator rules (frozen subset only — PROJECT_BOOK.md v1.0.2 §3.1):
 * - single top-level <table>, optional <caption>, optional single <thead>,
 *   optional single <tbody> (thead-only tables occur); no nested tables.
 * - 1..8 rows, 1..8 cols (well inside the 32x12 / 128-cell / 64 KiB limits);
 *   rowspan/colspan 1..3, never crossing the thead/tbody boundary.
 * - roles: thead cells are th (usually) or td; tbody cells are td, or th
 *   with scope=row, or th without scope. scope=col only in thead.
 *   Never scope=rowgroup/colgroup, never headers=, never unknown attributes
 *   (unknown attributes are the known open O1 divergence, T006 §9 — out of
 *   the agreed-legal subset, probed separately in the T011 log §8, not part
 *   of the 200-seed mix).
 * - cell texts mix, by weight: plain CJK / ASCII words, number-like strings
 *   ("007", 17-digit strings, "1e5"), empty strings, "|" and backslash
 *   combinations, HTML entities ("&amp;", "&lt;", "&#65;&#x42;", "&foo;",
 *   "&amp" without ";", "&nbsp;"), whitespace runs / newlines / tabs,
 *   emoji / full-width forms, quotes, Markdown metacharacters.
 * - attribute order (rowspan/colspan/scope) varies; attribute values are
 *   double-quoted. Tags are emitted adjacently (no inter-tag whitespace).
 */
export interface GeneratedTable {
  seed: number;
  html: string;
  rows: number;
  cols: number;
  domCells: number;
}

/** The fixed seed list for this card: 0..199 inclusive. */
export const SEEDS: number[] = Array.from({ length: 200 }, (_, i) => i);

/** mulberry32 — small deterministic PRNG, seeded per table. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEXT_POOL: string[] = [
  // plain words (CJK / ASCII)
  '苹果', '香蕉', '预算', '收入', '成本', '部门', '项目', '甲', '乙', '丙',
  'Alpha', 'Beta', 'total', 'value', '2026', 'Q1',
  // number-like strings (must stay strings, never parsed as Number)
  '007', '12345678901234567', '1e5', '0', '3.14', '120',
  // empty / whitespace
  '', '  ', '  多   空\n格\t表  ', '\n前后\n', '  x  ', 'a  b',
  // pipe / backslash (escape order matters, spec §5.1)
  'a|b', 'c\\d', 'e\\|f', '||', '\\', 'x|y|z',
  // entities (decoded on extraction; unknown / unterminated stay literal)
  '&amp;', '&lt;', '&quot;', '&#65;&#x42;', '&foo;', '&amp', '&nbsp;', 'A & B',
  // emoji / full-width / quotes / markdown metacharacters
  '😀笑', '全角ＡＢ', '"引"', "it's \"q\"", '*粗* `码` #题', '数学 & 物理',
  // longer mixed text
  '2026预算 > 收入：120', '研发-一期/二期', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
];

const HEADER_WORDS = ['名称', '数量', '科目', '年份', '组一', '组二', '全年', '产品', '部门', '数值'];

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pickText(rand: () => number): string {
  const r = rand();
  if (r < 0.12) return pick(rand, HEADER_WORDS);
  return pick(rand, TEXT_POOL);
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface PlacedCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  role: 'TH' | 'TD';
  scope: 'row' | 'col' | null;
  text: string;
  section: 'thead' | 'tbody';
}

/**
 * Build one legal table for `seed`. Placement follows first-free-column
 * order per row; every free slot gets a cell, so the grid is always fully
 * covered 0..cols-1 with no overlap and no ragged row.
 */
export function generateTable(seed: number): GeneratedTable {
  const rand = mulberry32(seed);
  const large = seed % 25 === 0;
  const headRows = large ? 2 : Math.floor(rand() * 3); // 0..2 thead rows
  const bodyRows = large ? 5 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 5);
  const cols = large ? 6 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 6);
  const theadOnly = !large && rand() < 0.05 && headRows > 0;
  const totalRows = headRows + (theadOnly ? 0 : bodyRows);
  const withCaption = rand() < 0.1;

  // occupancy per section: occupied[section][r][x]
  const occupied: boolean[][][] = [];
  const cells: PlacedCell[] = [];
  const sections: { name: 'thead' | 'tbody'; rows: number }[] = [];
  if (headRows > 0) sections.push({ name: 'thead', rows: headRows });
  if (!theadOnly) sections.push({ name: 'tbody', rows: bodyRows });

  let rowBase = 0;
  for (const section of sections) {
    const occ: boolean[][] = Array.from({ length: section.rows }, () =>
      Array.from({ length: cols }, () => false),
    );
    occupied.push(occ);
    for (let r = 0; r < section.rows; r++) {
      for (let x = 0; x < cols; x++) {
        if (occ[r][x]) continue;
        const maxH = Math.min(3, section.rows - r);
        const maxW = Math.min(3, cols - x);
        let h = 1;
        let w = 1;
        if (rand() < 0.45) {
          h = 1 + Math.floor(rand() * maxH);
          w = 1 + Math.floor(rand() * maxW);
        }
        // The chosen rectangle must be ENTIRELY free: an earlier rowspan
        // from a previous row may already occupy slots inside it (the
        // origin slot alone being free is not enough). Shrink w, then h,
        // until the rectangle is free; 1x1 always works (origin is free).
        const rectFree = (hh: number, ww: number): boolean => {
          for (let dr = 0; dr < hh; dr++) {
            for (let dx = 0; dx < ww; dx++) {
              if (occ[r + dr][x + dx]) return false;
            }
          }
          return true;
        };
        while (w > 1 && !rectFree(h, w)) w--;
        while (h > 1 && !rectFree(h, w)) h--;
        for (let dr = 0; dr < h; dr++) {
          for (let dx = 0; dx < w; dx++) occ[r + dr][x + dx] = true;
        }
        let role: 'TH' | 'TD';
        let scope: 'row' | 'col' | null = null;
        if (section.name === 'thead') {
          role = rand() < 0.85 ? 'TH' : 'TD';
          if (role === 'TH' && rand() < 0.2) scope = 'col';
        } else {
          const t = rand();
          if (t < 0.78) role = 'TD';
          else {
            role = 'TH';
            scope = rand() < 0.85 ? 'row' : null;
          }
        }
        cells.push({
          row: rowBase + r,
          col: x,
          rowSpan: h,
          colSpan: w,
          role,
          scope,
          text: pickText(rand),
        } as PlacedCell);
        // section tag is filled in below (cells are built per section)
        cells[cells.length - 1].section = section.name;
      }
    }
    rowBase += section.rows;
  }

  // Serialise: rows in order, cells per row in DOM (column) order; attribute
  // order varies (rowspan/colspan/scope shuffled deterministically).
  const rowsHtml: string[] = [];
  for (let r = 0; r < totalRows; r++) {
    const rowCells = cells.filter((c) => c.row === r);
    let rowHtml = '<tr>';
    for (const c of rowCells) {
      const tag = c.role === 'TH' ? 'th' : 'td';
      const attrs: string[] = [];
      if (c.rowSpan > 1) attrs.push(`rowspan="${c.rowSpan}"`);
      if (c.colSpan > 1) attrs.push(`colspan="${c.colSpan}"`);
      if (c.scope !== null) attrs.push(`scope="${c.scope}"`);
      if (rand() < 0.5) attrs.reverse();
      rowHtml += `<${tag}${attrs.length > 0 ? ' ' + attrs.join(' ') : ''}>${escapeHtmlText(c.text)}</${tag}>`;
    }
    rowHtml += '</tr>';
    rowsHtml.push(rowHtml);
  }
  let html = '<table>';
  if (withCaption) html += `<caption>${escapeHtmlText(pick(rand, TEXT_POOL))}</caption>`;
  let idx = 0;
  for (const section of sections) {
    html += `<${section.name}>`;
    for (let i = 0; i < section.rows; i++) html += rowsHtml[idx++];
    html += `</${section.name}>`;
  }
  html += '</table>';
  return { seed, html, rows: totalRows, cols, domCells: cells.length };
}

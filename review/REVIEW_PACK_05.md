# REVIEW_PACK_05 — 独立 Oracle、配置与发布脚本

> P029 TableFork 终审源码分卷（规格 v1.0.2）。本卷全文展开以下 7 个文件，
> 不省略、不摘要。每块格式：`### <路径>` + `SHA-256` / `Bytes` / `Lines` +
> ```` 围栏内完整原文（与 `review/RELEASE_MANIFEST.json` 中该文件的 SHA-256 一致）。
> 生成：P029-REFREEZE-NOTES-FIX2（`npm run verify:release` 核对每卷每块）。

### index.html
SHA-256: 4f212f779132493cd11329b2514fedc359922f072e4ac0f8154403fc7ba627da
Bytes: 309
Lines: 12

````html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>表歧镜 TableFork</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
````

### oracle/reference.py
SHA-256: bd135b32ecb3155a02cb5e441e8d6cc8a51d81fcfc55c2f55931a628c76f1992
Bytes: 47742
Lines: 1125

````python
#!/usr/bin/env python3
"""P029 TableFork -- independent Python Oracle (P029-T006).

Written from scratch in this session from the frozen written spec only:
  docs/PROJECT_BOOK.md v1.0.2 (sections 3, 5, 6, 7) and
  docs/IMPLEMENTATION_PLAN.md v1.0.2 (sections 4.1-4.3, 6/P029-T006, 9.1),
  plus the frozen contract types in src/core/types.ts (field shapes only)
  and the frozen judgement calls recorded in
  artifacts/logs/T003-grid.txt section 7 (J1-J8),
  artifacts/logs/T004-flatten.txt section 7 (J-T004-1..5) and
  artifacts/logs/T005-witness.txt sections 7 and 9 (hash semantics, J-T005-1..7).

INDEPENDENCE: this file was written without reading any TS implementation
(src/core/parse.ts, grid.ts, headers.ts, flatten.ts, witness.ts), without
reading any test file (tests/core/*.test.ts), and without copying any
expected output from T003/T004/T005. It uses only the Python 3.12 standard
library, never invokes Node/TS, and never reads src/.

What it implements (per the written contract):
  * limited HTML subset parsing: a single top-level <table>, tags limited to
    table/thead/tbody/tr/th/td/caption; first-free-column placement;
    rowspan/colspan 1-8; no cross-section spans; overlap / ragged rejection.
  * header paths: only thead th as column headers and tbody th scope=row
    as row headers; missing headers are UNKNOWN, never invented.
  * two flatten strategies ORIGIN_EMPTY / REPEAT_VALUE (escape backslash
    first, then pipe; LF line ends; output ends with a single LF).
  * single-cell split witness search with the frozen selection order
    (header-changing first, then extra_slots ascending, then origin
    row, col, id); B is re-serialised to HTML and re-parsed to verify.
  * the 7 error codes: INVALID_SPAN, INVALID_GRID_OVERLAP,
    INVALID_RAGGED_GRID, OVER_SIZE, UNSUPPORTED_NESTED_TABLE,
    UNSUPPORTED_HEADER_SEMANTICS, CANCELLED.

CLI:
  python3 oracle/reference.py --fixtures <dir> --expected oracle/golden_expected.json
Reads fixture JSON files ({fixture_id, schema: "tablefork.fixture/v1",
input: {schema: "tablefork.input/v1", html, strategy}, expected_ref}),
computes the full analysis for every fixture, compares it field by field
against the hand-computed expectations in the expected file, prints
PASS/FAIL per case, and exits non-zero if any case disagrees.

Judgement calls made in THIS oracle where the written spec does not pin
the behaviour down (see artifacts/logs/T006-oracle.txt for the full list):
  O1. Unknown attributes on any element are IGNORED (reversed by
      P029-T011-FIX-01, 2026-11-21: spec 3.1 limits only the TAG set;
      see the dated erratum appendix at the end of
      artifacts/logs/T006-oracle.txt). The only attribute-level
      rejections kept are headers= and scope rowgroup/colgroup/illegal
      (UNSUPPORTED_HEADER_SEMANTICS, spec 3.1) and rowspan/colspan
      parsing/range (INVALID_SPAN).
  O2. A span reaching past the last DOM row, or across a thead/tbody
      boundary -> INVALID_SPAN.
  O3. Error precedence: OVER_SIZE(bytes) -> parse errors in document order
      -> OVER_SIZE(rows/cells) -> INVALID_SPAN/INVALID_GRID_OVERLAP during
      placement -> OVER_SIZE(cols) -> INVALID_RAGGED_GRID.
  O4. Grid rows follow DOM order of <tr> elements; a bare <tr> under
      <table> is an implicit tbody row, and an implicit tbody plus an
      explicit <tbody> in the same table is INVALID_RAGGED_GRID.
  O5. Entity decoding: only ';'-terminated references; a fixed table of
      common named entities plus decimal/hex numeric references; unknown
      names stay literal. U+00A0 is preserved (never folded, never trimmed);
      only ASCII whitespace folds to one U+0020 and is trimmed at the edges.
  O6. alternativeHtml uses this oracle's own canonical serialisation
      (compact, thead/tbody groups in grid order, rowspan/colspan only when
      >1, scope only when present, & < > escaped in text). The spec does
      not pin a serialisation, so cross-implementation comparison of the
      alternativeHtml STRING is a known open point; the B graph (cells +
      slotOwner) is the comparable content.
FIX-02 (2026-11-21, spec v1.0.2, R1 P1-02): analyse() also returns
  inputHash (SHA-256 of the input HTML, same definition as PROJECT_BOOK
  section 9) and spec_version. An optional job_id is echoed as jobId
  when the caller supplies one; the Oracle never invents a jobId
  (jobId is a transport-layer field, not computed here).
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

SPEC_VERSION = "1.0.2"
INPUT_SCHEMA = "tablefork.input/v1"
FIXTURE_SCHEMA = "tablefork.fixture/v1"

MAX_INPUT_BYTES = 64 * 1024
MAX_ROWS = 32
MAX_COLS = 12
MAX_DOM_CELLS = 128
MAX_SPAN = 8

STRATEGIES = ("ORIGIN_EMPTY", "REPEAT_VALUE")

ERROR_CODES = (
    "INVALID_SPAN",
    "INVALID_GRID_OVERLAP",
    "INVALID_RAGGED_GRID",
    "OVER_SIZE",
    "UNSUPPORTED_NESTED_TABLE",
    "UNSUPPORTED_HEADER_SEMANTICS",
    "CANCELLED",
)


class TableForkError(Exception):
    """Structured error carrying one of the 7 frozen error codes."""

    def __init__(self, code, message):
        assert code in ERROR_CODES, code
        super().__init__(message)
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Text: entity decoding + whitespace folding (spec section 3.1, J6, O5)
# ---------------------------------------------------------------------------

_NAMED_ENTITIES = {
    "amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'",
    "nbsp": "\u00a0", "copy": "\u00a9", "reg": "\u00ae",
    "trade": "\u2122", "hellip": "\u2026", "mdash": "\u2014",
    "ndash": "\u2013", "lsquo": "\u2018", "rsquo": "\u2019",
    "ldquo": "\u201c", "rdquo": "\u201d", "laquo": "\u00ab",
    "raquo": "\u00bb", "middot": "\u00b7", "bull": "\u2022",
    "deg": "\u00b0", "plusmn": "\u00b1", "times": "\u00d7",
    "divide": "\u00f7", "frac12": "\u00bd", "frac14": "\u00bc",
    "frac34": "\u00be", "iexcl": "\u00a1", "iquest": "\u00bf",
    "cent": "\u00a2", "pound": "\u00a3", "curren": "\u00a4",
    "yen": "\u00a5", "brvbar": "\u00a6", "sect": "\u00a7",
    "uml": "\u00a8", "ordf": "\u00aa", "ordm": "\u00ba",
    "para": "\u00b6", "sup1": "\u00b9", "sup2": "\u00b2",
    "sup3": "\u00b3", "acute": "\u00b4", "micro": "\u00b5",
    "cedil": "\u00b8", "szlig": "\u00df", "agrave": "\u00e0",
    "aacute": "\u00e1", "eacute": "\u00e9", "egrave": "\u00e8",
    "ecirc": "\u00ea", "ouml": "\u00f6", "uuml": "\u00fc",
    "auml": "\u00e4", "ntilde": "\u00f1", "ccedil": "\u00e7",
    "alpha": "\u03b1", "beta": "\u03b2", "gamma": "\u03b3",
    "delta": "\u03b4", "pi": "\u03c0", "sigma": "\u03c3",
    "omega": "\u03c9", "infin": "\u221e", "ne": "\u2260",
    "le": "\u2264", "ge": "\u2265", "larr": "\u2190",
    "uarr": "\u2191", "rarr": "\u2192", "darr": "\u2193",
    "harr": "\u2194", "crarr": "\u21b5", "lceil": "\u2308",
    "rceil": "\u2309", "lfloor": "\u230a", "rfloor": "\u230b",
    "loz": "\u25ca", "spades": "\u2660", "clubs": "\u2663",
    "hearts": "\u2665", "diams": "\u2666", "permil": "\u2030",
    "prime": "\u2032", "Prime": "\u2033", "oline": "\u203e",
    "frasl": "\u2044", "euro": "\u20ac", "image": "\u2111",
    "weierp": "\u2118", "real": "\u211c", "alefsym": "\u2135",
}

_ENTITY_RE = re.compile(r"&(#x[0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]+);")


def _decode_one(match):
    body = match.group(1)
    if body.startswith("#x") or body.startswith("#X"):
        try:
            cp = int(body[2:], 16)
        except ValueError:
            return match.group(0)
    elif body.startswith("#"):
        try:
            cp = int(body[1:], 10)
        except ValueError:
            return match.group(0)
    else:
        return _NAMED_ENTITIES.get(body, match.group(0))
    if cp == 0 or cp > 0x10FFFF or 0xD800 <= cp <= 0xDFFF:
        return match.group(0)
    return chr(cp)


def decode_entities(text):
    """Decode only ';'-terminated character references (J6)."""
    return _ENTITY_RE.sub(_decode_one, text)


_ASCII_WS_RUN = re.compile(r"[ \t\n\r\f\v]+")


def normalize_text(raw):
    """Decode entities, fold ASCII whitespace runs to one U+0020, trim
    ASCII whitespace at the edges. U+00A0 is preserved (J6, O5)."""
    decoded = decode_entities(raw)
    folded = _ASCII_WS_RUN.sub(" ", decoded)
    return folded.strip(" \t\n\r\f\v")


# ---------------------------------------------------------------------------
# Tokeniser for the limited HTML subset
# ---------------------------------------------------------------------------

_TAG_START_RE = re.compile(r"[A-Za-z]")
_NAME_RE = re.compile(r"[A-Za-z][A-Za-z0-9]*")
_ATTR_NAME_RE = re.compile(r"[^\s=/>]+")


def _ragged(msg):
    return TableForkError("INVALID_RAGGED_GRID", msg)


def tokenize(html):
    """Yield tokens: ('start', name, attrs), ('end', name),
    ('text', raw), ('comment',). Anything outside the limited subset
    raises the frozen error code for that shape (J1/J2)."""
    i, n = 0, len(html)
    while i < n:
        ch = html[i]
        if ch != "<":
            j = html.find("<", i)
            if j == -1:
                j = n
            yield ("text", html[i:j])
            i = j
            continue
        # ch == "<"
        if html.startswith("<!--", i):
            end = html.find("-->", i + 4)
            if end == -1:
                raise _ragged("unterminated comment")
            yield ("comment", html[i + 4:end])
            i = end + 3
            continue
        if i + 1 < n and html[i + 1] == "/":
            m = _NAME_RE.match(html, i + 2)
            if not m:
                raise _ragged("malformed end tag at offset %d" % i)
            name = m.group(0).lower()
            k = m.end()
            while k < n and html[k] in " \t\n\r\f\v":
                k += 1
            if k >= n or html[k] != ">":
                raise _ragged("malformed end tag </%s>" % name)
            yield ("end", name)
            i = k + 1
            continue
        if i + 1 < n and _TAG_START_RE.match(html[i + 1]):
            m = _NAME_RE.match(html, i + 1)
            name = m.group(0).lower()
            k = m.end()
            attrs = {}
            while True:
                while k < n and html[k] in " \t\n\r\f\v":
                    k += 1
                if k >= n:
                    raise _ragged("unclosed tag <%s>" % name)
                if html[k] == ">":
                    k += 1
                    break
                if html[k] == "/":
                    # Self-closing form is not in the limited subset.
                    raise _ragged("self-closing tag <%s/> is not in the subset" % name)
                am = _ATTR_NAME_RE.match(html, k)
                if not am:
                    raise _ragged("malformed attribute in <%s>" % name)
                aname = am.group(0).lower()
                k = am.end()
                while k < n and html[k] in " \t\n\r\f\v":
                    k += 1
                if k < n and html[k] == "=":
                    k += 1
                    while k < n and html[k] in " \t\n\r\f\v":
                        k += 1
                    if k >= n:
                        raise _ragged("attribute %s has no value" % aname)
                    if html[k] in "\"'":
                        q = html[k]
                        end = html.find(q, k + 1)
                        if end == -1:
                            raise _ragged("unterminated attribute value for %s" % aname)
                        aval = html[k + 1:end]
                        k = end + 1
                    else:
                        m2 = re.compile(r"[^\s>]+").match(html, k)
                        aval = m2.group(0)
                        k = m2.end()
                else:
                    aval = ""
                if aname in attrs:
                    raise _ragged("duplicate attribute %s" % aname)
                attrs[aname] = aval
            yield ("start", name, attrs)
            i = k
            continue
        if i + 1 < n and html[i + 1] == "!":
            raise _ragged("markup declaration outside the subset at offset %d" % i)
        if i + 1 < n and html[i + 1] == "?":
            raise _ragged("processing instruction outside the subset at offset %d" % i)
        # Bare "<" not starting a tag: literal text (T003: literal "<" in text).
        yield ("text", "<")
        i += 1


# ---------------------------------------------------------------------------
# Parser: structure validation -> rows of raw cells
# ---------------------------------------------------------------------------

_ALLOWED_TAGS = {"table", "thead", "tbody", "tr", "th", "td", "caption"}


def _check_cell_attrs(name, attrs, section):
    """Validate a th/td start tag. Returns (rowspan, colspan, scope).
    Raises UNSUPPORTED_HEADER_SEMANTICS / INVALID_SPAN.
    Unknown attributes are IGNORED (T011-FIX-01: spec 3.1 limits only
    the tag set; only headers/scope/rowspan/colspan carry semantics)."""
    if "headers" in attrs:
        raise TableForkError(
            "UNSUPPORTED_HEADER_SEMANTICS",
            "headers attribute is explicitly unsupported (spec 3.1)")
    rowspan = _parse_span(attrs.get("rowspan"), "rowspan")
    colspan = _parse_span(attrs.get("colspan"), "colspan")
    scope_raw = attrs.get("scope")
    scope = None
    if scope_raw is not None:
        scope = scope_raw.strip().lower()
        if scope in ("rowgroup", "colgroup"):
            raise TableForkError(
                "UNSUPPORTED_HEADER_SEMANTICS",
                "scope=%s is explicitly unsupported (spec 3.1)" % scope_raw)
        if scope not in ("row", "col"):
            raise TableForkError(
                "UNSUPPORTED_HEADER_SEMANTICS",
                "unknown scope value %r" % scope_raw)
        if name == "th":
            if scope == "row" and section == "thead":
                raise TableForkError(
                    "UNSUPPORTED_HEADER_SEMANTICS",
                    "scope=row on a thead th contradicts header semantics (J3)")
            if scope == "col" and section == "tbody":
                raise TableForkError(
                    "UNSUPPORTED_HEADER_SEMANTICS",
                    "scope=col on a tbody th contradicts header semantics (J3)")
        else:  # td: row/col scope is ignored; rowgroup/colgroup/invalid
            # already rejected above (J3).
            scope = None
    return rowspan, colspan, scope


def _parse_span(raw, what):
    if raw is None:
        return 1
    if not re.fullmatch(r"[0-9]+", raw.strip()):
        raise TableForkError("INVALID_SPAN", "%s value %r is not an integer" % (what, raw))
    value = int(raw.strip())
    if value < 1 or value > MAX_SPAN:
        raise TableForkError(
            "INVALID_SPAN", "%s=%d is outside 1..%d" % (what, value, MAX_SPAN))
    return value


def parse_table(html):
    """Parse + validate the limited subset. Returns a list of rows:
    each row is {'section': 'thead'|'tbody', 'cells': [raw cell dicts]}.
    Raw cell dicts: {role, scope, text (normalised), rowspan, colspan,
    section} in DOM order."""
    if len(html.encode("utf-8")) > MAX_INPUT_BYTES:
        raise TableForkError("OVER_SIZE", "input exceeds 64 KiB UTF-8")
    stack = []  # open element names
    rows = []
    current_row = None       # {'section': ..., 'cells': [...]}
    current_cell = None      # raw cell dict under construction
    thead_seen = False
    tbody_seen = False       # explicit <tbody> or implicit tbody rows
    table_seen = False

    def top():
        return stack[-1] if stack else None

    def close_cell():
        nonlocal current_cell
        if current_cell is not None:
            current_cell["text"] = normalize_text(current_cell["raw_text"])
            del current_cell["raw_text"]
            current_row["cells"].append(current_cell)
            current_cell = None
        if stack and stack[-1] in ("th", "td"):
            stack.pop()

    def close_row():
        nonlocal current_row
        close_cell()
        if current_row is not None:
            rows.append(current_row)
            current_row = None
        if stack and stack[-1] == "tr":
            stack.pop()

    def close_section():
        close_row()
        if stack and stack[-1] in ("thead", "tbody"):
            stack.pop()

    for tok in tokenize(html):
        kind = tok[0]
        if kind == "comment":
            continue
        if kind == "text":
            text = tok[1]
            if current_cell is not None:
                current_cell["raw_text"] += text
            elif top() == "caption":
                continue  # caption text is ignored for the grid
            elif text.strip(" \t\n\r\f\v") == "":
                continue  # ignorable whitespace between structural tags
            else:
                raise _ragged("stray text outside a cell: %r" % text.strip()[:40])
            continue
        if kind == "start":
            _, name, attrs = tok
            if name not in _ALLOWED_TAGS:
                raise _ragged("element <%s> is outside the limited subset" % name)
            if name == "table":
                if stack:
                    raise TableForkError(
                        "UNSUPPORTED_NESTED_TABLE",
                        "nested <table> inside the table")
                if table_seen:
                    raise TableForkError(
                        "UNSUPPORTED_NESTED_TABLE",
                        "multiple top-level <table> elements (J2)")
                # Unknown attributes on <table> are ignored (T011-FIX-01).
                table_seen = True
                stack.append("table")
                continue
            if not stack:
                raise _ragged("<%s> outside any <table>" % name)
            if name in ("thead", "tbody"):
                if top() == "caption":
                    raise _ragged("<%s> inside <caption>" % name)
                if top() in ("th", "td", "tr", "thead", "tbody"):
                    close_section()  # implicit close at a structural boundary (J5)
                if top() != "table":
                    raise _ragged("<%s> must be a direct child of <table>" % name)
                # Unknown attributes on <thead>/<tbody> are ignored (T011-FIX-01).
                if name == "thead":
                    if thead_seen:
                        raise _ragged("multiple <thead> elements")
                    thead_seen = True
                else:
                    if tbody_seen:
                        raise _ragged("multiple <tbody> elements")
                    tbody_seen = True
                stack.append(name)
                continue
            if name == "caption":
                if top() in ("th", "td", "tr", "thead", "tbody"):
                    close_section()  # implicit close at a structural boundary (J5)
                if top() != "table":
                    raise _ragged("<caption> must be a direct child of <table>")
                # Unknown attributes on <caption> are ignored (T011-FIX-01).
                stack.append("caption")
                continue
            if name == "tr":
                if top() == "caption":
                    raise _ragged("<tr> inside <caption>")
                if top() == "table":
                    # Bare <tr>: implicit tbody row (J4).
                    if tbody_seen:
                        raise _ragged(
                            "bare <tr> together with an explicit <tbody>")
                    tbody_seen = True
                    current_row = {"section": "tbody", "cells": []}
                    stack.append("tr")
                    continue
                if top() in ("thead", "tbody"):
                    # Unknown attributes on <tr> are ignored (T011-FIX-01).
                    current_row = {"section": top(), "cells": []}
                    stack.append("tr")
                    continue
                if top() == "tr":
                    section = stack[-2]  # enclosing thead/tbody
                    close_row()  # implicit close (J5)
                    current_row = {"section": section, "cells": []}
                    stack.append("tr")
                    continue
                raise _ragged("<tr> in unexpected context %s" % top())
            # th / td
            if top() == "caption":
                raise _ragged("<%s> inside <caption>" % name)
            if top() in ("th", "td"):
                close_cell()  # implicit close (J5)
            if top() != "tr":
                raise _ragged("<%s> outside <tr>" % name)
            section = current_row["section"]
            rowspan, colspan, scope = _check_cell_attrs(name, attrs, section)
            current_cell = {
                "role": "TH" if name == "th" else "TD",
                "scope": scope,
                "raw_text": "",
                "rowspan": rowspan,
                "colspan": colspan,
                "section": section,
            }
            stack.append(name)
            continue
        # kind == "end"
        _, name = tok
        if name not in _ALLOWED_TAGS:
            raise _ragged("end tag </%s> is outside the subset" % name)
        if name == "table":
            if not stack:
                raise _ragged("stray </table>")
            if top() == "caption":
                # caption must be closed explicitly (J5).
                raise _ragged("</table> while <caption> is still open")
            close_section()
            if top() == "table":
                stack.pop()
            else:
                raise _ragged("mismatched </table>")
            continue
        if name in ("thead", "tbody"):
            if top() == "caption":
                raise _ragged("</%s> inside <caption>" % name)
            if top() in ("th", "td"):
                close_cell()
            if top() == "tr":
                close_row()
            if top() == name:
                stack.pop()
                continue
            raise _ragged("mismatched </%s>" % name)
        if name == "caption":
            if top() != "caption":
                raise _ragged("mismatched </caption>")
            stack.pop()
            continue
        if name == "tr":
            if top() in ("th", "td"):
                close_cell()
            if top() == "tr":
                close_row()
                continue
            raise _ragged("mismatched </tr>")
        # th / td end tag (close_cell already pops the cell element)
        if top() == name:
            close_cell()
            continue
        raise _ragged("mismatched </%s>" % name)

    if stack:
        # EOF is not a boundary: any element still open is rejected (J5).
        raise _ragged("unclosed <%s> at end of input" % stack[-1])
    if not table_seen:
        raise _ragged("no <table> in input")
    if not rows:
        raise _ragged("empty table: no rows")
    return rows


# ---------------------------------------------------------------------------
# Grid: first-free-column placement, overlap / ragged / limits
# ---------------------------------------------------------------------------

CELL_KEY_ORDER = ("id", "row", "col", "rowSpan", "colSpan",
                  "role", "scope", "text", "section")


def _ordered_cell(cell):
    return {k: cell[k] for k in CELL_KEY_ORDER}


def build_grid(rows):
    """Place raw cells on the grid. Returns (cells, slot_owner, nrows, ncols).
    cells are ordered dicts with ids c00, c01, ... sorted by
    (origin row, origin col, DOM order)."""
    nrows = len(rows)
    if nrows > MAX_ROWS:
        raise TableForkError("OVER_SIZE", "%d rows exceeds 32" % nrows)
    dom_cells = sum(len(r["cells"]) for r in rows)
    if dom_cells > MAX_DOM_CELLS:
        raise TableForkError("OVER_SIZE", "%d DOM cells exceeds 128" % dom_cells)
    occupancy = [[] for _ in range(nrows)]  # occupancy[r][x] -> cell or None
    placed = []  # (cell dict, dom_index)
    dom_index = 0
    for r, row in enumerate(rows):
        for raw in row["cells"]:
            h, w = raw["rowspan"], raw["colspan"]
            # First free column in this row.
            occ = occupancy[r]
            x = 0
            while x < len(occ) and occ[x] is not None:
                x += 1
            if r + h > nrows:
                raise TableForkError(
                    "INVALID_SPAN",
                    "cell at row %d rowspan=%d reaches past the last row" % (r, h))
            for rr in range(r, r + h):
                if rows[rr]["section"] != raw["section"]:
                    raise TableForkError(
                        "INVALID_SPAN",
                        "cell at row %d rowspan=%d crosses the thead/tbody boundary"
                        % (r, h))
            for rr in range(r, r + h):
                while len(occupancy[rr]) < x + w:
                    occupancy[rr].append(None)
                for xx in range(x, x + w):
                    if occupancy[rr][xx] is not None:
                        raise TableForkError(
                            "INVALID_GRID_OVERLAP",
                            "cell at (%d,%d) overlaps the cell at (%d,%d)"
                            % (r, x, rr, xx))
            cell = {
                "row": r, "col": x, "rowSpan": h, "colSpan": w,
                "role": raw["role"], "scope": raw["scope"],
                "text": raw["text"], "section": raw["section"],
            }
            for rr in range(r, r + h):
                for xx in range(x, x + w):
                    occupancy[rr][xx] = cell
            placed.append((cell, dom_index))
            dom_index += 1
    ncols = 0
    for r in range(nrows):
        ncols = max(ncols, len(occupancy[r]))
    if ncols > MAX_COLS:
        raise TableForkError("OVER_SIZE", "%d columns exceeds 12" % ncols)
    for r in range(nrows):
        if len(occupancy[r]) < ncols or any(o is None for o in occupancy[r][:ncols]):
            raise TableForkError(
                "INVALID_RAGGED_GRID",
                "row %d is not covered continuously from column 0 to %d" % (r, ncols - 1))
    placed.sort(key=lambda p: (p[0]["row"], p[0]["col"], p[1]))
    cells = []
    for i, (cell, _dom) in enumerate(placed):
        cell = dict(cell)
        cell["id"] = "c%02d" % i
        cells.append(_ordered_cell(cell))
    slot_owner = [[None] * ncols for _ in range(nrows)]
    # slotOwner via occupancy: occupancy holds the pre-id cell dicts, so
    # map each slot through its owner's (row, col) origin.
    origin_to_id = {(c["row"], c["col"]): c["id"] for c in cells}
    for r in range(nrows):
        for x in range(ncols):
            owner = occupancy[r][x]
            slot_owner[r][x] = origin_to_id[(owner["row"], owner["col"])]
    return cells, slot_owner, nrows, ncols


# ---------------------------------------------------------------------------
# Header paths (spec 3.3, J7)
# ---------------------------------------------------------------------------

def header_paths(cells, slot_owner, nrows, ncols, row_sections):
    """Returns (col_paths, row_paths): col_paths[x] is the list of thead th
    texts covering column x (top to bottom, deduped by cell id);
    row_paths[r] is the list of tbody scope=row th texts for row r
    (left to right, continuation rows reuse the same source id)."""
    by_id = {c["id"]: c for c in cells}
    col_paths = []
    for x in range(ncols):
        path, seen = [], set()
        for r in range(nrows):
            if row_sections[r] != "thead":
                continue
            cell = by_id[slot_owner[r][x]]
            if cell["role"] == "TH" and cell["text"] != "" and cell["id"] not in seen:
                seen.add(cell["id"])
                path.append(cell["text"])
        col_paths.append(path)
    row_paths = []
    for r in range(nrows):
        path, seen = [], set()
        if row_sections[r] == "tbody":
            for x in range(ncols):
                cell = by_id[slot_owner[r][x]]
                if (cell["role"] == "TH" and cell["scope"] == "row"
                        and cell["text"] != "" and cell["id"] not in seen):
                    seen.add(cell["id"])
                    path.append(cell["text"])
        row_paths.append(path)
    return col_paths, row_paths


def build_facts(cells, slot_owner, nrows, ncols, col_paths, row_paths):
    """One SlotFact per TD-occupied slot (spec 5.4: '对每个 td 占用的槽位').
    TH-occupied slots get no fact (T011-FIX-01 ruling (A)); this is the
    same TD filter handover_lines already applies, so facts and the
    handover are now consistent with each other."""
    by_id = {c["id"]: c for c in cells}
    facts = []
    for r in range(nrows):
        for x in range(ncols):
            cell = by_id[slot_owner[r][x]]
            if cell["role"] != "TD":
                continue
            rh, ch = row_paths[r], col_paths[x]
            facts.append({
                "row": r, "col": x, "cellId": cell["id"],
                "rowHeaders": list(rh), "colHeaders": list(ch),
                "headerStatus": "KNOWN" if rh and ch else "UNKNOWN",
                "value": cell["text"],
            })
    return facts


def handover_lines(cells, facts):
    """One line per td-occupied slot (spec 5.4), in row-major slot order."""
    by_id = {c["id"]: c for c in cells}
    lines = []
    for f in facts:
        if by_id[f["cellId"]]["role"] != "TD":
            continue
        rh = " > ".join(f["rowHeaders"]) if f["rowHeaders"] else "?"
        ch = " > ".join(f["colHeaders"]) if f["colHeaders"] else "?"
        lines.append("[R%dC%d source=%s] 行标题: %s | 列标题: %s | 数值: %s"
                     % (f["row"], f["col"], f["cellId"], rh, ch, f["value"]))
    return lines


# ---------------------------------------------------------------------------
# Flatten: the two F strategies (spec 5.1, J-T004-1..5)
# ---------------------------------------------------------------------------

def escape_cell(text):
    """Escape backslash first, then pipe (order matters, spec 5.1)."""
    return text.replace("\\", "\\\\").replace("|", "\\|")


def flatten(cells, slot_owner, nrows, ncols, strategy):
    by_id = {c["id"]: c for c in cells}
    lines = []
    for r in range(nrows):
        vals = []
        for x in range(ncols):
            cell = by_id[slot_owner[r][x]]
            if strategy == "ORIGIN_EMPTY":
                vals.append(cell["text"] if (cell["row"] == r and cell["col"] == x) else "")
            else:  # REPEAT_VALUE
                vals.append(cell["text"])
        lines.append("| " + " | ".join(escape_cell(v) for v in vals) + " |")
        if r == 0:
            lines.append("| " + " | ".join(["---"] * ncols) + " |")
    # Every line LF-terminated; output ends with a single LF (J-T004-1).
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Canonical cell graph + hashes (T005 section 7 / J-T005-4)
# ---------------------------------------------------------------------------

def canonical_graph(cells, slot_owner, nrows, ncols):
    obj = {"rows": nrows, "cols": ncols, "cells": cells, "slotOwner": slot_owner}
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def sha256_hex(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Witness: single-cell split (spec 5.2, J-T005-1..7)
# ---------------------------------------------------------------------------

def _escape_html_text(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def serialize_alternative(cells_b, row_sections_b):
    """Canonical serialisation of a B grid (oracle's own form, see O6).
    thead/tbody groups are emitted in grid order; rowspan/colspan only
    when >1; scope only when present."""
    out = ["<table>"]
    r = 0
    nrows = len(row_sections_b)
    while r < nrows:
        section = row_sections_b[r]
        out.append("<%s>" % section)
        while r < nrows and row_sections_b[r] == section:
            out.append("<tr>")
            for cell in sorted((c for c in cells_b if c["row"] == r),
                               key=lambda c: c["col"]):
                tag = "th" if cell["role"] == "TH" else "td"
                attrs = ""
                if cell["rowSpan"] > 1:
                    attrs += ' rowspan="%d"' % cell["rowSpan"]
                if cell["colSpan"] > 1:
                    attrs += ' colspan="%d"' % cell["colSpan"]
                if cell["scope"] is not None:
                    attrs += ' scope="%s"' % cell["scope"]
                out.append("<%s%s>%s</%s>" % (
                    tag, attrs, _escape_html_text(cell["text"]), tag))
            out.append("</tr>")
            r += 1
        out.append("</%s>" % section)
    out.append("</table>")
    return "".join(out)


def _analyse_grid(cells, slot_owner, nrows, ncols, row_sections):
    col_paths, row_paths = header_paths(cells, slot_owner, nrows, ncols, row_sections)
    facts = build_facts(cells, slot_owner, nrows, ncols, col_paths, row_paths)
    return {
        "col_paths": col_paths, "row_paths": row_paths, "facts": facts,
        "f_origin": flatten(cells, slot_owner, nrows, ncols, "ORIGIN_EMPTY"),
        "f_repeat": flatten(cells, slot_owner, nrows, ncols, "REPEAT_VALUE"),
    }


def _split_candidate(cells, slot_owner, nrows, ncols, row_sections, source, strategy):
    """Build B for one merged source cell. Returns a dict describing B, or
    None (with a reason) when the candidate cannot certify."""
    h, w = source["rowSpan"], source["colSpan"]
    pieces = []
    for rr in range(source["row"], source["row"] + h):
        for xx in range(source["col"], source["col"] + w):
            if rr == source["row"] and xx == source["col"]:
                text = source["text"]
            elif strategy == "ORIGIN_EMPTY":
                text = ""
            else:
                text = source["text"]
            pieces.append({
                "row": rr, "col": xx, "rowSpan": 1, "colSpan": 1,
                "role": source["role"], "scope": source["scope"],
                "text": text, "section": source["section"],
            })
    rest = [dict(c) for c in cells if c["id"] != source["id"]]
    combined = rest + pieces
    if len(combined) > MAX_DOM_CELLS:
        return None, "B would have %d DOM cells, over the 128 cap (J-T005-6)" % len(combined)
    # Re-sort and re-id by (row, col, DOM order). Pieces take the source's
    # DOM position; original cells keep theirs.
    dom_order = {}
    for i, c in enumerate(cells):
        dom_order[c["id"]] = i
    src_dom = dom_order[source["id"]]
    keyed = []
    for c in rest:
        keyed.append(((c["row"], c["col"], dom_order[c["id"]]), c))
    for p in pieces:
        keyed.append(((p["row"], p["col"], src_dom), p))
    keyed.sort(key=lambda kv: kv[0])
    cells_b = []
    for i, (_k, c) in enumerate(keyed):
        c = dict(c)
        c["id"] = "c%02d" % i
        cells_b.append(_ordered_cell(c))
    # slotOwner for B.
    by_origin = {(c["row"], c["col"]): c["id"] for c in cells_b}
    slot_b = [[None] * ncols for _ in range(nrows)]
    for r in range(nrows):
        for x in range(ncols):
            owner_a = slot_owner[r][x]
            src = next(c for c in cells if c["id"] == owner_a)
            if src["id"] == source["id"]:
                slot_b[r][x] = by_origin[(r, x)]
            else:
                slot_b[r][x] = by_origin[(src["row"], src["col"])]
    return (cells_b, slot_b), None


def find_witness(cells, slot_owner, nrows, ncols, row_sections, strategy):
    """Enumerate single-split candidates in the frozen selection order and
    return the witness dict for this strategy."""
    f_a = flatten(cells, slot_owner, nrows, ncols, strategy)
    graph_a = canonical_graph(cells, slot_owner, nrows, ncols)
    a_sha = sha256_hex(graph_a)
    md_sha = sha256_hex(f_a)
    base = {
        "status": "NO_WITNESS_FOUND", "source_cell_id": None,
        "split_cost": None, "header_association_changed": False,
        "collision_kind": None, "alternative_html": None,
        "a_graph_sha256": a_sha, "b_graph_sha256": None,
        "markdown_sha256": md_sha, "f_b": None,
        "b_cells": None, "b_slotOwner": None, "reason": None,
    }
    merged = [c for c in cells if c["rowSpan"] * c["colSpan"] > 1]
    if not merged:
        base["reason"] = "no merged cells"
        return base
    ana_a = _analyse_grid(cells, slot_owner, nrows, ncols, row_sections)
    tried = []
    for source in merged:
        built, reason = _split_candidate(
            cells, slot_owner, nrows, ncols, row_sections, source, strategy)
        if built is None:
            tried.append((source["id"], reason))
            continue
        cells_b, slot_b = built
        # Re-verify B by re-parsing its serialised HTML (J-T005-4 / T005 s7).
        alt_html = serialize_alternative(cells_b, row_sections)
        rows_b = parse_table(alt_html)
        sections_b = [row["section"] for row in rows_b]
        cells_b2, slot_b2, nr_b, nc_b = build_grid(rows_b)
        if (nr_b != nrows or nc_b != ncols or sections_b != row_sections
                or cells_b2 != cells_b or slot_b2 != slot_b):
            tried.append((source["id"], "re-parsed B does not match constructed B"))
            continue
        f_b = flatten(cells_b, slot_b, nrows, ncols, strategy)
        if f_b != f_a:
            tried.append((source["id"], "F(B) != F(A)"))
            continue
        graph_b = canonical_graph(cells_b, slot_b, nrows, ncols)
        if graph_b == graph_a:
            tried.append((source["id"], "canonical graph of B equals A"))
            continue
        ana_b = _analyse_grid(cells_b, slot_b, nrows, ncols, row_sections)
        header_changed = (
            ana_b["col_paths"] != ana_a["col_paths"]
            or ana_b["row_paths"] != ana_a["row_paths"])
        extra = source["rowSpan"] * source["colSpan"] - 1
        tried.append((source["id"], None, header_changed, extra, cells_b, slot_b,
                      alt_html, f_b, graph_b))
    good = [t for t in tried if len(t) > 2 and t[1] is None]
    if not good:
        # tried entries for failures are (id, reason) pairs.
        reasons = "; ".join(
            "%s: %s" % (t[0], t[1]) for t in tried if len(t) == 2)
        base["reason"] = "all candidates failed: %s" % reasons if reasons else "no certifying candidate"
        return base
    # Frozen selection order (spec 5.2): header-changing first, then
    # extra_slots ascending, then origin row, col, id.
    def sort_key(t):
        _cid, _none, header_changed, extra, _cb, _sb, _html, _fb, _gb = t
        src = next(c for c in cells if c["id"] == _cid)
        return (0 if header_changed else 1, extra, src["row"], src["col"], src["id"])
    good.sort(key=sort_key)
    cid, _none, header_changed, extra, cells_b, slot_b, alt_html, f_b, graph_b = good[0]
    base.update({
        "status": "CERTIFIED_COLLISION", "source_cell_id": cid,
        "split_cost": extra, "header_association_changed": header_changed,
        "collision_kind": ("HEADER_ASSOCIATION_CHANGED" if header_changed
                           else "STRUCTURAL_COLLISION"),
        "alternative_html": alt_html,
        "b_graph_sha256": sha256_hex(graph_b), "f_b": f_b,
        "b_cells": cells_b, "b_slotOwner": slot_b, "reason": None,
    })
    return base


# ---------------------------------------------------------------------------
# Full analysis of one input
# ---------------------------------------------------------------------------

def analyse(html, strategy, job_id=None):
    """Returns the full expected-shape dict, or raises TableForkError.

    FIX-02: the returned dict also carries inputHash (SHA-256 of the
    input HTML, UTF-8 bytes, hex lowercase — the PROJECT_BOOK section 9
    definition) and spec_version. jobId is echoed only when the caller
    passes job_id (transport-layer field); otherwise it is omitted,
    never invented."""
    if strategy not in STRATEGIES:
        raise ValueError("unknown strategy %r" % strategy)
    rows = parse_table(html)
    row_sections = [row["section"] for row in rows]
    cells, slot_owner, nrows, ncols = build_grid(rows)
    ana = _analyse_grid(cells, slot_owner, nrows, ncols, row_sections)
    result = {
        "rows": nrows, "cols": ncols,
        "slotOwner": slot_owner, "cells": cells, "facts": ana["facts"],
        "f_origin": ana["f_origin"], "f_repeat": ana["f_repeat"],
        "handover": handover_lines(cells, ana["facts"]),
        "inputHash": sha256_hex(html),
        "spec_version": SPEC_VERSION,
        "witness": {
            "ORIGIN_EMPTY": find_witness(
                cells, slot_owner, nrows, ncols, row_sections, "ORIGIN_EMPTY"),
            "REPEAT_VALUE": find_witness(
                cells, slot_owner, nrows, ncols, row_sections, "REPEAT_VALUE"),
        },
    }
    if job_id is not None:
        result["jobId"] = job_id
    return result


# ---------------------------------------------------------------------------
# CLI: compare fixtures against hand-computed expectations
# ---------------------------------------------------------------------------

def _diff(path, expected, actual, out):
    """Record the first difference under path; return True if different."""
    if type(expected) is not type(actual):
        out.append("%s: type differs (expected %s, got %s)"
                   % (path, type(expected).__name__, type(actual).__name__))
        return True
    if isinstance(expected, dict):
        if set(expected) != set(actual):
            out.append("%s: keys differ (only expected %s; only actual %s)"
                       % (path, sorted(set(expected) - set(actual)),
                          sorted(set(actual) - set(expected))))
            return True
        for k in expected:
            if _diff("%s.%s" % (path, k), expected[k], actual[k], out):
                return True
        return False
    if isinstance(expected, list):
        if len(expected) != len(actual):
            out.append("%s: length differs (expected %d, got %d)"
                       % (path, len(expected), len(actual)))
            return True
        for i, (e, a) in enumerate(zip(expected, actual)):
            if _diff("%s[%d]" % (path, i), e, a, out):
                return True
        return False
    if expected != actual:
        out.append("%s: expected %r, got %r" % (path, expected, actual))
        return True
    return False


def compare_case(fixture_id, expected_entry, actual):
    """Returns a list of difference strings (empty = PASS).
    Error entries compare the error code only (messages are worded
    independently per implementation)."""
    diffs = []
    if "error" in expected_entry:
        if "error" not in actual:
            diffs.append("expected error %s but analysis succeeded"
                         % expected_entry["error"]["code"])
        elif actual["error"]["code"] != expected_entry["error"]["code"]:
            diffs.append("error code: expected %s, got %s"
                         % (expected_entry["error"]["code"],
                            actual["error"]["code"]))
        return diffs
    if "error" in actual:
        diffs.append("expected a successful analysis but got error %s: %s"
                     % (actual["error"]["code"], actual["error"]["message"]))
        return diffs
    for field in ("rows", "cols", "slotOwner", "cells", "facts",
                  "f_origin", "f_repeat", "handover", "inputHash"):
        if field not in expected_entry:
            diffs.append("expected entry is missing field %s" % field)
            continue
        _diff(field, expected_entry[field], actual[field], diffs)
        if diffs:
            return diffs
    for strategy in STRATEGIES:
        w_exp = expected_entry["witness"][strategy]
        w_act = actual["witness"][strategy]
        _diff("witness.%s" % strategy, w_exp, w_act, diffs)
        if diffs:
            return diffs
    return diffs


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="P029 TableFork independent Python Oracle (spec v1.0.2).")
    parser.add_argument("--fixtures", required=True,
                        help="directory of fixture JSON files")
    parser.add_argument("--expected", required=True,
                        help="golden_expected.json with hand-computed expectations")
    args = parser.parse_args(argv)

    fixtures_dir = Path(args.fixtures)
    expected_path = Path(args.expected)
    if not fixtures_dir.is_dir():
        print("fixtures directory not found: %s" % fixtures_dir, file=sys.stderr)
        return 2
    if not expected_path.is_file():
        print("expected file not found: %s" % expected_path, file=sys.stderr)
        return 2
    with expected_path.open(encoding="utf-8") as fh:
        expected_doc = json.load(fh)
    # FIX-02: the hand-computed document must carry the same spec version
    # as this Oracle; a stale document fails fast instead of passing
    # 48 cases against the wrong spec.
    if expected_doc.get("spec_version") != SPEC_VERSION:
        print("FAIL: golden_expected.json spec_version is %r, expected %r"
              % (expected_doc.get("spec_version"), SPEC_VERSION))
        return 1
    by_id = {}
    for entry in expected_doc.get("fixtures", []):
        by_id[entry["fixture_id"]] = entry

    fixture_files = sorted(fixtures_dir.glob("*.json"))
    if not fixture_files:
        print("no fixture JSON files in %s" % fixtures_dir, file=sys.stderr)
        return 2
    passed = failed = 0
    for path in fixture_files:
        with path.open(encoding="utf-8") as fh:
            fixture = json.load(fh)
        fid = fixture.get("fixture_id", path.stem)
        if fixture.get("schema") != FIXTURE_SCHEMA:
            print("FAIL %s: bad fixture schema %r" % (fid, fixture.get("schema")))
            failed += 1
            continue
        entry = by_id.get(fid)
        if entry is None:
            print("FAIL %s: no hand-computed expectation for this fixture id" % fid)
            failed += 1
            continue
        if entry.get("input", {}).get("schema") != INPUT_SCHEMA:
            print("FAIL %s: expected entry has bad input schema" % fid)
            failed += 1
            continue
        html = fixture["input"].get("html", "")
        strategy = fixture["input"].get("strategy")
        if entry["input"].get("html") != html or entry["input"].get("strategy") != strategy:
            print("FAIL %s: fixture input differs from the hand-computed entry's input" % fid)
            failed += 1
            continue
        try:
            actual = analyse(html, strategy)
        except TableForkError as exc:
            actual = {"error": {"code": exc.code, "message": exc.message}}
        except Exception as exc:  # oracle bug, never a PASS
            print("FAIL %s: oracle raised %s: %s" % (fid, type(exc).__name__, exc))
            failed += 1
            continue
        diffs = compare_case(fid, entry["expected"], actual)
        if diffs:
            print("FAIL %s: %s" % (fid, diffs[0]))
            failed += 1
        else:
            print("PASS %s" % fid)
            passed += 1
    covered = sorted(by_id)
    exercised = sorted({p.stem for p in fixture_files})
    missing = [fid for fid in covered if fid not in exercised]
    if missing:
        print("NOTE: expected entries not exercised by this fixture set: %s"
              % ", ".join(missing))
    print("%d/%d passed (%d failed)" % (passed, passed + failed, failed))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
````

### package.json
SHA-256: 1c5a018189bd2d8159884d1bbd7643a1e7c694cd98eff28db6dc50a266660740
Bytes: 988
Lines: 1

````json
{"dependencies":{"react":"^19.2.0","react-dom":"^19.2.0"},"description":"P029 TableFork — 同文异表碰撞见证：复杂表格交给 AI 前的结构歧义取证工具（本地离线，无模型/API）。","devDependencies":{"@playwright/test":"^1.55.0","@types/node":"^24.0.0","@types/react":"^19.2.0","@types/react-dom":"^19.2.0","@vitejs/plugin-react":"^5.0.0","tsx":"^4.20.0","typescript":"^5.9.0","vite":"^7.2.0","vitest":"^4.0.0"},"license":"MIT","name":"tablefork","private":true,"scripts":{"analyze":"tsx cli/analyze.ts","build":"tsc --noEmit && vite build","dev":"vite --host 127.0.0.1","oracle":"python3 oracle/reference.py --fixtures fixtures/golden --expected oracle/golden_expected.json","test":"vitest run","test:core":"vitest run tests/core tests/property","test:e2e":"playwright test --project=functional","test:e2e:perf":"playwright test --project=perf","typecheck":"tsc --noEmit","verify:release":"node scripts/verify_release.mjs"},"type":"module","version":"0.1.0"}
````

### playwright.config.ts
SHA-256: 637a0f2ddfac72ee775c0798950c5477bffe09c54f3146c9d06fb7c65ac4c1bb
Bytes: 2255
Lines: 48

````ts
import { defineConfig } from '@playwright/test';

// P029 TableFork — T001 scaffold config, adjusted by P029-T012 (see log
// artifacts/logs/T012-e2e.txt §8 J-T012-1 for the reasons):
// - E2E now runs against the PRODUCTION build via `vite preview` (port 4173),
//   not the dev server: the production build is the deliverable, and the
//   card requires the tests to run on it. The webServer command rebuilds
//   first so a stale dist/ can never be served silently.
// - trace/screenshot are kept (Playwright defaults): retain-on-failure /
//   only-on-failure, so a failing test keeps its screenshot + trace.
export default defineConfig({
  testDir: './tests/e2e',
  // T012: E2E files use *.e2e.ts (not *.spec.ts) so Vitest's default include
  // (**/*.{test,spec}.*) does not pick them up — `npm run test` would
  // otherwise execute Playwright files and fail at import time
  // (test.setTimeout/beforeEach throw outside the Playwright runner).
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  // T012-FIX-01 (测法修复，不动产品/阈值/断言)：性能测量改为隔离串行运行。
  // 全套并行时 2 个 Playwright worker 在 1.5 共享 vCPU 上互争 CPU，测到的
  // p95（527.4/649.2ms）是框架并行争用，不是产品速度（独立运行 263.2/
  // 282.8ms，Node 内核 109.7ms；两轮全套的后 5 次均回落到独立区间）。
  // 因此拆为两个 project：functional（20 条功能测试）与 perf（1 条性能
  // 测试）；`npm run test:e2e` 只跑 functional，`npm run test:e2e:perf`
  // 单独跑 perf，二者永不同时执行，性能测量不再受并行 worker 污染。
  projects: [
    { name: 'functional', testMatch: '**/tablefork.e2e.ts' },
    { name: 'perf', testMatch: '**/performance.e2e.ts' },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
````

### scripts/verify_release.mjs
SHA-256: 89948e80d1fd36f69b507c605011240b713c33d14cef2808edc979f13036f316
Bytes: 31922
Lines: 689

````js
/**
 * P029 TableFork — 发布验证 (P029-T013)
 *
 * 唯一权威：IMPLEMENTATION_PLAN.md §6 P029-T013 卡、§10.2（REVIEW_INDEX
 * 须逐文件列出 SHA-256 与行数）、PROJECT_BOOK.md §7.2 / §11。
 *
 * 本脚本真实校验发布包，全部检查失败即 exit 1（`npm run verify:release`
 * 必须 exit 0 才算验收通过）：
 *
 * (a) 源码 ZIP 是冻结提交的忠实归档：
 *     - 清单（review/RELEASE_MANIFEST.json）列出的文件集合 == 按排除
 *       规则扫描工作区的源码集合（100%，不多不少）；
 *     - 每个清单文件的 SHA-256 / 字节数 == 工作区文件实测；
 *     - ZIP 内条目集合 == 清单，逐条解包重算 SHA-256 == 清单；
 *     - 清单文件凡已在 git HEAD 中有记录者，其 SHA-256 == `git show HEAD:<path>`
 *       的实测（提交前的新文件只按工作区核对，并在报告中点名）；
 *     - 若全部清单文件都已在 HEAD 中，另用 `git archive HEAD`（同款
 *       pathspec 排除）新鲜归档并逐文件比对内容哈希。
 * (b) dist ZIP 与一次全新构建一致：脚本内真实跑 `npm run build`，再用
 *     同款确定性打包重打 dist ZIP，逐字节比对 SHA-256。
 * (c) 清单列出 100% 源码路径且逐文件 SHA-256 正确（即检查 (a) 的前两项）。
 *     可重跑性：清单冻结打包时刻的集合；此后新增文件（如 commit 2 的
 *     交接 JSON、T014 的独立审查报告）只警告、不失败——它们不在本次
 *     发布包内，但不使已冻结的集合失实；清单文件缺失/被改仍是 FAIL。
 *     例外：VOLATILE_RUN_OUTPUTS（每次 e2e 运行都会覆盖的两个运行输出
 *     文件）不参与“清单哈希与工作树一致”一项的比对，理由见该常量注释；
 *     清单/ZIP/HEAD 三方比对照常覆盖它们（ISSUE-T013-6）。
 * (d) REVIEW_PACK 各卷哈希与发布包一致：每卷的 SHA-256 == 清单记录；
 *     每卷内每个文件块的 SHA-256 == 清单中该源码文件的 SHA-256；
 *     全部代码文本文件恰好出现在一卷中，不多不少；
 *     REVIEW_INDEX.md 的分卷表与各卷实测一致。
 *
 * 自指排除（写在清单 `excluded_from_source_zip` 里，不是悄悄省略）：
 * 源码 ZIP 不装入三类文件——`artifacts/release/*.zip`（发布输出本身）、
 * `review/RELEASE_MANIFEST.json`（清单记录源码 ZIP 自身的哈希）、
 * `artifacts/logs/T013-release.txt`（日志记录两 ZIP 的哈希）；三者都在
 * Git 提交中，可独立核对（发布 ZIP 的权威哈希见清单自身的
 * source_zip / dist_zip 字段，不指向任何交接 JSON）。
 * 其余排除：`.git`、`node_modules`、`dist`、`test-results`、
 * `bundle/`、`drive-copies/`、`v1.0.0-archive/`（冻结归档副本，非源码）、
 * 根目录 `P029_SPEC_BUNDLE.zip`（规格包副本）、未跟踪的协调员文件
 * `S0_REPORT.md` / `COORDINATOR_LOG.md`、`oracle/__pycache__/`。
 *
 * 确定性打包：ZIP 由内嵌 Python 脚本（zipfile）生成，条目按路径排序、
 * 时间戳固定为 1980-01-01、统一 deflate 等级；同一文件集合两次打包
 * 逐字节相同，可复现。
 *
 * 本文件同时导出打包函数（`computeSourceSet` / `sha256File` /
 * `deterministicZip`），供发布打包步骤复用同一口径；直接运行时执行检查。
 */

import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SPEC_VERSION = '1.0.2';
export const BASE_COMMIT = '6c81860';
export const MANIFEST_SCHEMA = 'tablefork.release-manifest/v1';
export const SOURCE_ZIP_NAME = `tablefork-source-${BASE_COMMIT}.zip`;
export const DIST_ZIP_NAME = `tablefork-dist-${BASE_COMMIT}.zip`;

/** 源码集合扫描的排除规则（相对路径，前缀匹配；另见文件头自指排除）。 */
export const EXCLUDED_PREFIXES = [
  '.git/',
  'node_modules/',
  'dist/',
  'test-results/',
  'bundle/',
  'drive-copies/',
  'v1.0.0-archive/',
  'artifacts/release/',
  'oracle/__pycache__/',
];
export const EXCLUDED_FILES = new Set([
  'P029_SPEC_BUNDLE.zip',
  'S0_REPORT.md',
  'COORDINATOR_LOG.md',
  'review/RELEASE_MANIFEST.json',
  'artifacts/logs/T013-release.txt',
]);

/**
 * 每次 e2e 运行都会覆盖的运行输出文件（ISSUE-T013-6）：
 * `npm run test:e2e`（功能项目）重写 `artifacts/logs/T012-cancel-probe.json`
 * （取消探测结果），`npm run test:e2e:perf`（隔离性能项目）重写
 * `artifacts/logs/T012-perf-browser.json`（30 次性能原始值）；因此任何
 * 一次 e2e 运行后，工作树里这两个文件的字节/哈希都会与清单不一致——
 * 这不是发布包被篡改，只是运行输出的自然更新。已提交版本仍是记录证据，
 * 清单、源码 ZIP 与 git HEAD 三方比对（检查 a）照常覆盖这两个文件，
 * 一字不放宽。仅“清单哈希与工作树一致”这一项跳过它们，否则
 * verify:release 在每次 e2e 运行后都会误报 FAIL。
 */
export const VOLATILE_RUN_OUTPUTS = new Set([
  'artifacts/logs/T012-perf-browser.json',
  'artifacts/logs/T012-cancel-probe.json',
]);

/**
 * 清单 notes 模板（ISSUE-T014-1 / P029-FIX-03，R1 P2；
 * 措辞修正见 P029-REFREEZE-NOTES-FIX；排除枚举补“交接 JSON”见
 * P029-REFREEZE-NOTES-FIX2，T015 P2-03；同卡重验新冻结树时又差
 * review/INDEPENDENT_REVIEW_R2.md 1 个文件，故枚举再补“独立审查报告”
 * 一类——入树但不在 192 清单内的独立审查报告均属此类）。
 *
 * 背景：本文件此前并无生成 manifest notes 的模板——旧清单
 * review/RELEASE_MANIFEST.json 的 notes 是 T013 打包时一次性手写的，
 * 其第二句（“源码 ZIP 内容与 packaged_from_head 的树逐文件核对
 * （npm run verify:release 检查 a）”）口径不精确：verify 的检查 (a)
 * 实际拿 ZIP 对 git HEAD（冻结提交）比对，不是直接对 packaged_from_head；
 * 且 ZIP 与 packaged_from_head 的树确有 2 文件之差（见下）。独立审查
 * review/INDEPENDENT_REVIEW.md §8 已逐字记录，建议“下次重打时改一句注释”。
 * 本卡在此确立唯一的 notes 模板：重冻结卡生成新清单时必须调用
 * buildManifestNotes() 生成 notes，不得再手写沿用旧句。本卡不改
 * review/RELEASE_MANIFEST.json（旧冻结，重冻结卡重新生成）。
 *
 * 精确口径（以下四点缺一不可）：
 * 1. packaged_from_head 是生成清单与源码 ZIP 时的 HEAD 提交——不是
 *    “源码 ZIP 所打包的树的提交”的简写：两者可能差打包时机械重生成的
 *    文件（R1 实例：packaged_from_head c1af873，ZIP 的树是冻结提交
 *    f53cef4，差 2 个文件——review/REVIEW_INDEX.md 与
 *    review/REVIEW_PACK_05.md）。
 * 2. 若 packaged_from_head 的树与 ZIP 的树不同，差的文件必须逐个列出，
 *    且只能是打包时机械重生成的文件；冻结提交本身不在生成时点名哈希——
 *    清单生成时冻结提交尚不存在（它由随后提交清单与 ZIP 的那次提交才
 *    成为冻结提交），notes 只写“冻结提交以 handoffRef 所指 result_commit
 *    为准”。P029-REFREEZE 的教训：旧模板有个 frozenCommit 参数，重冻结
 *    生成器传入打包时 HEAD 的短哈希 b7e1023，notes 便把打包时 HEAD 提交
 *    写成“冻结提交 b7e1023”——但真正的冻结提交是随后提交的 ca8bed6；
 *    误标已被 R1 的 GPT 终审在 ISSUE-T014-1 要求过的口径明确性所不容，
 *    故本修正删除 frozenCommit 参数，杜绝此类误标。
 * 3. verify 检查 (a) 的比对对象是 git HEAD（冻结提交），不是
 *    packaged_from_head——notes 不得再写“ZIP 内容与 packaged_from_head
 *    的树逐文件核对”。
 * 4. 机械重生成文件数为 0 时，写干净的句子“打包时无机械重生成文件”，
 *    不得渲染成“生成的 （0 个文件）”这类空格加括号的别扭写法。
 * 另：第一句须写清 base_commit 的定义——本次冻结的工作基线提交
 * （T013 的 base_commit；FIX-04 的 handoff 提交）。
 */
export function buildManifestNotes({
  baseCommitShort,
  packagedFromHead,
  regeneratedFiles,
  handoffRef,
  generatedBy,
}) {
  const files = [...regeneratedFiles];
  const treeClause =
    files.length === 0
      ? '源码 ZIP 所打包的是打包时的工作树：其内容等于 packaged_from_head 的树；打包时无机械重生成文件。'
      : `源码 ZIP 所打包的是打包时的工作树：其内容等于 packaged_from_head 的树 + 打包时机械重生成的文件（${files.join(' 与 ')}，${files.length} 个文件）。`;
  return (
    `源码 ZIP 文件名中的短 SHA 为本次冻结的工作基线提交 ${baseCommitShort}（T013 的 base_commit；FIX-04 的 handoff 提交）。` +
    `packaged_from_head：生成清单与源码 ZIP 时的 HEAD 提交（${packagedFromHead}）。` +
    treeClause +
    `除清单自指排除的文件（清单自身、发布 ZIP、重冻结日志、交接 JSON、独立审查报告）外，与冻结发布提交的树逐文件一致（冻结提交以 ${handoffRef} 所指 result_commit 为准）。` +
    `verify:release 检查 (a) 拿 ZIP 对 git HEAD（冻结提交）比对，不是直接对 packaged_from_head。` +
    `冻结发布提交（result_commit）见 ${handoffRef}。` +
    `本清单由 ${generatedBy} 从修复提交重新生成。`
  );
}

/**
 * 当前实例的 notes 准确措辞（供重冻结卡直接采用；仅当本实例的提交号与
 * 文件仍适用时——新实例须按实际值重新调用 buildManifestNotes）：
 *
 * 源码 ZIP 文件名中的短 SHA 为本次冻结的工作基线提交 4025061
 * （T013 的 base_commit；FIX-04 的 handoff 提交）。
 * packaged_from_head：生成清单与源码 ZIP 时的 HEAD 提交
 * （c1af8736989418b863b9b762535dd9128b3a7b5e）。
 * 源码 ZIP 所打包的是打包时的工作树：其内容等于 packaged_from_head 的树 +
 * 打包时机械重生成的文件（review/REVIEW_INDEX.md 与
 * review/REVIEW_PACK_05.md，2 个文件）。
 * 除清单自指排除的文件（清单自身、发布 ZIP、重冻结日志）外，与冻结发布
 * 提交的树逐文件一致（冻结提交以 task_handoffs/P029-T013-FIX-01.json
 * 所指 result_commit 为准）。
 * verify:release 检查 (a) 拿 ZIP 对 git HEAD（冻结提交）比对，不是直接对
 * packaged_from_head。
 * 冻结发布提交（result_commit）见 task_handoffs/P029-T013-FIX-01.json。
 * 本清单由 P029-T013-FIX-01 从修复提交重新生成。
 *
 * 调用示例：
 * buildManifestNotes({
 *   baseCommitShort: '4025061',
 *   packagedFromHead: 'c1af8736989418b863b9b762535dd9128b3a7b5e',
 *   regeneratedFiles: ['review/REVIEW_INDEX.md', 'review/REVIEW_PACK_05.md'],
 *   handoffRef: 'task_handoffs/P029-T013-FIX-01.json',
 *   generatedBy: 'P029-T013-FIX-01',
 * })
 */

/** REVIEW_PACK 收录的代码文本：手写代码与配置文本（其余清单文件只列入 REVIEW_INDEX）。 */
export function isCodeTextFile(relPath) {
  if (relPath === 'package.json' || relPath === 'tsconfig.json') return true;
  if (relPath === 'vite.config.ts' || relPath === 'playwright.config.ts') return true;
  if (relPath === 'index.html') return true;
  if (relPath === 'scripts/verify_release.mjs') return true;
  if (relPath.startsWith('src/') || relPath.startsWith('cli/')) return true;
  if (relPath.startsWith('tests/')) return true;
  if (relPath === 'oracle/reference.py') return true;
  return false;
}

export function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

export function sha256File(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** 按排除规则扫描工作区，返回排序后的源码相对路径（POSIX 分隔符）。 */
export function computeSourceSet(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split(sep).join('/');
      if (entry.isDirectory()) {
        if (EXCLUDED_PREFIXES.some((p) => `${rel}/`.startsWith(p))) continue;
        walk(abs);
      } else if (entry.isFile()) {
        if (EXCLUDED_FILES.has(rel)) continue;
        if (EXCLUDED_PREFIXES.some((p) => rel.startsWith(p))) continue;
        out.push(rel);
      }
    }
  };
  walk(root);
  out.sort();
  return out;
}

/** 内嵌确定性打包 Python 脚本：用法 deterministicZip.py <baseDir> <listFile> <outZip>。 */
const ZIP_PY = `import sys, zipfile
base, listfile, out = sys.argv[1], sys.argv[2], sys.argv[3]
names = [l.rstrip('\\n') for l in open(listfile, encoding='utf-8') if l.strip()]
names.sort()
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in names:
        import os
        p = os.path.join(base, *name.split('/'))
        data = open(p, 'rb').read()
        info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, data)
`;

/**
 * 确定性打包：把 baseDir 下的 relPaths（相对路径）打成 outZip。
 * @returns {{ bytes: number, sha256: string }}
 */
export function deterministicZip(baseDir, relPaths, outZip) {
  const tmp = join(tmpdir(), `tablefork-zip-${process.pid}-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const py = join(tmp, 'dzip.py');
  const list = join(tmp, 'list.txt');
  writeFileSync(py, ZIP_PY, 'utf8');
  writeFileSync(list, `${[...relPaths].sort().join('\n')}\n`, 'utf8');
  execFileSync('python3', [py, baseDir, list, outZip], { stdio: 'pipe' });
  const st = statSync(outZip);
  return { bytes: st.size, sha256: sha256File(outZip) };
}

/** 列出 ZIP 内条目（相对路径），用内嵌 Python 读 central directory。 */
export function listZipEntries(zipPath) {
  const tmp = join(tmpdir(), `tablefork-ziplist-${process.pid}-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const py = join(tmp, 'zlist.py');
  writeFileSync(
    py,
    "import sys, zipfile\nprint('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))\n",
    'utf8',
  );
  const out = execFileSync('python3', [py, zipPath], { encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter((s) => s !== '').sort();
}

/** 解包 ZIP 到 outDir（内嵌 Python），返回条目相对路径。 */
export function extractZip(zipPath, outDir) {
  mkdirSync(outDir, { recursive: true });
  const tmp = join(tmpdir(), `tablefork-zipex-${process.pid}-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const py = join(tmp, 'zx.py');
  writeFileSync(
    py,
    "import sys, zipfile\nzipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])\n",
    'utf8',
  );
  execFileSync('python3', [py, zipPath, outDir], { stdio: 'pipe' });
  return listZipEntries(zipPath);
}

function git(args, root) {
  return execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim();
}

function check(name, ok, detail, failures) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
  return ok;
}

export function runChecks() {
  const root = repoRoot();
  const failures = [];
  console.log(`TableFork verify:release — spec ${SPEC_VERSION}, base ${BASE_COMMIT}`);
  console.log(`repo: ${root}`);

  const head = git('rev-parse HEAD', root);
  const headShort = git('rev-parse --short HEAD', root);
  console.log(`git HEAD: ${head} (short ${headShort})`);

  // ---- 0. 清单读取与基本字段 ----
  const manifestPath = join(root, 'review', 'RELEASE_MANIFEST.json');
  if (!existsSync(manifestPath)) {
    check('manifest exists', false, 'review/RELEASE_MANIFEST.json 缺失', failures);
    console.log('RESULT: FAIL');
    return 1;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  check('manifest schema', manifest.schema === MANIFEST_SCHEMA, manifest.schema, failures);
  check('manifest spec_version', manifest.spec_version === SPEC_VERSION, manifest.spec_version, failures);
  check('manifest base_commit', manifest.base_commit === BASE_COMMIT, manifest.base_commit, failures);
  const manifestFiles = [...(manifest.files ?? [])].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  check('manifest files non-empty', manifestFiles.length > 0, `${manifestFiles.length} files`, failures);

  // ---- (c) 清单 == 100% 源码集合；逐文件 SHA-256 与工作区一致 ----
  // 方向是不对称的（fail-closed，但可重跑）：
  // - 清单文件在工作区缺失或哈希不符 → FAIL（发布包被篡改/损坏）；
  // - 工作区比清单多出文件 → WARN，不失败：清单冻结的是打包时刻的
  //   源码集合；此后新增的文件（如 commit 2 的交接 JSON、T014 的独立
  //   审查报告）不在本次发布包内，但不使已冻结的集合失实；警告会点名。
  //   打包步骤本身由扫描生成清单，生成时两者必然相等。
  const scanned = computeSourceSet(root);
  const scannedSet = new Set(scanned);
  const manifestSet = new Set(manifestFiles.map((f) => f.path));
  const missing = manifestFiles.map((f) => f.path).filter((p) => !scannedSet.has(p));
  const extra = scanned.filter((p) => !manifestSet.has(p));
  check(
    'manifest lists every worktree source file present at packaging',
    missing.length === 0,
    `${manifestFiles.length} listed, ${scanned.length} scanned` +
      (missing.length ? `; missing from worktree: ${missing.join(', ')}` : ''),
    failures,
  );
  if (extra.length > 0) {
    console.log(
      `[WARN] worktree has ${extra.length} source file(s) not in this frozen manifest (added after packaging; not part of this release): ${extra.join(', ')}`,
    );
  }
  let worktreeOk = 0;
  let worktreeSkippedVolatile = 0;
  const worktreeBad = [];
  for (const f of manifestFiles) {
    // 易变运行输出文件不参与工作树比对（见 VOLATILE_RUN_OUTPUTS）。
    if (VOLATILE_RUN_OUTPUTS.has(f.path)) {
      worktreeSkippedVolatile += 1;
      continue;
    }
    const abs = join(root, ...f.path.split('/'));
    if (!existsSync(abs)) {
      worktreeBad.push(`${f.path} (missing in worktree)`);
      continue;
    }
    const bytes = statSync(abs).size;
    const sha = sha256File(abs);
    if (bytes === f.bytes && sha === f.sha256) worktreeOk += 1;
    else worktreeBad.push(`${f.path} (bytes/sha mismatch)`);
  }
  check(
    'manifest file hashes match worktree',
    worktreeBad.length === 0,
    `${worktreeOk}/${manifestFiles.length - worktreeSkippedVolatile} OK` +
      (worktreeSkippedVolatile > 0
        ? `; ${worktreeSkippedVolatile} volatile run output(s) skipped (overwritten by every e2e run; still verified via manifest/ZIP/HEAD)`
        : '') +
      (worktreeBad.length ? `; bad: ${worktreeBad.slice(0, 5).join('; ')}` : ''),
    failures,
  );

  // ---- (a) 源码 ZIP：条目 == 清单，逐文件解包重算；HEAD 逐文件比对 ----
  const releaseDir = join(root, 'artifacts', 'release');
  const sourceZip = join(releaseDir, manifest.source_zip?.file ?? SOURCE_ZIP_NAME);
  const distZip = join(releaseDir, manifest.dist_zip?.file ?? DIST_ZIP_NAME);
  check('source zip exists', existsSync(sourceZip), sourceZip, failures);
  check('dist zip exists', existsSync(distZip), distZip, failures);
  if (existsSync(sourceZip) && manifest.source_zip) {
    const st = statSync(sourceZip);
    check(
      'source zip bytes+sha match manifest',
      st.size === manifest.source_zip.bytes && sha256File(sourceZip) === manifest.source_zip.sha256,
      `${st.size} bytes, sha256 ${sha256File(sourceZip).slice(0, 16)}…`,
      failures,
    );
    const entries = listZipEntries(sourceZip);
    const listed = manifestFiles.map((f) => f.path).sort();
    check(
      'source zip entries == manifest files',
      JSON.stringify(entries) === JSON.stringify(listed),
      `${entries.length} entries` +
        (JSON.stringify(entries) !== JSON.stringify(listed)
          ? `; diff: only-in-zip=${entries.filter((e) => !manifestSet.has(e)).join(',') || '—'} only-in-manifest=${listed.filter((e) => !entries.includes(e)).join(',') || '—'}`
          : ''),
      failures,
    );
    const tmpEx = join(tmpdir(), `tablefork-src-ex-${process.pid}-${Date.now()}`);
    extractZip(sourceZip, tmpEx);
    let zipOk = 0;
    const zipBad = [];
    for (const f of manifestFiles) {
      const ex = join(tmpEx, ...f.path.split('/'));
      if (!existsSync(ex)) {
        zipBad.push(`${f.path} (missing in zip)`);
        continue;
      }
      if (statSync(ex).size === f.bytes && sha256File(ex) === f.sha256) zipOk += 1;
      else zipBad.push(`${f.path} (content mismatch)`);
    }
    check(
      'source zip contents match manifest hashes',
      zipBad.length === 0,
      `${zipOk}/${manifestFiles.length} OK` +
        (zipBad.length ? `; bad: ${zipBad.slice(0, 5).join('; ')}` : ''),
      failures,
    );
  }

  // HEAD 逐文件比对（已在 HEAD 中的文件；新文件点名，不算失败）。
  // 语义：清单哈希必须 == 工作区（上一检查已证）。对 HEAD 中已有的文件，
  // 若 HEAD blob 与清单不同，必须是 T013 的合法修改/新文件——即
  // `git status` 显示该路径有改动；若 git status 干净却 blob 不同，
  // 说明清单与已提交内容不一致，是真失败。提交后重跑本脚本时工作区
  // 干净，全部文件都须与 HEAD blob 一致（严格模式自动生效）。
  const tracked = new Set(
    git('ls-tree -r --name-only HEAD', root)
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  // 注意：这里不用 git() 助手——它会对整段输出 .trim()，会吃掉第一行
  // porcelain 的前导状态空格（` M <路径>` 变 `M <路径>`），使 slice(3)
  // 错位。直接取原始输出再逐行切列。
  const dirty = new Set(
    execSync('git status --porcelain', { cwd: root, encoding: 'utf8' })
      .split('\n')
      .map((s) => {
        // porcelain 原始格式：`XY<空格><路径>`（X/Y 各 1 列，含前导空格时
        // 如 ` M <路径>`）；必须先按列切（slice(3)），再 trim，绝不能
        // 先 trim——会吃掉状态列导致路径错位。
        if (s === '') return '';
        const p = s.slice(3).trim();
        const arrow = p.indexOf(' -> ');
        return arrow >= 0 ? p.slice(arrow + 4) : p;
      })
      .filter(Boolean),
  );
  let headOk = 0;
  let headModified = 0;
  let headNotYet = 0;
  const headBad = [];
  for (const f of manifestFiles) {
    if (!tracked.has(f.path)) {
      headNotYet += 1;
      continue;
    }
    const blob = execFileSync('git', ['show', `HEAD:${f.path}`], { cwd: root });
    const sha = createHash('sha256').update(blob).digest('hex');
    if (sha === f.sha256 && blob.length === f.bytes) {
      headOk += 1;
    } else if (dirty.has(f.path)) {
      headModified += 1;
    } else {
      headBad.push(f.path);
    }
  }
  check(
    'manifest file hashes match git HEAD blobs',
    headBad.length === 0,
    `${headOk} in HEAD OK, ${headModified} modified vs HEAD (T013 changes, worktree-verified), ${headNotYet} not in HEAD yet (worktree-only, pre-commit)` +
      (headBad.length ? `; bad: ${headBad.join(', ')}` : ''),
    failures,
  );

  // 全部文件都已在 HEAD 时：git archive 新鲜归档，逐文件比对内容。
  if (headNotYet === 0 && headBad.length === 0) {
    const tmpArc = join(tmpdir(), `tablefork-arc-${process.pid}-${Date.now()}`);
    mkdirSync(tmpArc, { recursive: true });
    const arcZip = join(tmpArc, 'archive.zip');
    const pathspec = manifestFiles.map((f) => f.path);
    execFileSync(
      'git',
      ['archive', 'HEAD', '-o', arcZip, '--', ...pathspec],
      { cwd: root, stdio: 'pipe' },
    );
    const arcEntries = listZipEntries(arcZip).filter((e) => !e.endsWith('/'));
    // 注：git archive 会额外写 20 个目录条目（`artifacts/`、`src/core/` 等），
    // 确定性 ZIP 只含文件条目；比对时忽略目录条目，只比文件集合与内容。
    const listed = manifestFiles.map((f) => f.path).sort();
    const tmpArcEx = join(tmpArc, 'ex');
    extractZip(arcZip, tmpArcEx);
    let arcOk = 0;
    const arcBad = [];
    for (const f of manifestFiles) {
      const ex = join(tmpArcEx, ...f.path.split('/'));
      if (existsSync(ex) && sha256File(ex) === f.sha256) arcOk += 1;
      else arcBad.push(f.path);
    }
    check(
      'fresh git archive HEAD matches source zip contents',
      JSON.stringify(arcEntries) === JSON.stringify(listed) && arcBad.length === 0,
      `${arcOk}/${manifestFiles.length} files content-identical` +
        (arcBad.length ? `; bad: ${arcBad.slice(0, 5).join(', ')}` : ''),
      failures,
    );
  } else {
    console.log('[SKIP] fresh git archive comparison — not all manifest files are in HEAD yet');
  }

  // ---- (b) dist ZIP 与一次全新构建一致 ----
  if (existsSync(distZip) && manifest.dist_zip) {
    const st = statSync(distZip);
    check(
      'dist zip bytes+sha match manifest',
      st.size === manifest.dist_zip.bytes && sha256File(distZip) === manifest.dist_zip.sha256,
      `${st.size} bytes, sha256 ${sha256File(distZip).slice(0, 16)}…`,
      failures,
    );
    console.log('rebuilding (npm run build) for dist comparison…');
    try {
      execSync('npm run build', { cwd: root, stdio: 'pipe' });
    } catch {
      check('fresh rebuild succeeds', false, 'npm run build exit != 0', failures);
      console.log(`RESULT: FAIL (${failures.length} failing checks)`);
      return 1;
    }
    // 直接扫 dist/ 子树（文件相对路径）：
    const distList = [];
    const walkDist = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, e.name);
        const rel = relative(join(root, 'dist'), abs).split(sep).join('/');
        if (e.isDirectory()) walkDist(abs);
        else if (e.isFile()) distList.push(rel);
      }
    };
    walkDist(join(root, 'dist'));
    distList.sort();
    const tmpRebuilt = join(tmpdir(), `tablefork-rebuilt-${process.pid}-${Date.now()}.zip`);
    const rebuilt = deterministicZip(join(root, 'dist'), distList, tmpRebuilt);
    check(
      'dist zip == fresh build (deterministic re-zip, byte-identical)',
      rebuilt.sha256 === manifest.dist_zip.sha256 && rebuilt.bytes === manifest.dist_zip.bytes,
      `fresh: ${rebuilt.bytes} bytes, sha256 ${rebuilt.sha256.slice(0, 16)}…`,
      failures,
    );
    const distEntries = listZipEntries(distZip).sort();
    check(
      'dist zip entries == fresh dist/ files',
      JSON.stringify(distEntries) === JSON.stringify(distList),
      `${distEntries.length} entries`,
      failures,
    );
  }

  // ---- (d) REVIEW_PACK 各卷哈希与发布包一致 ----
  const reviewDir = join(root, 'review');
  const packFiles = readdirSync(reviewDir)
    .filter((n) => /^REVIEW_PACK_\d+\.md$/.test(n))
    .sort();
  check('review packs exist', packFiles.length > 0, `${packFiles.length} packs`, failures);
  const manifestPacks = new Map((manifest.review_packs ?? []).map((p) => [p.file, p]));
  let packsOk = 0;
  const packBad = [];
  const seenCode = new Map();
  const manifestByPath = new Map(manifestFiles.map((f) => [f.path, f]));
  for (const pack of packFiles) {
    const abs = join(reviewDir, pack);
    const sha = sha256File(abs);
    const mp = manifestPacks.get(pack);
    if (!mp || mp.sha256 !== sha || mp.bytes !== statSync(abs).size) {
      packBad.push(`${pack} (hash mismatch vs manifest)`);
      continue;
    }
    packsOk += 1;
    // 解析卷内文件块：### <path> + SHA-256: 行 + ```` 围栏全文。
    const text = readFileSync(abs, 'utf8');
    const blockRe = /^### (.+)$\nSHA-256: ([0-9a-f]{64})\nBytes: (\d+)\nLines: (\d+)\n\n````[^\n]*\n([\s\S]*?)^````$/gm;
    let m;
    while ((m = blockRe.exec(text)) !== null) {
      const [, p, shaInPack, bytesInPack, linesInPack, content] = m;
      const mf = manifestByPath.get(p);
      const contentSha = sha256Text(content);
      // 围栏捕获的内容总以一个换行结束；源文件本身若无末尾换行
      // （如 package.json、tsconfig.json），捕获内容会多一个换行——
      // 两种候选都算，任一与清单一致即通过（块头 SHA-256 是权威值，
      // 生成时直接取自源文件，见打包步骤）。
      const contentOk =
        contentSha === (mf === undefined ? '' : mf.sha256) ||
        (content.endsWith('\n') &&
          sha256Text(content.slice(0, -1)) === (mf === undefined ? '' : mf.sha256));
      if (!mf) {
        packBad.push(`${pack}: block ${p} not in manifest`);
        continue;
      }
      if (shaInPack !== mf.sha256 || !contentOk) {
        packBad.push(`${pack}: block ${p} sha mismatch (header ${shaInPack.slice(0, 8)}…, content ${contentSha.slice(0, 8)}…, manifest ${mf.sha256.slice(0, 8)}…)`);
        continue;
      }
      if (Number(bytesInPack) !== mf.bytes) {
        packBad.push(`${pack}: block ${p} bytes mismatch`);
        continue;
      }
      if (seenCode.has(p)) {
        packBad.push(`${pack}: ${p} duplicated (also in ${seenCode.get(p)})`);
        continue;
      }
      seenCode.set(p, pack);
      void linesInPack;
    }
  }
  check(
    'review pack hashes match manifest',
    packBad.length === 0 && packsOk === packFiles.length,
    `${packsOk}/${packFiles.length} packs OK` +
      (packBad.length ? `; bad: ${packBad.slice(0, 5).join('; ')}` : ''),
    failures,
  );
  const codeFiles = manifestFiles.filter((f) => isCodeTextFile(f.path)).map((f) => f.path);
  const unpacked = codeFiles.filter((p) => !seenCode.has(p));
  check(
    'every code text file appears in exactly one pack',
    unpacked.length === 0,
    `${seenCode.size}/${codeFiles.length} code files packed` +
      (unpacked.length ? `; unpacked: ${unpacked.join(', ')}` : ''),
    failures,
  );
  // REVIEW_INDEX.md 分卷表与各卷实测一致。
  const indexPath = join(reviewDir, 'REVIEW_INDEX.md');
  if (existsSync(indexPath)) {
    const indexText = readFileSync(indexPath, 'utf8');
    let indexOk = true;
    const indexBad = [];
    for (const pack of packFiles) {
      const sha = sha256File(join(reviewDir, pack));
      const rowRe = new RegExp(`^\\| ${pack.replace('.', '\\.')} \\| \\d+ \\| \\d+ \\| ${sha} \\|$`, 'm');
      if (!rowRe.test(indexText)) {
        indexOk = false;
        indexBad.push(pack);
      }
    }
    check(
      'REVIEW_INDEX pack table matches pack hashes',
      indexOk,
      indexBad.length ? `mismatch: ${indexBad.join(', ')}` : `${packFiles.length} packs listed`,
      failures,
    );
  } else {
    check('REVIEW_INDEX exists', false, 'review/REVIEW_INDEX.md 缺失', failures);
  }

  console.log(`RESULT: ${failures.length === 0 ? 'PASS' : 'FAIL'} (${failures.length} failing checks)`);
  if (failures.length) console.log(`failing: ${failures.join('; ')}`);
  return failures.length === 0 ? 0 : 1;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  process.exitCode = runChecks();
}
````

### tsconfig.json
SHA-256: 7d7066e7450ecd752e62f5ee0faefc3ac7a477fa8a7242aa5f0974e3c1049ab3
Bytes: 490
Lines: 1

````json
{"compilerOptions":{"allowImportingTsExtensions":true,"forceConsistentCasingInFileNames":true,"isolatedModules":true,"jsx":"react-jsx","lib":["ES2022","DOM","DOM.Iterable"],"module":"ESNext","moduleDetection":"force","moduleResolution":"bundler","noEmit":true,"noFallthroughCasesInSwitch":true,"noUnusedLocals":true,"noUnusedParameters":true,"skipLibCheck":true,"strict":true,"target":"ES2022","useDefineForClassFields":true},"include":["src","cli","vite.config.ts","playwright.config.ts"]}
````

### vite.config.ts
SHA-256: 2f82a0c9cac555c7a376b3babe9203b4c74a88194be36c5e0847cca0a9cfd3c2
Bytes: 218
Lines: 7

````ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// P029 TableFork — T001 scaffold. No remote fonts, no CDN, no external assets.
export default defineConfig({
  plugins: [react()],
});
````

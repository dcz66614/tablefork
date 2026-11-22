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

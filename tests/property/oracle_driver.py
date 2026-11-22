#!/usr/bin/env python3
"""P029-T011 property-test oracle driver (test support, NOT production code).

Reads a JSONL file of {"seed": int, "html": str} lines, runs the independent
Python Oracle (oracle/reference.py, imported by path — no Node/TS involved)
once per line via its analyse() entry point, and writes a JSONL file of
{"seed": int, "result": <analyse() dict>} or {"seed": int, "error": {"code": str}}
lines. analyse() computes both strategies in one call.

This driver is only a transport: it adds no semantics of its own. Any
unexpected Python exception is reported as {"seed", "oracle_error": str}
so it can never silently pass as agreement.
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path


def load_oracle():
    here = Path(__file__).resolve()
    ref_path = here.parent.parent.parent / "oracle" / "reference.py"
    spec = importlib.util.spec_from_file_location("t011_oracle_ref", ref_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main(argv=None):
    parser = argparse.ArgumentParser(description="P029-T011 oracle batch driver.")
    parser.add_argument("--input", required=True, help="input JSONL (seed, html)")
    parser.add_argument("--output", required=True, help="output JSONL")
    args = parser.parse_args(argv)

    ref = load_oracle()
    rows = []
    with Path(args.input).open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    out_lines = []
    for row in rows:
        seed = row["seed"]
        html = row["html"]
        try:
            result = ref.analyse(html, "ORIGIN_EMPTY")
            out_lines.append({"seed": seed, "result": result})
        except ref.TableForkError as exc:
            out_lines.append({"seed": seed, "error": {"code": exc.code}})
        except Exception as exc:  # oracle bug: never a PASS
            out_lines.append({"seed": seed, "oracle_error": "%s: %s" % (type(exc).__name__, exc)})
    with Path(args.output).open("w", encoding="utf-8") as fh:
        for item in out_lines:
            fh.write(json.dumps(item, ensure_ascii=False) + "\n")
    print("%d cases analysed" % len(out_lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())

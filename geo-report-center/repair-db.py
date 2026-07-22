#!/usr/bin/env python3
"""Repair / compact db.json so the browser can load it.

Fixes common import issues:
  - Python NaN / Infinity tokens (invalid in browser JSON.parse)
  - Pretty-print bloat (rewrites compact)

Usage:
  python repair-db.py
  python repair-db.py "C:\\...\\UItimate Geo Program\\db.json"
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path


def scrub_text(raw: str) -> tuple[str, int]:
    """Replace non-JSON number tokens Python sometimes emits."""
    n = 0

    def repl(m: re.Match) -> str:
        nonlocal n
        n += 1
        return "null"

    cleaned = re.sub(r"\b-?Infinity\b|\bNaN\b", repl, raw)
    return cleaned, n


def scrub_obj(obj):
    """Recursively turn float nan/inf into None."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, list):
        return [scrub_obj(x) for x in obj]
    if isinstance(obj, dict):
        return {k: scrub_obj(v) for k, v in obj.items()}
    return obj


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "db.json").expanduser().resolve()
    if not path.is_file():
        print(f"Not found: {path}", file=sys.stderr)
        return 1

    before = path.stat().st_size
    raw = path.read_text(encoding="utf-8", errors="replace")
    cleaned, n_tok = scrub_text(raw)
    print(f"File: {path}")
    print(f"Size before: {before/1024/1024:.2f} MB")
    if n_tok:
        print(f"Replaced {n_tok} invalid NaN/Infinity token(s) with null")

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        print("PARSE FAIL:", e, file=sys.stderr)
        print(
            "The file is truncated or corrupt. Re-run import-geo-zips.bat "
            "(do not open/edit db.json in Word/Notepad while importing).",
            file=sys.stderr,
        )
        # Show nearby context
        pos = getattr(e, "pos", None)
        if pos is not None:
            lo, hi = max(0, pos - 60), min(len(cleaned), pos + 60)
            print("Near error:", repr(cleaned[lo:hi]), file=sys.stderr)
        return 1

    if not isinstance(data, dict) or not isinstance(data.get("borings"), list):
        print("Not a DelDOT GeoTrak db.json (need { borings: [...] })", file=sys.stderr)
        return 1

    data = scrub_obj(data)
    try:
        payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    except ValueError as e:
        print("Still contains non-JSON numbers:", e, file=sys.stderr)
        return 1

    bak = path.with_suffix(".json.bak")
    if not bak.exists():
        bak.write_text(raw, encoding="utf-8")
        print(f"Backup: {bak.name}")

    path.write_text(payload, encoding="utf-8")
    after = len(payload.encode("utf-8"))
    n = len(data["borings"])
    mapped = sum(
        1
        for b in data["borings"]
        if isinstance(b.get("lat"), (int, float)) and isinstance(b.get("lon"), (int, float))
    )
    print(f"Rewrote db.json OK")
    print(f"  borings: {n}  mapped: {mapped}")
    print(f"  size: {before/1024/1024:.2f} MB → {after/1024/1024:.2f} MB")
    print("Next: open Geo_Report_Center.html (v0.6+) → Open project folder")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

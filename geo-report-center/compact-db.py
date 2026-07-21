#!/usr/bin/env python3
"""Rewrite db.json as compact JSON (much smaller / faster for the browser).

Usage:
  python compact-db.py
  python compact-db.py "C:\\Ultimate Geo Program\\db.json"
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "db.json").expanduser().resolve()
    if not path.is_file():
        print(f"Not found: {path}", file=sys.stderr)
        return 1
    before = path.stat().st_size
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("borings"), list):
        print("db.json does not look like Geo Report Center format (need object with borings[])", file=sys.stderr)
        return 1
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    path.write_text(payload, encoding="utf-8")
    after = len(payload.encode("utf-8"))
    n = len(data["borings"])
    mapped = sum(1 for b in data["borings"] if b.get("lat") is not None and b.get("lon") is not None)
    print(f"Rewrote {path}")
    print(f"  borings: {n} ({mapped} with coordinates)")
    print(f"  size: {before/1024/1024:.1f} MB → {after/1024/1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

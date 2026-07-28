#!/usr/bin/env python3
"""Remove borings mapped outside Delaware from db.json.

Usage:
  python purge-outside-de.py
  python purge-outside-de.py "C:\\...\\db.json"
  python purge-outside-de.py db.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Simplified DE outline (lon, lat) — same as app
DE_RING = [
    (-75.789, 39.720),
    (-75.750, 39.839),
    (-75.550, 39.830),
    (-75.400, 39.750),
    (-75.200, 39.550),
    (-75.080, 39.300),
    (-75.040, 38.900),
    (-75.070, 38.451),
    (-75.300, 38.451),
    (-75.550, 38.500),
    (-75.720, 38.700),
    (-75.789, 39.000),
    (-75.789, 39.720),
]


def point_in_ring(lon: float, lat: float, ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def in_delaware(lat, lon) -> bool:
    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return False
    if lat < 38.40 or lat > 39.90 or lon < -75.85 or lon > -74.95:
        return False
    return point_in_ring(lon, lat, DE_RING)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("db", nargs="?", default="db.json")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    path = Path(args.db).expanduser().resolve()
    data = json.loads(path.read_text(encoding="utf-8"))
    borings = data.get("borings") or []
    bad = [b for b in borings if b.get("lat") is not None and b.get("lon") is not None and not in_delaware(b["lat"], b["lon"])]
    print(f"Total borings: {len(borings)}")
    print(f"Outside DE:    {len(bad)}")
    for b in bad[:20]:
        print(f"  {b.get('job')}/{b.get('b')}  {b.get('lat')}, {b.get('lon')}")
    if len(bad) > 20:
        print(f"  … {len(bad)-20} more")
    if args.dry_run or not bad:
        return 0
    keep = [b for b in borings if b.get("lat") is None or b.get("lon") is None or in_delaware(b["lat"], b["lon"])]
    data["borings"] = keep
    bak = path.with_suffix(".json.bak")
    if not bak.exists():
        bak.write_bytes(path.read_bytes())
        print(f"Backup: {bak}")
    path.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False), encoding="utf-8")
    print(f"Wrote {path} — {len(keep)} borings remain")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

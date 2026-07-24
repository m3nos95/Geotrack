#!/usr/bin/env python3
"""
Build statewide mukey / soils analogs from feature-store.csv (Step 2).

Groups DelDOT borings by NRCS mapunit (mukey) and summarizes lab + infil
priors so similar map signatures elsewhere in Delaware can inherit them.

Usage (from project folder with feature-store.csv):
  python build-mukey-priors.py
  python build-mukey-priors.py . --csv feature-store.csv --out refs/mukey_priors.json

Inputs:
  feature-store.csv  (from GeoTrak "Export feature store" or build-feature-store.py)

Outputs:
  refs/mukey_priors.json
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

MIN_N = 2  # minimum borings to publish a mukey prior


def num(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in ("none", "null", "nan"):
        return None
    try:
        x = float(s)
    except ValueError:
        return None
    if math.isnan(x) or math.isinf(x):
        return None
    return x


def txt(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def aashto_base(raw: str | None) -> str | None:
    if not raw:
        return None
    m = __import__("re").search(r"A-\d(?:-\d)?", str(raw).upper().replace(" ", ""))
    return m.group(0) if m else str(raw).upper().strip() or None


def median(vals: list[float]) -> float | None:
    if not vals:
        return None
    return round(statistics.median(vals), 3)


def mode_label(vals: list[str]) -> tuple[str | None, int]:
    clean = [v for v in vals if v]
    if not clean:
        return None, 0
    c = Counter(clean)
    lab, n = c.most_common(1)[0]
    return lab, n


def infil_mid(row: dict) -> float | None:
    lo = num(row.get("infil_min_in_hr"))
    hi = num(row.get("infil_max_in_hr"))
    if lo is not None and hi is not None:
        return round((lo + hi) / 2.0, 3)
    mid = num(row.get("infil_design_mid_in_hr"))
    if mid is not None:
        # design mid is ÷2.5 — restore screening mid for analog
        return round(mid * 2.5, 3)
    return lo if lo is not None else hi


def summarize(rows: list[dict], key: str) -> dict:
    aash, uscs, hyd = [], [], []
    p200s, infils, ns = [], [], []
    soil_names, geos = [], []
    for r in rows:
        a = aashto_base(txt(r.get("aashto_dom")) or txt(r.get("nrcs_aashto")))
        # Prefer lab AASHTO over NRCS when both present
        lab_a = aashto_base(txt(r.get("aashto_dom")))
        if lab_a:
            aash.append(lab_a)
        u = txt(r.get("uscs_dom")) or txt(r.get("nrcs_uscs"))
        lab_u = txt(r.get("uscs_dom"))
        if lab_u:
            uscs.append(lab_u.upper().replace(" ", ""))
        h = txt(r.get("soil_hydgrp"))
        if h:
            hyd.append(h.upper())
        p = num(r.get("p200_median"))
        if p is not None:
            p200s.append(p)
        im = infil_mid(r)
        if im is not None:
            infils.append(im)
        n5 = num(r.get("n_min_upper5"))
        if n5 is not None:
            ns.append(n5)
        sn = txt(r.get("soil_name"))
        if sn:
            soil_names.append(sn)
        g = txt(r.get("geology"))
        if g:
            geos.append(g)

    a_dom, a_n = mode_label(aash)
    u_dom, u_n = mode_label(uscs)
    h_dom, h_n = mode_label(hyd)
    name_dom, _ = mode_label(soil_names)
    geo_dom, _ = mode_label(geos)

    n = len(rows)
    conf = "high" if n >= 12 else ("medium" if n >= 5 else "low")
    return {
        "key": key,
        "n": n,
        "confidence": conf,
        "soil_name": name_dom,
        "soil_hydgrp": h_dom,
        "geology": geo_dom,
        "aashto_dom": a_dom,
        "aashto_support": a_n,
        "uscs_dom": u_dom,
        "uscs_support": u_n,
        "p200_median": median(p200s),
        "p200_n": len(p200s),
        "infil_mid_in_hr": median(infils),
        "infil_n": len(infils),
        "n_min_upper5_median": median(ns),
        "n_support": len(ns),
    }


def load_rows(csv_path: Path) -> list[dict]:
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def main() -> int:
    ap = argparse.ArgumentParser(description="Build mukey / soils analogs from feature-store.csv")
    ap.add_argument("project", nargs="?", default=".", help="Project folder")
    ap.add_argument("--csv", default="feature-store.csv", help="Input feature-store CSV")
    ap.add_argument("--out", default="refs/mukey_priors.json", help="Output JSON path")
    ap.add_argument("--min-n", type=int, default=MIN_N, help="Min borings per mukey prior")
    args = ap.parse_args()

    root = Path(args.project).expanduser().resolve()
    csv_path = Path(args.csv)
    if not csv_path.is_absolute():
        csv_path = root / csv_path
    if not csv_path.is_file():
        print(f"Missing {csv_path}", file=sys.stderr)
        print("Export feature-store.csv from GeoTrak (or run build-feature-store.py) first.", file=sys.stderr)
        return 1

    rows = load_rows(csv_path)
    print(f"Loaded {len(rows)} feature-store rows from {csv_path.name}")

    by_mukey: dict[str, list[dict]] = defaultdict(list)
    by_hyd_geo: dict[str, list[dict]] = defaultdict(list)
    skipped_mukey = 0
    for r in rows:
        mukey = txt(r.get("soil_mukey")) or txt(r.get("mukey"))
        if mukey:
            by_mukey[mukey].append(r)
        else:
            skipped_mukey += 1
        hyd = (txt(r.get("soil_hydgrp")) or "?").upper()
        geo = txt(r.get("geology")) or "unknown"
        by_hyd_geo[f"{hyd}|{geo}"].append(r)

    min_n = max(1, int(args.min_n))
    mukey_priors = {}
    for k, group in sorted(by_mukey.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        if len(group) < min_n:
            continue
        mukey_priors[k] = summarize(group, k)

    hyd_geo_priors = {}
    for k, group in sorted(by_hyd_geo.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        if len(group) < min_n:
            continue
        hyd_geo_priors[k] = summarize(group, k)

    out = {
        "type": "deldot_mukey_priors",
        "version": 1,
        "source_csv": csv_path.name,
        "n_borings": len(rows),
        "n_mukeys": len(mukey_priors),
        "n_hyd_geo": len(hyd_geo_priors),
        "min_n": min_n,
        "disclaimer": "Screening analogs only — DelDOT boring lab/class priors transferred by NRCS mapunit. Not sealed design.",
        "by_mukey": mukey_priors,
        "by_hydgrp_geology": hyd_geo_priors,
    }

    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = root / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Wrote {out_path}")
    print(f"  mukey priors: {len(mukey_priors)} (skipped rows without mukey: {skipped_mukey})")
    print(f"  HYDGRP|geology priors: {len(hyd_geo_priors)}")
    if mukey_priors:
        top = sorted(mukey_priors.values(), key=lambda p: -p["n"])[:8]
        print("  Top mukeys by support:")
        for p in top:
            print(
                f"    {p['key']}: n={p['n']}  AASHTO={p.get('aashto_dom') or '—'}  "
                f"P200={p.get('p200_median')}  infil_mid={p.get('infil_mid_in_hr')}  "
                f"{(p.get('soil_name') or '')[:40]}"
            )
    print("Copy/keep under refs/ and re-open the project folder in GeoTrak.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

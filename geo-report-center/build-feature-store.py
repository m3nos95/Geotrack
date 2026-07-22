#!/usr/bin/env python3
"""
Build a per-boring feature store from db.json + refs/*.json

Joins each mapped boring to geology, soils (HYDGRP), recharge/WRPA, quad/county
and summarizes lab fields. Adds a screening infiltration band from HYDGRP.

Usage (from Ultimate Geo Program / UItimate Geo Program folder):
  python build-feature-store.py
  python build-feature-store.py . --out feature-store.csv

Outputs:
  feature-store.csv
  feature-store.json   (same rows)
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
from pathlib import Path

# Screening infiltration bands (in/hr) by NRCS hydrologic soil group.
# Informational only — not a design value.
INFIL_BANDS = {
    "A": (0.30, 0.60, "high — typically sands/gravels"),
    "B": (0.15, 0.30, "moderate — sandy loams"),
    "C": (0.05, 0.15, "slow — silty / finer soils"),
    "D": (0.00, 0.05, "very slow — clay / high water table"),
}


def sp_to_none(v):
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def pip_ring(pt, ring) -> bool:
    x, y = pt
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def pip_feature(pt, geom) -> bool:
    if not geom:
        return False
    t = geom.get("type")
    if t == "Polygon":
        rings = geom.get("coordinates") or []
        if not rings or not pip_ring(pt, rings[0]):
            return False
        for hole in rings[1:]:
            if pip_ring(pt, hole):
                return False
        return True
    if t == "MultiPolygon":
        for poly in geom.get("coordinates") or []:
            if not poly:
                continue
            if not pip_ring(pt, poly[0]):
                continue
            if any(pip_ring(pt, hole) for hole in poly[1:]):
                continue
            return True
    return False


def bbox_of(geom):
    x0 = y0 = 1e9
    x1 = y1 = -1e9

    def scan(cs):
        nonlocal x0, y0, x1, y1
        for c in cs:
            if isinstance(c[0], (list, tuple)):
                scan(c)
            else:
                x0 = min(x0, c[0])
                x1 = max(x1, c[0])
                y0 = min(y0, c[1])
                y1 = max(y1, c[1])

    if not geom or "coordinates" not in geom:
        return None
    scan(geom["coordinates"])
    return [x0, y0, x1, y1]


def detect_kind(name: str, gj: dict) -> str:
    n = name.lower()
    feats = gj.get("features") or []
    p = (feats[0].get("properties") or {}) if feats else {}
    keys = [k.lower() for k in p.keys()]
    if "piedmont" in n:
        return "geology_piedmont"
    if "offshore" in n:
        return "geology_offshore"
    if re.search(r"surficial|geology_0|geology_\d", n) and not re.search(r"piedmont|offshore|soil", n):
        return "geology_surficial"
    if "geol" in n and not re.search(r"soil|wrpa|recharge", n):
        return "geology_surficial"
    if re.search(r"dnrec_gmz|gmz|groundwater_management", n):
        return "gmz"
    if re.search(r"wellhead_protection|dnrec_wellhead", n):
        return "wellhead"
    if re.search(r"septic_soil_boring|septic_boring", n) or "percrate" in keys:
        return "septic_boring"
    if re.search(r"septic_site_eval|site_eval", n):
        return "septic_eval"
    if re.search(r"soil_feasibility|feasibility", n):
        return "feasibility"
    if "septic_permit" in n:
        return "septic_permit"
    if re.search(r"nonpublic_well|dda_gw|monitor", n) or "dgsid" in keys or "welltype" in keys:
        return "well"
    if "wetland" in n:
        return "wetland"
    if re.search(r"flood_fema|dfirm", n) or ("flood" in n and "wrpa_flood" not in n and "floodplain" not in n):
        return "flood"
    if "taxditch" in n:
        return "taxditch"
    if re.search(r"watershed|huc12", n):
        return "watershed"
    if re.search(r"hydro_river|hydro_lake|tidal_buffer", n):
        return "hydrography"
    if re.search(r"coastal|inundation", n):
        return "coastal"
    if re.search(r"lulc|land.?use", n):
        return "lulc"
    if "irrigated" in n:
        return "irrigated"
    if re.search(r"roads_|bridge", n):
        return "road"
    if re.search(r"assets_|lightpost|overhead_sign", n):
        return "asset"
    if re.search(r"landfill|biosolid|ust|lust|rcra|rs_sites|industrial_storm|sussex_landfill", n):
        return "env_site"
    if re.search(r"recharge_ks|recharge", n) and "wrpa" not in n:
        return "recharge"
    if re.search(r"wrpa|cockeysville|wellhead|erosion|floodplain|class_b|class_c|hoops|newark", n):
        return "wrpa"
    if "soil" in n or any(re.search(r"muname|musym|areasymbol|drainagecl|hydgrp", k) for k in keys):
        return "soils"
    if "quad" in n or "quadid" in p or "QUADID" in p:
        return "quad"
    if re.search(r"boundar|count(y|ies)|muni", n):
        return "boundary"
    return "layer"


def prop(props: dict, cands) -> str | None:
    if not props:
        return None
    keys = list(props.keys())
    for c in cands:
        for k in keys:
            if k.lower() == c.lower() and props[k] is not None and str(props[k]).strip():
                return str(props[k]).strip()
    return None


def load_refs(ref_dir: Path) -> list[dict]:
    refs: list[dict] = []
    if not ref_dir.is_dir():
        return refs
    files = sorted(
        [p for p in ref_dir.iterdir() if p.suffix.lower() in (".json", ".geojson")],
        key=lambda p: p.name.lower(),
    )
    for path in files:
        try:
            gj = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  skip {path.name}: {e}", file=sys.stderr)
            continue
        if gj.get("type") != "FeatureCollection" or not isinstance(gj.get("features"), list):
            continue
        feats = [
            f
            for f in gj["features"]
            if f.get("geometry") and f["geometry"].get("type") in ("Polygon", "MultiPolygon")
        ]
        if not feats:
            continue
        for f in feats:
            f["_bb"] = bbox_of(f["geometry"])
        base = re.sub(r"[_-]?\d+\.(geo)?json$", "", path.name, flags=re.I)
        base = re.sub(r"\.(geo)?json$", "", base, flags=re.I)
        existing = next((r for r in refs if r["base"] == base), None)
        if existing:
            existing["features"].extend(feats)
            existing["count"] = len(existing["features"])
        else:
            refs.append(
                {
                    "name": base,
                    "base": base,
                    "kind": detect_kind(path.name, {"features": feats}),
                    "features": feats,
                    "count": len(feats),
                }
            )
        print(f"  loaded {path.name}: {len(feats)} polys → {base} [{detect_kind(path.name, {'features': feats})}]")
    return refs


def query_refs(refs, lat: float, lon: float) -> list[dict]:
    pt = [lon, lat]
    out = []
    for R in refs:
        for f in R["features"]:
            bb = f.get("_bb")
            if bb and (lon < bb[0] or lon > bb[2] or lat < bb[1] or lat > bb[3]):
                continue
            if pip_feature(pt, f.get("geometry")):
                out.append({"layer": R["name"], "kind": R["kind"], "props": f.get("properties") or {}})
                break
    return out


def lab_stats(samples: list) -> dict:
    samples = samples or []
    nums = []
    p200s = []
    nms = []
    aash = []
    for s in samples:
        if isinstance(s.get("num"), int) or (isinstance(s.get("num"), str) and str(s["num"]).isdigit()):
            nums.append(s)
        if s.get("p200") is not None:
            try:
                p200s.append(float(s["p200"]))
            except (TypeError, ValueError):
                pass
        if s.get("nm") is not None:
            try:
                nms.append(float(s["nm"]))
            except (TypeError, ValueError):
                pass
        if s.get("aashto"):
            aash.append(str(s["aashto"]))
        if s.get("n") is not None and s.get("d") is not None:
            pass
    n_upper = [
        int(s["n"])
        for s in samples
        if s.get("n") is not None and s.get("d") is not None and float(s["d"]) <= 5
    ]
    n_all = [int(s["n"]) for s in samples if s.get("n") is not None]
    # dominant aashto base
    bases = []
    for a in aash:
        m = re.match(r"(A-\d(?:-\d)?)", a.upper().replace(" ", ""))
        bases.append(m.group(1) if m else a.upper())
    dom = max(set(bases), key=bases.count) if bases else None
    return {
        "n_samples": len(samples),
        "p200_median": round(sorted(p200s)[len(p200s) // 2], 1) if p200s else None,
        "p200_max": round(max(p200s), 1) if p200s else None,
        "nm_min": round(min(nms), 1) if nms else None,
        "nm_max": round(max(nms), 1) if nms else None,
        "n_min_upper5": min(n_upper) if n_upper else None,
        "n_min": min(n_all) if n_all else None,
        "aashto_dom": dom,
    }


def hydgrp_letter(raw: str | None) -> str | None:
    if not raw:
        return None
    m = re.search(r"\b([ABCD])(?:\s*/\s*([ABCD]))?\b", raw.upper())
    if not m:
        return None
    # dual group A/D etc. — use first (drained) for screening, note dual
    return m.group(1)


# DNREC BMP Appendix 1 §II.A.4 — FoS 2.5 for cased borehole / undersized rings
DNREC_BOREHOLE_FOS = 2.5


def apply_dnrec_design_fos(lo: float | None, hi: float | None) -> dict:
    if lo is None and hi is None:
        return {
            "infil_design_min_in_hr": None,
            "infil_design_max_in_hr": None,
            "infil_design_mid_in_hr": None,
            "infil_fos": DNREC_BOREHOLE_FOS,
        }
    dlo = None if lo is None else round(lo / DNREC_BOREHOLE_FOS, 3)
    dhi = None if hi is None else round(hi / DNREC_BOREHOLE_FOS, 3)
    if lo is not None and hi is not None:
        mid = round(((lo + hi) / 2) / DNREC_BOREHOLE_FOS, 3)
    else:
        mid = dlo if dlo is not None else dhi
    return {
        "infil_design_min_in_hr": dlo,
        "infil_design_max_in_hr": dhi,
        "infil_design_mid_in_hr": mid,
        "infil_fos": DNREC_BOREHOLE_FOS,
    }


def infil_from_hydgrp(hydgrp: str | None, p200_median: float | None, aashto: str | None) -> dict:
    letter = hydgrp_letter(hydgrp)
    if not letter or letter not in INFIL_BANDS:
        return {
            "infil_min_in_hr": None,
            "infil_max_in_hr": None,
            "infil_note": "no HYDGRP — cannot estimate from soils map",
            "infil_confidence": "none",
            **apply_dnrec_design_fos(None, None),
        }
    lo, hi, note = INFIL_BANDS[letter]
    conf = "map_only"
    adj = []
    if p200_median is not None:
        conf = "map+lab"
        if p200_median >= 50:
            hi = min(hi, (lo + hi) / 2)
            adj.append(f"P200 med {p200_median}% → favor lower end")
        elif p200_median <= 15:
            lo = max(lo, (lo + hi) / 2)
            adj.append(f"P200 med {p200_median}% → favor higher end")
    if aashto:
        au = aashto.upper()
        if au.startswith("A-1") or au.startswith("A-3"):
            lo = max(lo, INFIL_BANDS["B"][0])
            adj.append(f"AASHTO {aashto} suggests coarser")
        if au.startswith("A-6") or au.startswith("A-7"):
            hi = min(hi, INFIL_BANDS["C"][1])
            adj.append(f"AASHTO {aashto} suggests finer")
    if "/" in (hydgrp or ""):
        adj.append(f"dual HYDGRP {hydgrp} — drained letter {letter} used")
        conf = "low"
    lo_r, hi_r = round(lo, 3), round(hi, 3)
    return {
        "infil_min_in_hr": lo_r,
        "infil_max_in_hr": hi_r,
        "infil_note": note + (("; " + "; ".join(adj)) if adj else ""),
        "infil_confidence": conf,
        **apply_dnrec_design_fos(lo_r, hi_r),
    }


def enrich_boring(b: dict, hits: list[dict]) -> dict:
    geo_order = {"geology_piedmont": 0, "geology_surficial": 1, "geology_offshore": 2}
    geo_hits = [h for h in hits if str(h["kind"]).startswith("geology_")]
    geo_hits.sort(key=lambda h: geo_order.get(h["kind"], 9))
    geo_name = geo_desc = geo_kind = None
    if geo_hits:
        H = geo_hits[0]
        geo_kind = H["kind"]
        geo_name = prop(H["props"], ["NAME", "UNIT_NAME", "GEO_UNIT", "FEATURE", "UNIT", "LABEL"])
        geo_desc = prop(H["props"], ["DESCRIPTION", "DESC", "DEFINITION"])

    rech = None
    wrpa = []
    soil_name = soil_hydgrp = soil_drain = None
    quad = county = None
    for H in hits:
        k = H["kind"]
        if k == "recharge" and not rech:
            rech = prop(H["props"], ["RECHARGE", "CLASS", "POTENTIAL", "NAME"])
        if k == "wrpa":
            label = prop(H["props"], ["NAME", "LABEL", "FEATURE", "TYPE", "ZONE", "CLASS"]) or H["layer"]
            if label not in wrpa:
                wrpa.append(label)
        if k == "soils" and not soil_name:
            soil_name = prop(H["props"], ["MUNAME", "MUSYM", "NAME"])
            soil_hydgrp = prop(H["props"], ["HYDGRP", "HYDROGROUP", "HSG"])
            soil_drain = prop(H["props"], ["DRAINAGECL", "DRAINAGE"])
        if k == "quad" and not quad:
            quad = prop(H["props"], ["NAME", "QUADID"])
        if k == "boundary" and not county:
            c = prop(H["props"], ["NAME", "COUNTY", "COUNTY_NAME", "LABEL"])
            if c and re.search(r"kent|sussex|new castle|delaware", c, re.I):
                county = c

    lab = lab_stats(b.get("s") or [])
    infil = infil_from_hydgrp(soil_hydgrp, lab["p200_median"], lab["aashto_dom"])
    return {
        "job": b.get("job"),
        "boring": b.get("b"),
        "lat": b.get("lat"),
        "lon": b.get("lon"),
        "e": b.get("e"),
        "n": b.get("n"),
        "eob": b.get("eob"),
        "geology_kind": geo_kind,
        "geology": geo_name,
        "geology_desc": (geo_desc[:160] + "…") if geo_desc and len(geo_desc) > 160 else geo_desc,
        "recharge": rech,
        "wrpa": "; ".join(wrpa) if wrpa else None,
        "soil_name": soil_name,
        "soil_hydgrp": soil_hydgrp,
        "soil_drainage": soil_drain,
        "quad": quad,
        "county": county,
        **lab,
        **infil,
        "ref_hits": len(hits),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Build boring feature store + screening infiltration")
    ap.add_argument("project", nargs="?", default=".", help="Project folder (has db.json + refs/)")
    ap.add_argument("--out", default="feature-store.csv", help="CSV output path")
    args = ap.parse_args()
    root = Path(args.project).expanduser().resolve()
    db_path = root / "db.json"
    ref_dir = root / "refs"
    if not db_path.is_file():
        print(f"Missing {db_path}", file=sys.stderr)
        return 1

    print(f"Loading {db_path}…")
    db = json.loads(db_path.read_text(encoding="utf-8"))
    borings = [b for b in (db.get("borings") or []) if b.get("lat") is not None and b.get("lon") is not None]
    print(f"  {len(borings)} mapped borings")

    print(f"Loading refs from {ref_dir}…")
    refs = load_refs(ref_dir)
    if not refs:
        print("WARNING: no reference layers — geology/soils/recharge will be blank", file=sys.stderr)
    else:
        print(f"  {len(refs)} layer groups")

    rows = []
    for i, b in enumerate(borings, 1):
        hits = query_refs(refs, float(b["lat"]), float(b["lon"]))
        rows.append(enrich_boring(b, hits))
        if i % 500 == 0 or i == len(borings):
            print(f"  enriched {i}/{len(borings)}")

    out_csv = Path(args.out)
    if not out_csv.is_absolute():
        out_csv = root / out_csv
    out_json = out_csv.with_suffix(".json")

    fields = list(rows[0].keys()) if rows else [
        "job", "boring", "lat", "lon", "geology", "soil_hydgrp", "infil_min_in_hr", "infil_max_in_hr"
    ]
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if v is None else v) for k, v in r.items()})

    out_json.write_text(
        json.dumps({"count": len(rows), "disclaimer": "Screening only — not for design.", "rows": rows}, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )

    with_hyd = sum(1 for r in rows if r.get("soil_hydgrp"))
    with_infil = sum(1 for r in rows if r.get("infil_min_in_hr") is not None)
    print(f"\nWrote {out_csv} ({len(rows)} rows)")
    print(f"Wrote {out_json}")
    print(f"  with HYDGRP: {with_hyd}  with infil band: {with_infil}")
    print("Screening infiltration only — PE review required; does not replace site testing.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

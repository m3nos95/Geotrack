#!/usr/bin/env python3
"""
Download Delaware USDA–NRCS soil property tables (Soil Data Access) into refs/.

Joins to FirstMap Geology/DE_Soils polygons via SOILKEY ↔ mukey.

Usage:
  python download-nrcs-soil-props.py
  python download-nrcs-soil-props.py --out refs

Writes:
  refs/nrcs_de_by_mukey.json   (app lookup)
  refs/nrcs_de_by_mukey.csv    (spreadsheet)
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

SDA_URL = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest"

# Dominant major component + muaggatt engineering ratings + surface AASHTO/USCS/Ksat.
SQL = """
SELECT
  l.areasymbol, mu.mukey, mu.musym, mu.muname,
  c.compname, c.comppct_r, c.drainagecl, c.taxclname,
  maa.hydgrpdcd, maa.drclassdcd,
  maa.flodfreqdcd, maa.pondfreqprs,
  maa.aws025wta, maa.aws050wta,
  maa.brockdepmin, maa.wtdepannmin,
  maa.engdwobdcd, maa.engdwbdcd, maa.engsldcd, maa.englrsdcd,
  maa.engcmssdcd,
  (SELECT TOP 1 ch.ksat_r FROM chorizon ch
    WHERE ch.cokey = c.cokey ORDER BY ch.hzdept_r) AS ksat_r_surf,
  (SELECT TOP 1 ch.awc_r FROM chorizon ch
    WHERE ch.cokey = c.cokey ORDER BY ch.hzdept_r) AS awc_r_surf,
  (SELECT TOP 1 ca.aashtocl FROM chorizon ch
    INNER JOIN chaashto ca ON ca.chkey = ch.chkey
    WHERE ch.cokey = c.cokey
    ORDER BY ch.hzdept_r, ca.rvindicator DESC) AS aashto_surf,
  (SELECT TOP 1 cu.unifiedcl FROM chorizon ch
    INNER JOIN chunified cu ON cu.chkey = ch.chkey
    WHERE ch.cokey = c.cokey
    ORDER BY ch.hzdept_r, cu.rvindicator DESC) AS unified_surf,
  (SELECT TOP 1 cr.reskind FROM corestrictions cr
    WHERE cr.cokey = c.cokey ORDER BY cr.resdept_r) AS reskind,
  (SELECT TOP 1 cr.resdept_r FROM corestrictions cr
    WHERE cr.cokey = c.cokey ORDER BY cr.resdept_r) AS resdept_r
FROM legend l
INNER JOIN mapunit mu ON mu.lkey = l.lkey
INNER JOIN component c ON c.mukey = mu.mukey
LEFT JOIN muaggatt maa ON maa.mukey = mu.mukey
WHERE l.areasymbol LIKE 'DE%'
  AND c.majcompflag = 'Yes'
  AND c.comppct_r = (
    SELECT MAX(c2.comppct_r) FROM component c2
    WHERE c2.mukey = mu.mukey AND c2.majcompflag = 'Yes'
  )
ORDER BY l.areasymbol, mu.musym
"""

# µm/s → in/hr  (1 µm/s = 1e-6 m/s × 3600 × 39.3701 ≈ 0.141732 in/hr)
KSAT_UM_S_TO_IN_HR = 0.141732


def sda_query(sql: str) -> list[list]:
    body = urllib.parse.urlencode({"query": sql, "format": "JSON+COLUMNNAME"}).encode()
    req = urllib.request.Request(SDA_URL, data=body, method="POST")
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = json.loads(resp.read().decode("utf-8", "replace"))
    return raw.get("Table") or []


def cm_to_ft(v):
    if v is None or v == "":
        return None
    try:
        return round(float(v) / 30.48, 1)
    except (TypeError, ValueError):
        return None


def build_lookup(table: list[list]) -> dict[str, dict]:
    if not table:
        return {}
    hdr = [str(h) for h in table[0]]
    by: dict[str, dict] = {}
    for row in table[1:]:
        obj = {hdr[i]: row[i] for i in range(min(len(hdr), len(row)))}
        mukey = str(obj.get("mukey") or "").strip()
        if not mukey:
            continue
        ksat = obj.get("ksat_r_surf")
        ksat_inhr = None
        if ksat is not None and ksat != "":
            try:
                ksat_inhr = round(float(ksat) * KSAT_UM_S_TO_IN_HR, 4)
            except (TypeError, ValueError):
                pass
        by[mukey] = {
            "mukey": mukey,
            "areasymbol": obj.get("areasymbol"),
            "musym": obj.get("musym"),
            "muname": obj.get("muname"),
            "compname": obj.get("compname"),
            "comppct_r": obj.get("comppct_r"),
            "drainagecl": obj.get("drainagecl") or obj.get("drclassdcd"),
            "hydgrp": obj.get("hydgrpdcd"),
            "floodfreq": obj.get("flodfreqdcd"),
            "pondfreq": obj.get("pondfreqprs"),
            "ksat_um_s": obj.get("ksat_r_surf"),
            "ksat_in_hr": ksat_inhr,
            "awc": obj.get("awc_r_surf"),
            "aashto": obj.get("aashto_surf"),
            "uscs": obj.get("unified_surf"),
            "reskind": obj.get("reskind"),
            "resdept_cm": obj.get("resdept_r"),
            "resdept_ft": cm_to_ft(obj.get("resdept_r")),
            "wtdepannmin_cm": obj.get("wtdepannmin"),
            "wtdepannmin_ft": cm_to_ft(obj.get("wtdepannmin")),
            "eng_roads": obj.get("englrsdcd"),
            "eng_shallow_excav": obj.get("engsldcd"),
            "eng_dwellings": obj.get("engdwobdcd"),
            "eng_sand_source": obj.get("engcmssdcd"),
            "taxclname": obj.get("taxclname"),
        }
    return by


def main() -> int:
    ap = argparse.ArgumentParser(description="Download DE NRCS soil property lookup")
    ap.add_argument("--out", type=Path, default=Path("refs"), help="Output directory")
    args = ap.parse_args()
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)

    print("Querying NRCS Soil Data Access (DE%)…", flush=True)
    try:
        table = sda_query(SQL)
    except Exception as e:
        print(f"ERROR: SDA query failed: {e}", file=sys.stderr)
        return 1

    by = build_lookup(table)
    if not by:
        print("ERROR: empty result from SDA", file=sys.stderr)
        return 1

    payload = {
        "source": "NRCS Soil Data Access",
        "url": SDA_URL,
        "scope": "Delaware areasymbol LIKE 'DE%' — dominant major component",
        "n": len(by),
        "join": "FirstMap Geology/DE_Soils.SOILKEY ↔ mukey",
        "ksat_note": "ksat_in_hr converted from µm/s (surface horizon); screening only",
        "by_mukey": by,
    }
    jpath = out / "nrcs_de_by_mukey.json"
    jpath.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {jpath} ({jpath.stat().st_size:,} bytes, {len(by)} mukeys)")

    cols = [
        "mukey", "areasymbol", "musym", "muname", "compname", "comppct_r",
        "hydgrp", "drainagecl", "floodfreq", "pondfreq",
        "ksat_um_s", "ksat_in_hr", "awc", "aashto", "uscs",
        "reskind", "resdept_ft", "wtdepannmin_ft",
        "eng_roads", "eng_shallow_excav", "eng_dwellings", "eng_sand_source",
    ]
    cpath = out / "nrcs_de_by_mukey.csv"
    with cpath.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for mukey in sorted(by, key=lambda x: int(x) if str(x).isdigit() else str(x)):
            w.writerow(by[mukey])
    print(f"Wrote {cpath}")
    print("Open project folder in the app to load refs/nrcs_de_by_mukey.json.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

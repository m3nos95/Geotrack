#!/usr/bin/env python3
"""
Download DGS DGIR-adjacent borehole / geophysical log inventories into refs/dgir_wells.json.

Classic DGIR GeoServer (maps.dgs.udel.edu — lithsites / WellLog / Wellheader) is often
unreachable. Public ArcGIS Online FeatureServers from DGS NGGDPP data preservation publish
the same well headers + PDF/LAS/CSV links that the DGS Borehole Log Mapper uses.

Sources (UD / DGS AGOL org):
  - NGGDPP FY2022 borehole lithologic log PDFs (~3.7k points)
  - Geophysical Logs (gamma PDF/LAS/CSV) (~1.2k)
  - Century Logs (older geophys set; merged for any extra DGSID)

Usage (from geo-report-center / Ultimate Geo Program folder):
  python download-dgir-wells.py
  python download-dgir-wells.py --out refs/dgir_wells.json

Then Open project folder in GeoTrak so refs/dgir_wells.json loads.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

AGOL = "https://services.arcgis.com/DCPX1PuggGH4Tici/arcgis/rest/services"
PAGE = 2000

# (key, service path under AGOL, layer id, role)
SOURCES = [
    (
        "lith_nggdpp",
        "NGGDPP_FY_2022_BH_AGOL_20240531",
        0,
        "lith",
    ),
    (
        "lith_merged",
        "Borehole%20Logs",
        0,
        "lith",
    ),
    (
        "geophys",
        "Geophysical_Logs_13122024",
        0,
        "geophys",
    ),
    (
        "century",
        "Century_Logs",
        0,
        "geophys",
    ),
]

UA = "DelDOT-GeoTrak-dgir-wells/0.35 (+https://github.com/m3nos95/Geotrack)"


def fetch_json(url: str, retries: int = 4) -> dict:
    last: Exception | None = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"Failed {url}: {last}")


def num(v):
    if v is None or v == "":
        return None
    try:
        x = float(v)
        if x != x:  # NaN
            return None
        return x
    except (TypeError, ValueError):
        return None


def text(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def first_link(*vals):
    for v in vals:
        s = text(v)
        if s and s.lower().startswith("http"):
            return s
    return None


def query_all(service: str, layer: int) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        q = urllib.parse.urlencode(
            {
                "where": "1=1",
                "outFields": "*",
                "returnGeometry": "false",
                "resultOffset": str(offset),
                "resultRecordCount": str(PAGE),
                "f": "json",
            }
        )
        url = f"{AGOL}/{service}/FeatureServer/{layer}/query?{q}"
        data = fetch_json(url)
        if data.get("error"):
            raise RuntimeError(f"{service}: {data['error']}")
        feats = data.get("features") or []
        if not feats:
            break
        for ft in feats:
            attrs = ft.get("attributes") or {}
            rows.append(attrs)
        offset += len(feats)
        print(f"  {service}: {offset} …", flush=True)
        if len(feats) < PAGE or data.get("exceededTransferLimit") is False:
            if len(feats) < PAGE:
                break
        # ArcGIS often keeps transferring while exceededTransferLimit is true
        if not data.get("exceededTransferLimit", len(feats) >= PAGE):
            break
    return rows


def upsert_well(by_id: dict, attrs: dict, role: str, source: str) -> None:
    dgsid = text(attrs.get("DGSID") or attrs.get("dgsid"))
    if not dgsid:
        return
    lat = num(attrs.get("LATITUDE") or attrs.get("Latitude") or attrs.get("lat"))
    lon = num(attrs.get("LONGITUDE") or attrs.get("Longitude") or attrs.get("lon"))
    if lat is None or lon is None:
        return
    # guard flipped / string junk
    if not (38.4 <= lat <= 39.9 and -75.9 <= lon <= -74.95):
        return

    w = by_id.get(dgsid)
    if not w:
        w = {
            "id": dgsid,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "depth_ft": None,
            "alt_ft": None,
            "local_id": None,
            "drill_date": None,
            "notes": None,
            "has_lith": False,
            "has_geophys": False,
            "lith_pdf": None,
            "geophys_pdf": None,
            "geophys_las": None,
            "geophys_csv": None,
            "log_type": None,
            "sources": [],
        }
        by_id[dgsid] = w

    if source not in w["sources"]:
        w["sources"].append(source)

    depth = num(attrs.get("HOLE_DEPTH_ft") or attrs.get("HOLE_DEPTH") or attrs.get("depth_ft"))
    if depth is not None and (w["depth_ft"] is None or depth > w["depth_ft"]):
        w["depth_ft"] = depth

    alt = num(attrs.get("ALTITUDE_ft") or attrs.get("ALTITUDE"))
    if alt is not None and w["alt_ft"] is None:
        w["alt_ft"] = alt

    lid = text(attrs.get("LOCALID") or attrs.get("LocalID"))
    if lid and not w["local_id"]:
        w["local_id"] = lid

    dd = text(attrs.get("DRILL_DATE") or attrs.get("Drill_Date"))
    if dd and not w["drill_date"]:
        # strip midnight noise
        w["drill_date"] = dd.split(" ")[0] if " " in dd else dd

    notes = text(attrs.get("NOTES") or attrs.get("Notes"))
    if notes and not w["notes"]:
        w["notes"] = notes[:200]

    if role == "lith":
        w["has_lith"] = True
        pdf = first_link(attrs.get("LINK"), attrs.get("PDF_Link"), attrs.get("PDF_LINK"))
        if pdf and not w["lith_pdf"]:
            w["lith_pdf"] = pdf
    elif role == "geophys":
        w["has_geophys"] = True
        pdf = first_link(
            attrs.get("PDF_Link"),
            attrs.get("PDF_Link_2"),
            attrs.get("PDF_LINK"),
            attrs.get("LINK"),
        )
        las = first_link(attrs.get("LAS_Link"), attrs.get("LAS_Link_2"), attrs.get("LAS_LINK"))
        csv = first_link(attrs.get("CSV_Link"), attrs.get("CSV_Link_2"), attrs.get("CSV_LINK"))
        if pdf and not w["geophys_pdf"]:
            w["geophys_pdf"] = pdf
        if las and not w["geophys_las"]:
            w["geophys_las"] = las
        if csv and not w["geophys_csv"]:
            w["geophys_csv"] = csv
        lt = text(attrs.get("LOG_TYPE") or attrs.get("Log_Type"))
        if lt and not w["log_type"]:
            w["log_type"] = lt


def main() -> int:
    ap = argparse.ArgumentParser(description="Download DGS DGIR borehole / geophys inventory")
    ap.add_argument(
        "--out",
        default="refs/dgir_wells.json",
        help="Output JSON path (default: refs/dgir_wells.json)",
    )
    ap.add_argument("--skip", action="append", default=[], help="Skip source key (repeatable)")
    args = ap.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    by_id: dict[str, dict] = {}
    fetched: dict[str, int] = {}
    errors: list[str] = []

    for key, service, layer, role in SOURCES:
        if key in args.skip:
            print(f"skip {key}", flush=True)
            continue
        print(f"Fetching {key} ({role}) …", flush=True)
        try:
            rows = query_all(service, layer)
            fetched[key] = len(rows)
            for attrs in rows:
                upsert_well(by_id, attrs, role, key)
        except Exception as e:
            errors.append(f"{key}: {e}")
            print(f"  ERROR {key}: {e}", file=sys.stderr, flush=True)

    wells = sorted(by_id.values(), key=lambda w: w["id"])
    n_lith = sum(1 for w in wells if w["has_lith"])
    n_geo = sum(1 for w in wells if w["has_geophys"])

    payload = {
        "type": "dgs_dgir_wells",
        "version": 1,
        "source": "DGS NGGDPP / Borehole Log Mapper (ArcGIS Online)",
        "mapper_url": "https://experience.arcgis.com/experience/ca41e4c56e164341906b2b060ea05ebd",
        "dgir_url": "https://www.dgs.udel.edu/projects/delaware-geologic-information-resource-dgir-web-application",
        "note": (
            "Point inventory + PDF/LAS links for DGS lithologic & geophysical logs. "
            "Structured interval lithology from classic DGIR GeoServer (maps.dgs.udel.edu) "
            "is not bundled here when that host is offline."
        ),
        "fetched": fetched,
        "errors": errors,
        "n": len(wells),
        "n_lith": n_lith,
        "n_geophys": n_geo,
        "wells": wells,
    }

    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    size_kb = out.stat().st_size / 1024
    print(
        f"Wrote {out} — {len(wells)} wells "
        f"({n_lith} lith, {n_geo} geophys) · {size_kb:.0f} KB",
        flush=True,
    )
    if errors and not wells:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

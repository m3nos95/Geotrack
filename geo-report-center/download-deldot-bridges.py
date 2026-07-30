#!/usr/bin/env python3
"""Download DelDOT bridge inventory (BRIDGE_NO + GPS) from FirstMap TSDM → refs/deldot_bridges.json

Source: enterprise.firstmap.delaware.gov · Transportation/DE_Roadways_Main · BRIDGES
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BASE = (
    "https://enterprise.firstmap.delaware.gov/arcgis/rest/services/"
    "Transportation/DE_Roadways_Main/FeatureServer/0/query"
)
OUT_FIELDS = (
    "BRIDGE_NO,BRIDGE_ID,LATITUDE,LONGITUDE,COUNTY,FACILITY_CARRIED,"
    "FEATURE_INTRSCTD,BRIDGE_LOC_DESC,BRIDGE_YEAR_BUILT,BRIDGE_NAT_INV,"
    "BRIDGE_OPER_STATUS_DESC,BRIDGE_STRUCT_TYPE_DESC,DISTRICT,PRIMARY_IDENTIFIER"
)
PAGE = 2000


def fetch_page(offset: int) -> dict:
    qs = urllib.parse.urlencode(
        {
            "where": "1=1",
            "outFields": OUT_FIELDS,
            "returnGeometry": "true",
            "outSR": "4326",
            "resultOffset": offset,
            "resultRecordCount": PAGE,
            "f": "json",
        }
    )
    with urllib.request.urlopen(BASE + "?" + qs, timeout=60) as r:
        return json.load(r)


def main() -> int:
    root = Path(__file__).resolve().parent
    out_dir = root / "refs"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "deldot_bridges.json"

    bridges = []
    offset = 0
    while True:
        data = fetch_page(offset)
        if data.get("error"):
            print("FirstMap error:", data["error"], file=sys.stderr)
            return 1
        feats = data.get("features") or []
        if not feats:
            break
        for f in feats:
            a = f.get("attributes") or {}
            g = f.get("geometry") or {}
            lat = a.get("LATITUDE")
            lon = a.get("LONGITUDE")
            if lat is None and g.get("y") is not None:
                lat = g["y"]
            if lon is None and g.get("x") is not None:
                lon = g["x"]
            try:
                lat = float(lat) if lat is not None else None
                lon = float(lon) if lon is not None else None
            except (TypeError, ValueError):
                lat = lon = None
            if lat is None or lon is None:
                continue
            bridges.append(
                {
                    "bridge_no": (a.get("BRIDGE_NO") or "").strip() or None,
                    "bridge_id": (a.get("BRIDGE_ID") or "").strip() or None,
                    "lat": lat,
                    "lon": lon,
                    "county": a.get("COUNTY"),
                    "facility_carried": a.get("FACILITY_CARRIED"),
                    "feature_intersected": a.get("FEATURE_INTRSCTD"),
                    "location": a.get("BRIDGE_LOC_DESC"),
                    "year_built": a.get("BRIDGE_YEAR_BUILT"),
                    "nbi": a.get("BRIDGE_NAT_INV"),
                    "status": a.get("BRIDGE_OPER_STATUS_DESC"),
                    "struct_type": a.get("BRIDGE_STRUCT_TYPE_DESC"),
                    "district": a.get("DISTRICT"),
                    "primary_id": a.get("PRIMARY_IDENTIFIER"),
                }
            )
        print(f"  fetched {len(feats)} (total {len(bridges)}) …")
        if len(feats) < PAGE or data.get("exceededTransferLimit") is not True:
            if len(feats) < PAGE:
                break
            offset += len(feats)
        else:
            offset += len(feats)

    payload = {
        "type": "deldot_bridges",
        "source": "FirstMap Transportation/DE_Roadways_Main BRIDGES (DelDOT TSDM)",
        "url": BASE.rsplit("/query", 1)[0],
        "n": len(bridges),
        "bridges": bridges,
    }
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(bridges)} bridges → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Download full DelDOT bridge inventory from FirstMap TSDM → refs/deldot_bridges.json

Source: enterprise.firstmap.delaware.gov · Transportation/DE_Roadways_Main · BRIDGES
Pulls all TSDM attributes (structure type, material, clearances, postings, etc.).
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
# Explicit list (avoids OBJECTID-only quirks); keep in sync with GeoTrak normalizeBridgeRecord.
OUT_FIELDS = ",".join(
    [
        "BRIDGE_NO",
        "BRIDGE_ID",
        "LATITUDE",
        "LONGITUDE",
        "COUNTY",
        "DISTRICT",
        "RDWAY_ID",
        "MILEPOINT",
        "CORRECTED_MILEPOINT",
        "OLD_MILEPOINT",
        "OVER_RDWAY",
        "UNDER_RDWAY",
        "ON_UNDER",
        "BRIDGE_ROAD_NO",
        "FACILITY_CARRIED",
        "FEATURE_INTRSCTD",
        "BRIDGE_LOC_DESC",
        "BRIDGE_MAINT_RESP",
        "BRIDGE_MAINT_RESP_DESC",
        "BRIDGE_OWNER_DESC",
        "BRIDGE_FUNC_CLASS",
        "BRIDGE_FUNC_CLASS_DESC",
        "BRIDGE_YEAR_BUILT",
        "NO_LANES_ON_BRIDGE",
        "NO_LANES_BELOW",
        "BRIDGE_HIST_STATUS",
        "BRIDGE_HIST_STATUS_DESC",
        "BRIDGE_OPER_STATUS",
        "BRIDGE_OPER_STATUS_DESC",
        "BRIDGE_MAT_TYPE",
        "BRIDGE_MAT_TYPE_DESC",
        "BRIDGE_STRUCT_TYPE",
        "BRIDGE_STRUCT_TYPE_DESC",
        "NO_OF_SPANS",
        "SPAN_LENGTH",
        "LENGTH_OF_BRIDGE",
        "L_SIDEWALK_LENGTH",
        "R_SIDEWALK_LENGTH",
        "CURB_TO_CURB_WIDTH",
        "OUT_TO_OUT_WIDTH",
        "UNDERCLR_FEATURE",
        "UNDERCLR_FEATURE_DESC",
        "MIN_VERT_FT_ON_RDWAY",
        "MIN_VERT_FT_UNDER_RDWAY",
        "WT_3AXLE_SU",
        "WT_4AXLE_SU",
        "WT_3AXLE_SEMI",
        "WT_4AXLE_SEMI",
        "WT_5AXLE_SEMI",
        "BRIDGE_NAT_INV",
        "PRIMARY_IDENTIFIER",
        "BRIDGE_PK",
        "GRID",
        "QUAD",
        "UPDT",
    ]
)
PAGE = 2000


def _s(v):
    if v is None:
        return None
    if isinstance(v, str):
        t = v.strip()
        return t or None
    return v


def _f(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _i(v):
    n = _f(v)
    if n is None:
        return None
    if abs(n - round(n)) < 1e-9:
        return int(round(n))
    return n


def normalize(a: dict, g: dict | None = None) -> dict | None:
    g = g or {}
    lat = _f(a.get("LATITUDE"))
    lon = _f(a.get("LONGITUDE"))
    if lat is None and g.get("y") is not None:
        lat = _f(g.get("y"))
    if lon is None and g.get("x") is not None:
        lon = _f(g.get("x"))
    if lat is None or lon is None:
        return None
    return {
        "bridge_no": _s(a.get("BRIDGE_NO")),
        "bridge_id": _s(a.get("BRIDGE_ID")),
        "lat": lat,
        "lon": lon,
        "county": _s(a.get("COUNTY")),
        "district": _s(a.get("DISTRICT")),
        "rdway_id": _i(a.get("RDWAY_ID")),
        "milepoint": _i(a.get("MILEPOINT")),
        "corrected_milepoint": _i(a.get("CORRECTED_MILEPOINT")),
        "old_milepoint": _f(a.get("OLD_MILEPOINT")),
        "over_rdway": _i(a.get("OVER_RDWAY")),
        "under_rdway": _f(a.get("UNDER_RDWAY")),
        "on_under": _i(a.get("ON_UNDER")),
        "bridge_road_no": _s(a.get("BRIDGE_ROAD_NO")),
        "facility_carried": _s(a.get("FACILITY_CARRIED")),
        "feature_intersected": _s(a.get("FEATURE_INTRSCTD")),
        "location": _s(a.get("BRIDGE_LOC_DESC")),
        "maint_resp": _s(a.get("BRIDGE_MAINT_RESP")),
        "maint_resp_desc": _s(a.get("BRIDGE_MAINT_RESP_DESC")),
        "owner_desc": _s(a.get("BRIDGE_OWNER_DESC")),
        "func_class": _s(a.get("BRIDGE_FUNC_CLASS")),
        "func_class_desc": _s(a.get("BRIDGE_FUNC_CLASS_DESC")),
        "year_built": _i(a.get("BRIDGE_YEAR_BUILT")),
        "lanes_on": _i(a.get("NO_LANES_ON_BRIDGE")),
        "lanes_below": _i(a.get("NO_LANES_BELOW")),
        "hist_status": _s(a.get("BRIDGE_HIST_STATUS")),
        "hist_status_desc": _s(a.get("BRIDGE_HIST_STATUS_DESC")),
        "status_code": _s(a.get("BRIDGE_OPER_STATUS")),
        "status": _s(a.get("BRIDGE_OPER_STATUS_DESC")),
        "mat_type": _s(a.get("BRIDGE_MAT_TYPE")),
        "mat_type_desc": _s(a.get("BRIDGE_MAT_TYPE_DESC")),
        "struct_type_code": _s(a.get("BRIDGE_STRUCT_TYPE")),
        "struct_type": _s(a.get("BRIDGE_STRUCT_TYPE_DESC")),
        "spans": _i(a.get("NO_OF_SPANS")),
        "span_length_ft": _i(a.get("SPAN_LENGTH")),
        "length_ft": _i(a.get("LENGTH_OF_BRIDGE")),
        "sidewalk_l_ft": _i(a.get("L_SIDEWALK_LENGTH")),
        "sidewalk_r_ft": _i(a.get("R_SIDEWALK_LENGTH")),
        "curb_to_curb_ft": _i(a.get("CURB_TO_CURB_WIDTH")),
        "out_to_out_ft": _i(a.get("OUT_TO_OUT_WIDTH")),
        "underclear_feature": _s(a.get("UNDERCLR_FEATURE")),
        "underclear_feature_desc": _s(a.get("UNDERCLR_FEATURE_DESC")),
        "min_vert_on_ft": _i(a.get("MIN_VERT_FT_ON_RDWAY")),
        "min_vert_under_ft": _f(a.get("MIN_VERT_FT_UNDER_RDWAY")),
        "wt_3axle_su": _i(a.get("WT_3AXLE_SU")),
        "wt_4axle_su": _i(a.get("WT_4AXLE_SU")),
        "wt_3axle_semi": _i(a.get("WT_3AXLE_SEMI")),
        "wt_4axle_semi": _i(a.get("WT_4AXLE_SEMI")),
        "wt_5axle_semi": _i(a.get("WT_5AXLE_SEMI")),
        "nbi": _s(a.get("BRIDGE_NAT_INV")),
        "primary_id": _s(a.get("PRIMARY_IDENTIFIER")),
        "bridge_pk": _f(a.get("BRIDGE_PK")),
        "grid": _s(a.get("GRID")),
        "quad": _s(a.get("QUAD")),
        "updated": a.get("UPDT"),
    }


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
    with urllib.request.urlopen(BASE + "?" + qs, timeout=90) as r:
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
            b = normalize(f.get("attributes") or {}, f.get("geometry") or {})
            if b:
                bridges.append(b)
        print(f"  fetched {len(feats)} (total {len(bridges)}) …")
        if len(feats) < PAGE:
            break
        offset += len(feats)

    payload = {
        "type": "deldot_bridges",
        "source": "FirstMap Transportation/DE_Roadways_Main BRIDGES (DelDOT TSDM)",
        "url": BASE.rsplit("/query", 1)[0],
        "fields": "full_tsdm",
        "n": len(bridges),
        "bridges": bridges,
    }
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(bridges)} bridges → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

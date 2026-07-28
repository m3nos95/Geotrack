#!/usr/bin/env python3
"""
Download the full Delaware FirstMap / DNREC reference pack into refs/.

Usage (from Ultimate Geo Program / geo-report-center folder):
  python download-all-refs.py              # recommended full pack
  python download-all-refs.py --all        # same + wells + LULC + DEN
  python download-all-refs.py --core       # geology / recharge / quads / counties only
  python download-all-refs.py --list       # print catalog and exit

Saves raw GeoJSON pages as {prefix}_{offset}.json (2000 features/page).
Rasters (DTW / WTE / unconfined aquifer) are NOT downloaded — the app samples them online.
Also pulls nrcs_de_by_mukey.json and dgir_wells.json (DGS NGGDPP borehole inventory) unless --core/--only.
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

BASE = "https://enterprise.firstmap.delaware.gov/arcgis/rest/services"
PAGE = 2000

# (prefix, servicePath, layerId, serverType)  serverType: FeatureServer | MapServer
CATALOG: dict[str, list[tuple[str, str, int, str]]] = {
    "core": [
        ("geology_surficial", "Geology/DGS_Geology", 0, "FeatureServer"),
        ("geology_offshore", "Geology/DGS_Geology", 1, "FeatureServer"),
        ("geology_piedmont", "Geology/DGS_Geology", 2, "FeatureServer"),
        ("recharge_ks", "Geology/DGS_GroundwaterRechargePotential", 0, "FeatureServer"),
        ("quads_usgs", "Boundaries/DE_Index", 3, "FeatureServer"),
        ("boundaries_counties", "Boundaries/DE_Boundaries", 4, "FeatureServer"),
        ("boundaries_muni", "Boundaries/DE_Boundaries", 3, "FeatureServer"),
    ],
    "soils_wrpa": [
        ("soils_kent", "Geology/DE_Soils", 0, "FeatureServer"),
        ("soils_ncc", "Geology/DE_Soils", 1, "FeatureServer"),
        ("soils_sussex", "Geology/DE_Soils", 2, "FeatureServer"),
        ("wrpa_hoops", "Hydrology/DE_NCCO_WRPA", 0, "FeatureServer"),
        ("wrpa_erosion", "Hydrology/DE_NCCO_WRPA", 1, "FeatureServer"),
        ("wrpa_floodplains", "Hydrology/DE_NCCO_WRPA", 2, "FeatureServer"),
        ("wrpa_newark_res", "Hydrology/DE_NCCO_WRPA", 3, "FeatureServer"),
        ("wrpa_wellhead_300", "Hydrology/DE_NCCO_WRPA", 4, "FeatureServer"),
        ("wrpa_class_b", "Hydrology/DE_NCCO_WRPA", 5, "FeatureServer"),
        ("wrpa_class_c", "Hydrology/DE_NCCO_WRPA", 6, "FeatureServer"),
        ("wrpa_recharge", "Hydrology/DE_NCCO_WRPA", 7, "FeatureServer"),
        ("wrpa_cockeysville", "Hydrology/DE_NCCO_WRPA", 8, "FeatureServer"),
        ("wrpa_wellhead_150", "Hydrology/DE_NCCO_WRPA", 9, "FeatureServer"),
    ],
    "hydro": [
        ("watersheds_huc12", "Hydrology/DE_Watersheds", 5, "FeatureServer"),
        ("wetlands_2017", "Hydrology/DE_Wetlands", 6, "FeatureServer"),
        ("taxditch_segments", "Hydrology/DE_TaxDitch", 0, "FeatureServer"),
        ("taxditch_areas", "Hydrology/DE_TaxDitch", 2, "FeatureServer"),
        ("hydro_rivers", "Hydrology/DE_Water", 0, "FeatureServer"),
        ("hydro_lakes", "Hydrology/DE_Water", 2, "FeatureServer"),
        ("flood_fema", "Hydrology/DE_DFIRM", 7, "MapServer"),
        ("tidal_buffer", "Hydrology/DE_Saltwater_Tidal_Buffer", 0, "FeatureServer"),
    ],
    "dnrec": [
        ("dnrec_septic_site_evals", "PlanningCadastre/DE_DNREC_Planning_and_Engineering", 0, "FeatureServer"),
        ("dnrec_septic_soil_borings", "PlanningCadastre/DE_DNREC_Planning_and_Engineering", 1, "FeatureServer"),
        ("dnrec_wellhead_protection", "PlanningCadastre/DE_DNREC_Planning_and_Engineering", 2, "FeatureServer"),
        ("dnrec_soil_feasibility", "PlanningCadastre/DE_DNREC_Planning_and_Engineering", 3, "FeatureServer"),
        ("dnrec_gmz", "PlanningCadastre/DE_DNREC_Planning_and_Engineering", 4, "FeatureServer"),
        ("dnrec_sussex_landfills", "PlanningCadastre/DE_DNREC_Planning_and_Engineering", 5, "FeatureServer"),
        ("dnrec_septic_permits", "Environmental/DE_DNREC_Permits", 2, "FeatureServer"),
        ("dnrec_biosolids", "Environmental/DE_DNREC_Permits", 3, "FeatureServer"),
        ("dnrec_large_systems", "Environmental/DE_DNREC_Permits", 4, "FeatureServer"),
        ("dnrec_ust", "Environmental/DE_DNREC_Permits", 0, "FeatureServer"),
        ("dnrec_lust", "Environmental/DE_DNREC_Permits", 1, "FeatureServer"),
        ("dnrec_industrial_stormwater", "Environmental/DE_DNREC_Facilities", 5, "FeatureServer"),
        ("dnrec_landfills", "Environmental/DE_DNREC_Facilities", 6, "FeatureServer"),
        ("dnrec_rcra", "Environmental/DE_DNREC_Facilities", 3, "FeatureServer"),
        ("dnrec_rs_sites", "Environmental/DE_DNREC_Facilities", 4, "FeatureServer"),
        ("dda_gw_monitoring", "Society/DE_Agriculture", 4, "FeatureServer"),
        ("ag_irrigated_areas", "Society/DE_Agriculture", 2, "FeatureServer"),
    ],
    "coastal": [
        ("coastal_zone", "Environmental/DE_Coastal_Zone", 1, "FeatureServer"),
        ("coastal_inundation_1ft", "Environmental/DE_Coastal_Inundation_2017", 1, "FeatureServer"),
        ("coastal_inundation_3ft", "Environmental/DE_Coastal_Inundation_2017", 3, "FeatureServer"),
        ("coastal_inundation_7ft", "Environmental/DE_Coastal_Inundation_2017", 7, "FeatureServer"),
    ],
    "transport": [
        ("roads_centerline", "Transportation/DE_Roadways_Main", 1, "FeatureServer"),
        ("roads_bridges", "Transportation/DE_Roadways_Main", 0, "FeatureServer"),
        ("assets_lightposts", "Transportation/DE_Assets", 4, "FeatureServer"),
        ("assets_overhead_signs", "Transportation/DE_Assets", 7, "FeatureServer"),
    ],
    "wells": [
        ("dnrec_nonpublic_wells", "Environmental/DE_DNREC_Monitoring_Network", 0, "FeatureServer"),
    ],
    "lulc": [
        ("lulc_2022", "PlanningCadastre/DE_LULC", 4, "FeatureServer"),
    ],
    "den": [
        ("dnrec_den_locations", "Environmental/DE_DNREC_Facilities", 0, "FeatureServer"),
    ],
}

ONLINE_ONLY = [
    ("DGS Depth to Water (dry/normal/wet)", f"{BASE}/Geology/DGS_DepthToWater/MapServer"),
    ("DGS Water Table Elevation", f"{BASE}/Geology/DGS_WaterTableElevation/MapServer"),
    ("DGS Unconfined Aquifer Sussex (T/thickness/base)", f"{BASE}/Geology/DGS_UnconfinedAquifer/MapServer"),
]


def query_url(service: str, layer: int, server: str, offset: int) -> str:
    q = urllib.parse.urlencode(
        {
            "where": "1=1",
            "outFields": "*",
            "f": "geojson",
            "resultOffset": str(offset),
            "resultRecordCount": str(PAGE),
        }
    )
    return f"{BASE}/{service}/{server}/{layer}/query?{q}"


def download_layer(refs: Path, prefix: str, service: str, layer: int, server: str) -> int:
    offset = 0
    total = 0
    while True:
        url = query_url(service, layer, server, offset)
        out = refs / f"{prefix}_{offset}.json"
        print(f"  {prefix} offset {offset} …", flush=True)
        req = urllib.request.Request(url, headers={"User-Agent": "GeoReportCenter/0.11"})
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as e:
            print(f"  ERROR HTTP {e.code} for {prefix}: {e.reason}", file=sys.stderr)
            break
        except Exception as e:
            print(f"  ERROR {prefix}: {e}", file=sys.stderr)
            break
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            print(f"  ERROR {prefix}: invalid JSON", file=sys.stderr)
            break
        feats = data.get("features") or []
        n = len(feats)
        if n == 0:
            print(f"  Done {prefix} — empty at {offset}")
            break
        out.write_bytes(raw)
        mb = out.stat().st_size / (1024 * 1024)
        print(f"  Saved {out.name} ({n} features, {mb:.1f} MB)")
        total += n
        if n < PAGE:
            break
        offset += PAGE
        time.sleep(0.15)
    return total


def main() -> int:
    ap = argparse.ArgumentParser(description="Download Delaware FirstMap/DNREC refs for DelDOT GeoTrak")
    ap.add_argument("--core", action="store_true", help="Core geology/recharge/quads only")
    ap.add_argument("--all", action="store_true", help="Full pack + wells + LULC + DEN (very large)")
    ap.add_argument("--include-wells", action="store_true", help="Add ~174k non-public wells")
    ap.add_argument("--include-lulc", action="store_true", help="Add 2022 land use/land cover")
    ap.add_argument("--include-den", action="store_true", help="Add DEN facility locations (~163k)")
    ap.add_argument("--list", action="store_true", help="List catalog and exit")
    ap.add_argument("--project", default=".", help="Project folder (contains refs/)")
    ap.add_argument("--only", nargs="*", help="Download only these prefixes")
    args = ap.parse_args()

    if args.list:
        for group, items in CATALOG.items():
            print(f"\n[{group}]")
            for prefix, svc, lid, srv in items:
                print(f"  {prefix:32s} {svc}/{srv}/{lid}")
        print("\n[online-only rasters — app samples these]")
        for name, url in ONLINE_ONLY:
            print(f"  {name}\n    {url}")
        return 0

    groups = ["core"]
    if not args.core:
        groups += ["soils_wrpa", "hydro", "dnrec", "coastal", "transport"]
    if args.all or args.include_wells:
        groups.append("wells")
    if args.all or args.include_lulc:
        groups.append("lulc")
    if args.all or args.include_den:
        groups.append("den")

    root = Path(args.project).expanduser().resolve()
    refs = root / "refs"
    refs.mkdir(parents=True, exist_ok=True)

    jobs: list[tuple[str, str, int, str]] = []
    for g in groups:
        jobs.extend(CATALOG[g])
    if args.only:
        want = set(args.only)
        jobs = [j for j in jobs if j[0] in want]

    print(f"Project: {root}")
    print(f"Output:  {refs}")
    print(f"Layers:  {len(jobs)} ({', '.join(groups)})")
    print("Online-only rasters (no download):")
    for name, _ in ONLINE_ONLY:
        print(f"  · {name}")
    print()

    grand = 0
    for prefix, svc, lid, srv in jobs:
        print(f"=== {prefix} ===")
        grand += download_layer(refs, prefix, svc, lid, srv)

    print(f"\nFinished. ~{grand} features written under {refs}")
    print("Open Geo_Report_Center.html → Open project folder → Map tab shows new layers.")
    print("Tip: large point layers (septic borings / wells) query nearest within 500 ft on click.")

    # NRCS property lookup (mukey join) — small JSON, needed for Ksat / AASHTO / USCS screening
    if not args.core and not args.only:
        nrcs_script = Path(__file__).resolve().parent / "download-nrcs-soil-props.py"
        if nrcs_script.exists():
            print("\n=== nrcs_de_by_mukey (USDA Soil Data Access) ===")
            import subprocess
            rc = subprocess.call([sys.executable, str(nrcs_script), "--out", str(refs)])
            if rc != 0:
                print("WARNING: NRCS property download failed — soils polygons still work; Ksat/USCS join skipped.")

        # DGS DGIR-adjacent borehole / geophys inventory (AGOL NGGDPP mirrors)
        dgir_script = Path(__file__).resolve().parent / "download-dgir-wells.py"
        if dgir_script.exists():
            print("\n=== dgir_wells (DGS NGGDPP / Borehole Log Mapper) ===")
            import subprocess
            rc = subprocess.call(
                [sys.executable, str(dgir_script), "--out", str(refs / "dgir_wells.json")]
            )
            if rc != 0:
                print(
                    "WARNING: DGS DGIR well download failed — classic GeoServer may be offline; "
                    "run download-dgir-wells.bat later."
                )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Download DelDOT FirstMap transportation layers → refs/deldot_firstmap/*.geojson

Default: all layers with ≤50k features (skips Street View ~744k and other huge packs).
  python download-deldot-firstmap.py
  python download-deldot-firstmap.py --full          # include huge polyline packs (not Street View)
  python download-deldot-firstmap.py --street-view   # also Street View (very large)
  python download-deldot-firstmap.py --only soil_borings,signals
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://enterprise.firstmap.delaware.gov/arcgis/rest/services"

# id, slug, label, service path, layer index, soft size hint
LAYERS = [
  # DE_Roadways_Main (bridges already have dedicated download / Markers toggle)
  ("centerline", "Centerline", "Transportation/DE_Roadways_Main/FeatureServer", 1, 78309),
  ("road_inventory", "Road inventory", "Transportation/DE_Roadways_Main/FeatureServer", 2, 112272),
  ("guardrails", "Guardrails", "Transportation/DE_Roadways_Main/FeatureServer", 3, 5387),
  ("infra_bridge_agreement", "Infrastructure bridge agreement", "Transportation/DE_Roadways_Main/FeatureServer", 4, 171),
  ("infra_road_agreement", "Infrastructure road agreement", "Transportation/DE_Roadways_Main/FeatureServer", 5, 1448),
  ("intersections", "Intersections", "Transportation/DE_Roadways_Main/FeatureServer", 6, 34425),
  ("maintenance_responsibility", "Maintenance responsibility", "Transportation/DE_Roadways_Main/FeatureServer", 7, 14509),
  ("routes", "Routes", "Transportation/DE_Roadways_Main/FeatureServer", 8, 540),
  ("snow_primary", "Snow removal — primary", "Transportation/DE_Roadways_Main/FeatureServer", 9, 1722),
  ("snow_secondary", "Snow removal — secondary", "Transportation/DE_Roadways_Main/FeatureServer", 10, 632),
  ("snow_tertiary", "Snow removal — tertiary", "Transportation/DE_Roadways_Main/FeatureServer", 11, 4177),
  ("snow_suburban", "Snow removal — suburban", "Transportation/DE_Roadways_Main/FeatureServer", 12, 1971),
  ("snow_reimburse", "Snow reimburse", "Transportation/DE_Roadways_Main/FeatureServer", 13, 6298),
  ("snowstations", "Snow stations", "Transportation/DE_Roadways_Main/FeatureServer", 14, 26),
  ("speed_limit", "Speed limit", "Transportation/DE_Roadways_Main/FeatureServer", 15, 16083),
  ("functional_class", "Functional class", "Transportation/DE_Roadways_Main/FeatureServer", 16, 14479),
  ("nhs", "NHS", "Transportation/DE_Roadways_Main/FeatureServer", 17, 192),
  ("state_maint_roads", "State-maintained maintenance roads", "Transportation/DE_Roadways_Main/FeatureServer", 18, 61582),
  ("state_maint_subdivisions", "State-maintained subdivisions", "Transportation/DE_Roadways_Main/FeatureServer", 19, 32188),
  ("lane_shoulder_median", "Lane / shoulder / median", "Transportation/DE_Roadways_Main/FeatureServer", 20, 60408),
  ("network_segment_intersection", "Network segment at intersection", "Transportation/DE_Roadways_Main/FeatureServer", 21, 43686),
  # DE_Assets
  ("ctp_web", "CTP projects (web)", "Transportation/DE_Assets/FeatureServer", 0, 1359),
  ("ctp_point", "CTP projects (points)", "Transportation/DE_Assets/FeatureServer", 1, 31),
  ("ctp_line", "CTP projects (lines)", "Transportation/DE_Assets/FeatureServer", 2, 21490),
  ("ctp_poly", "CTP projects (polygons)", "Transportation/DE_Assets/FeatureServer", 3, 299),
  ("lightposts", "Lightposts", "Transportation/DE_Assets/FeatureServer", 4, 15052),
  ("lightposts_suburban", "Lightposts (suburban)", "Transportation/DE_Assets/FeatureServer", 5, 21465),
  ("milemarkers", "Milemarkers", "Transportation/DE_Assets/FeatureServer", 6, 644),
  ("overhead_signs", "Overhead sign structures", "Transportation/DE_Assets/FeatureServer", 7, 244),
  ("road_ratings", "Road ratings", "Transportation/DE_Assets/FeatureServer", 8, 20247),
  ("traffic_counts", "Traffic counts", "Transportation/DE_Assets/FeatureServer", 9, 4134),
  ("traffic_counts_10yr", "Traffic counts (10 yr)", "Transportation/DE_Assets/FeatureServer", 10, 4134),
  ("utilities_permit", "Utilities permits", "Transportation/DE_Assets/FeatureServer", 11, 246),
  ("traffic_counter_locations", "Traffic counter locations", "Transportation/DE_Assets/FeatureServer", 12, 4134),
  ("impaired_sites", "DelDOT-owned DNREC impaired sites", "Transportation/DE_Assets/FeatureServer", 13, 141),
  ("historic_markers", "Historic markers", "Transportation/DE_Assets/FeatureServer", 14, 578),
  ("leg_report_line", "Legislative report (lines)", "Transportation/DE_Assets/FeatureServer", 16, 569),
  ("leg_report_poly", "Legislative report (polygons)", "Transportation/DE_Assets/FeatureServer", 17, 4),
  ("paving_current", "Paving — current", "Transportation/DE_Assets/FeatureServer", 18, 136),
  ("paving_archive", "Paving — archive", "Transportation/DE_Assets/FeatureServer", 19, 5840),
  # DE_Roadways_Other
  ("evacuation_routes", "Evacuation routes", "Transportation/DE_Roadways_Other/FeatureServer", 0, 1900),
  ("fhwa_national_highway", "FHWA national highway", "Transportation/DE_Roadways_Other/FeatureServer", 1, 56123),
  ("freq_flooded_roads", "Frequently flooded roadways", "Transportation/DE_Roadways_Other/FeatureServer", 2, 967),
  ("private_proposed_streets", "Private / proposed streets", "Transportation/DE_Roadways_Other/FeatureServer", 3, 26135),
  ("roundabouts", "Roundabouts / traffic circles", "Transportation/DE_Roadways_Other/FeatureServer", 4, 56),
  ("street_view", "Street View points", "Transportation/DE_Roadways_Other/FeatureServer", 16, 744115),
  ("byways_poi", "Byways — points of interest", "Transportation/DE_Roadways_Other/FeatureServer", 17, 350),
  ("byways", "Byways", "Transportation/DE_Roadways_Other/FeatureServer", 18, 12),
  ("byways_buf_660", "Byways buffer 660", "Transportation/DE_Roadways_Other/FeatureServer", 19, 1),
  ("byways_buf_680", "Byways buffer 680", "Transportation/DE_Roadways_Other/FeatureServer", 20, 1),
  # Electronic as-builts
  ("as_builts", "Electronic as-builts", "Transportation/DE_Electronic_As_Builts_Assets/FeatureServer", 0, 316),
  ("as_designed", "As-designed", "Transportation/DE_Electronic_As_Builts_Assets/FeatureServer", 1, 655),
  ("as_designed_lines", "As-designed line assets", "Transportation/DE_Electronic_As_Builts_Assets/FeatureServer", 2, 26),
  # Boundary_and_Point — facilities / roadside / traffic
  ("dtc_facility", "DTC facilities", "Transportation/DE_Boundary_and_Point/FeatureServer", 0, 6),
  ("aggregate_plants", "DelDOT aggregate plants", "Transportation/DE_Boundary_and_Point/FeatureServer", 1, 6),
  ("asphalt_plants", "DelDOT asphalt plants", "Transportation/DE_Boundary_and_Point/FeatureServer", 2, 0),
  ("concrete_plants", "DelDOT concrete plants", "Transportation/DE_Boundary_and_Point/FeatureServer", 3, 14),
  ("deldot_buildings", "DelDOT buildings", "Transportation/DE_Boundary_and_Point/FeatureServer", 4, 27),
  ("maintenance_yards", "DelDOT maintenance yards", "Transportation/DE_Boundary_and_Point/FeatureServer", 5, 37),
  ("maintenance_districts", "DelDOT maintenance districts", "Transportation/DE_Boundary_and_Point/FeatureServer", 6, 4),
  ("maintenance_areas", "DelDOT maintenance areas", "Transportation/DE_Boundary_and_Point/FeatureServer", 7, 12),
  ("mpo_areas", "MPO planning areas", "Transportation/DE_Boundary_and_Point/FeatureServer", 8, 3),
  ("obs_bridge_rails", "Roadside — bridge rails", "Transportation/DE_Boundary_and_Point/FeatureServer", 9, 1106),
  ("obs_bus_shelters", "Roadside — bus shelters", "Transportation/DE_Boundary_and_Point/FeatureServer", 10, 121),
  ("obs_fences", "Roadside — fences", "Transportation/DE_Boundary_and_Point/FeatureServer", 11, 9491),
  ("obs_headwalls", "Roadside — headwalls", "Transportation/DE_Boundary_and_Point/FeatureServer", 12, 13492),
  ("obs_light_poles", "Roadside — light poles", "Transportation/DE_Boundary_and_Point/FeatureServer", 13, 27490),
  ("obs_mailboxes", "Roadside — mailboxes", "Transportation/DE_Boundary_and_Point/FeatureServer", 14, 20789),
  ("obs_other_lines", "Roadside — other lines", "Transportation/DE_Boundary_and_Point/FeatureServer", 15, 529),
  ("obs_signal_poles", "Roadside — signal poles", "Transportation/DE_Boundary_and_Point/FeatureServer", 16, 1952),
  ("obs_tree_groves", "Roadside — tree groves", "Transportation/DE_Boundary_and_Point/FeatureServer", 17, 7560),
  ("obs_trees", "Roadside — trees", "Transportation/DE_Boundary_and_Point/FeatureServer", 18, 48735),
  ("soil_borings", "DelDOT soil borings (FirstMap)", "Transportation/DE_Boundary_and_Point/FeatureServer", 19, 4136),
  ("taz", "Transportation analysis zones", "Transportation/DE_Boundary_and_Point/FeatureServer", 20, 1281),
  ("tid", "Transportation improvement districts", "Transportation/DE_Boundary_and_Point/FeatureServer", 21, 14),
  ("toll_booths", "Toll booths", "Transportation/DE_Boundary_and_Point/FeatureServer", 23, 17),
  ("atr_counters", "ATR traffic counters", "Transportation/DE_Boundary_and_Point/FeatureServer", 24, 37),
  ("bluetooth_detectors", "Bluetooth detectors", "Transportation/DE_Boundary_and_Point/FeatureServer", 25, 295),
  ("cameras", "Traffic cameras", "Transportation/DE_Boundary_and_Point/FeatureServer", 26, 440),
  ("red_light_signals", "Red light signals", "Transportation/DE_Boundary_and_Point/FeatureServer", 28, 60),
  ("signals", "Traffic signals", "Transportation/DE_Boundary_and_Point/FeatureServer", 29, 1502),
  ("vms", "Variable message signs", "Transportation/DE_Boundary_and_Point/FeatureServer", 30, 153),
  ("wavetronix", "Wavetronix radar", "Transportation/DE_Boundary_and_Point/FeatureServer", 31, 303),
  ("weather_stations", "Weather stations", "Transportation/DE_Boundary_and_Point/FeatureServer", 32, 49),
  ("urbanized_2010", "Urbanized areas 2010", "Transportation/DE_Boundary_and_Point/FeatureServer", 35, 22),
  ("urbanized_2020", "Urbanized areas 2020", "Transportation/DE_Boundary_and_Point/FeatureServer", 36, 12),
  ("developer_agreements", "Developer agreements", "Transportation/DE_Boundary_and_Point/FeatureServer", 37, 1977),
]

PAGE = 2000
SOFT_MAX = 50000


def slugify(s: str) -> str:
  return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def fetch_geojson(svc: str, lid: int) -> dict:
  url = f"{BASE}/{svc}/{lid}/query"
  features = []
  offset = 0
  while True:
    qs = urllib.parse.urlencode(
      {
        "where": "1=1",
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": "4326",
        "resultOffset": offset,
        "resultRecordCount": PAGE,
        "f": "geojson",
      }
    )
    with urllib.request.urlopen(url + "?" + qs, timeout=120) as r:
      data = json.load(r)
    if isinstance(data, dict) and data.get("error"):
      raise RuntimeError(data["error"])
    feats = data.get("features") or []
    features.extend(feats)
    print(f"    +{len(feats)} (total {len(features)})", flush=True)
    if len(feats) < PAGE:
      break
    offset += len(feats)
  return {"type": "FeatureCollection", "features": features}


def main() -> int:
  ap = argparse.ArgumentParser()
  ap.add_argument("--full", action="store_true", help="Include layers >50k features (not Street View)")
  ap.add_argument("--street-view", action="store_true", help="Include Street View (~744k points)")
  ap.add_argument("--only", type=str, default="", help="Comma-separated slugs")
  args = ap.parse_args()

  root = Path(__file__).resolve().parent
  # Flat files in refs/ so GeoTrak picks them up without nested-dir support;
  # also mirror into refs/deldot_firstmap/ for organization.
  out_dir = root / "refs"
  out_dir.mkdir(parents=True, exist_ok=True)
  pack_dir = out_dir / "deldot_firstmap"
  pack_dir.mkdir(parents=True, exist_ok=True)

  only = {s.strip() for s in args.only.split(",") if s.strip()}
  ok = skip = fail = 0

  for slug, label, svc, lid, hint in LAYERS:
    if only and slug not in only:
      continue
    if slug == "street_view" and not args.street_view:
      print(f"SKIP {slug} (use --street-view) hint={hint}")
      skip += 1
      continue
    if hint > SOFT_MAX and not args.full and slug != "street_view":
      print(f"SKIP {slug} huge hint={hint} (use --full)")
      skip += 1
      continue
    fname = f"deldot_{slug}.geojson"
    out = out_dir / fname
    print(f"GET {label} → {fname}")
    try:
      gj = fetch_geojson(svc, lid)
      n = len(gj.get("features") or [])
      if n == 0:
        print("  empty — skip write")
        skip += 1
        continue
      meta = {
        "type": "FeatureCollection",
        "name": f"deldot_{slug}",
        "deldot_firstmap": {
          "slug": slug,
          "label": label,
          "service": svc,
          "layer_id": lid,
          "source": "Delaware FirstMap / DelDOT TSDM",
          "n": n,
        },
        "features": gj["features"],
      }
      blob = json.dumps(meta)
      out.write_text(blob, encoding="utf-8")
      (pack_dir / fname).write_text(blob, encoding="utf-8")
      print(f"  wrote {n} features")
      ok += 1
    except Exception as e:
      print(f"  FAIL {e}", file=sys.stderr)
      fail += 1

  print(f"\nDone. ok={ok} skip={skip} fail={fail} → {out_dir}")
  print("In GeoTrak: Open project folder / Reload refs — layers appear under Layers.")
  return 0 if fail == 0 else 1


if __name__ == "__main__":
  raise SystemExit(main())

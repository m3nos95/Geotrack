# DelDOT GeoTrak — Statewide Data Inventory

**Do you need to start over?**  
**No.** Keep everything you already have:

| Keep | Why |
|------|-----|
| `Ultimate Geo Program\` folder layout | Project home |
| `Geo_Report_Center.html` | App |
| `import-geo-zips.py` + `geo-zips\` + `db.json` | Your boring database |
| Surficial geology JSON | Coastal Plain Section 2 |
| Recharge Kent/Sussex JSON | Section 4 |

You are **adding layers**, not rebuilding from zero.

---

## How to use this checklist

1. Work **Phase 1 → 2 → 3 → 4** in order.
2. Check boxes as you download / load each item.
3. Put GeoJSON into `refs\` (or drop into the app Reference tab).
4. Put rasters into `rasters\` (Phase 2 — app support comes next).
5. Keep citation indexes in `citations\`.

Suggested folder layout:

```
Ultimate Geo Program\
├── Geo_Report_Center.html
├── import-geo-zips.py
├── import-geo-zips.bat
├── download-all-refs.ps1      ← run for Phase 1 GeoJSON
├── DATA_INVENTORY.md          ← this file
├── db.json
├── geo-zips\                  ← all *.GEO.zip
├── refs\                      ← GeoJSON / feature layers
├── rasters\                   ← grids (Phase 2+)
└── citations\                 ← HA / GM link tables (Phase 1–2)
```

Base URL for FirstMap REST:

```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services
```

GeoJSON query pattern (page with `resultOffset` in steps of 2000 until empty):

```
{SERVICE}/FeatureServer/{LAYER_ID}/query?where=1=1&outFields=*&f=geojson&resultOffset={0,2000,4000,...}
```

---

# PHASE 1 — Geo-report foundation (do this first)

Goal: any Delaware coordinate → geology + recharge (where mapped) + quad name + your borings.

## 1A. Geology (Section 2)

Service: `Geology/DGS_Geology/FeatureServer`

| Done | Layer | ID | Count | Save as | URL (offset=0; page if needed) |
|------|--------|----|-------|---------|--------------------------------|
| [x] | **Surficial** (Coastal Plain) | 0 | ~11,651 | `geology_surficial_{offset}.json` | See below |
| [ ] | **Offshore** | 1 | ~169 | `geology_offshore_0.json` | See below |
| [ ] | **Piedmont** (NCC north / Hockessin) | 2 | ~79 | `geology_piedmont_0.json` | See below |

**Surficial (you already have — rename optional):**
```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DGS_Geology/FeatureServer/0/query?where=1=1&outFields=*&f=geojson&resultOffset=0
```
(Repeat offset 2000, 4000, … 10000)

**Offshore:**
```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DGS_Geology/FeatureServer/1/query?where=1=1&outFields=*&f=geojson&resultOffset=0
```

**Piedmont (fixes Hockessin blank geology):**
```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DGS_Geology/FeatureServer/2/query?where=1=1&outFields=*&f=geojson&resultOffset=0
```

Fields used in reports: `NAME`, `AGE`, `DESCRIPTION`, `SYMBOL`

Service directory:  
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DGS_Geology/FeatureServer

---

## 1B. Recharge (Section 4)

| Done | Layer | ID | Count | Save as | Notes |
|------|--------|----|-------|---------|-------|
| [x] | Groundwater Recharge Potential — Kent & Sussex | 0 | ~6,489 | `recharge_ks_{offset}.json` | **No full-class map for NCC** |

```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DGS_GroundwaterRechargePotential/FeatureServer/0/query?where=1=1&outFields=*&f=geojson&resultOffset=0
```
(Page offset 2000, 4000, 6000 — skip empty last page)

Field: `RECHARGE`

---

## 1C. Quad / location index (Site refs → GM + HA cites)

Service: `Boundaries/DE_Index/FeatureServer`

| Done | Layer | ID | Count | Save as | Why |
|------|--------|----|-------|---------|-----|
| [ ] | **USGS Quarter Quad Index** | 3 | ~419 | `quads_usgs_0.json` | Site → quad name → atlas links |
| [ ] | State and County Boundaries | 4 | 6 | `boundaries_counties_0.json` | County / Piedmont mode |
| [ ] | Municipalities | 3 | 57 | `boundaries_muni_0.json` | Optional location text |

**Quarter quads:**
```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Boundaries/DE_Index/FeatureServer/3/query?where=1=1&outFields=*&f=geojson&resultOffset=0
```

**Counties:**
```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Boundaries/DE_Boundaries/FeatureServer/4/query?where=1=1&outFields=*&f=geojson&resultOffset=0
```

**Municipalities:**
```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Boundaries/DE_Boundaries/FeatureServer/3/query?where=1=1&outFields=*&f=geojson&resultOffset=0
```

Useful quad fields: `NAME`, `QUADID`, `CENTLAT`, `CENTLONG`, `LATLONG`

---

## 1D. Your boring database (not a map — the core)

| Done | Item | How |
|------|------|-----|
| [x] | Importer works | `import-geo-zips.py` |
| [ ] | All historical `*.GEO.zip` in `geo-zips\` | Copy archive |
| [ ] | Full import run | `python import-geo-zips.py .\geo-zips .\db.json --merge` |
| [ ] | Re-open project folder in app | Loads `db.json` |

---

## 1E. Citation indexes (build once; not bulk polygons)

| Done | File | Purpose | Starting points |
|------|------|---------|-----------------|
| [ ] | `citations/gm_map_index.csv` | Quad/county → DGS Geologic Map # + URL | https://www.dgs.udel.edu/publications |
| [ ] | `citations/ha_atlas_index.csv` | Quad → USGS HA # + plate URL | https://pubs.usgs.gov (search HA + Delaware + quadrangle) |
| [ ] | DGIR bookmark pattern | Section 3.2 live viewer | https://www.dgs.udel.edu/projects/delaware-geologic-information-resource-dgir-web-application |

**Key published maps to cite (examples):**

| Map | Use | Portal |
|-----|-----|--------|
| GM-10 Piedmont bedrock | Northern NCC | https://www.dgs.udel.edu/datasets/dgs-geologic-map-no-10-bedrock-geologic-map-piedmont-delaware-and-adjacent-pennsylvania-dat |
| GM-13 New Castle County | NCC surficial 1:100k | https://www.dgs.udel.edu/datasets/dgs-geologic-map-no-13-new-castle-county-dataset |
| GM-14 Kent County | Kent | DGS publications |
| Sussex quad GMs (e.g. GM-11 Ellendale/Milton) | Sussex detail | DGS publications |
| USGS HA series (Adams & Boggess) | Section 3.1 historical water table | USGS Publications Warehouse |

Example HA plates (incomplete list — expand via quad index):  
HA-60 St. Georges, HA-64 Newark, HA-79 Wilmington, HA-101 Ellendale, HA-102 Milton, HA-133 Milford, …

---

# PHASE 2 — Hydro automation (Section 3 + NCC hydro)

## 2A. Depth to water / water-table elevation (rasters)

| Done | Service | Layers | Type | Notes |
|------|---------|--------|------|-------|
| [x] | `Geology/DGS_DepthToWater/MapServer` | 0 Dry, 1 Normal, 2 Wet | Raster | **App v0.4+ samples online** via Identify (no local download required) |
| [x] | `Geology/DGS_WaterTableElevation/MapServer` | 0 Dry, 1 Normal, 2 Wet | Raster | Same; elevations NAVD 88 |

**App behavior (v0.4):** Map tab checkbox “Sample DGS depth-to-water & WT elevation online” (default on). Click or report generation calls FirstMap Identify; `Classify.Pixel Value` is feet (1-ft resolution). Piedmont → NoData → Section 3.2 “not encountered.” Section 3.1 (HA atlas) stays engineer-cited.

Directories:  
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DGS_DepthToWater/MapServer  
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DGS_WaterTableElevation/MapServer  

**Identify (point sample) pattern:**
```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DGS_DepthToWater/MapServer/identify?geometry={LON},{LAT}&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=1&mapExtent={LON-0.05},{LAT-0.05},{LON+0.05},{LAT+0.05}&imageDisplay=800,800,96&returnGeometry=false&f=json
```

Offline county products (optional — only if you want files on disk; app does not need them):  
- Sussex DP 05-01 — https://www.dgs.udel.edu/datasets/digital-water-table-data-sussex-county-delaware-digital-data-product-no-05-01  
- Kent DP 05-03 — https://www.dgs.udel.edu/datasets/digital-water-table-data-kent-county-delaware-digital-data-product-no-05-03  
- NCC DP 05-04 (excl. Piedmont) — https://www.dgs.udel.edu/datasets/digital-water-table-data-new-castle-county-delaware-digial-data-product-no-05-04  

## 2B. New Castle hydro / WRPA (Piedmont Section 4 proxy)

Service: `Hydrology/DE_NCCO_WRPA/FeatureServer`  
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Hydrology/DE_NCCO_WRPA/FeatureServer

| Done | Layer | ID | Count | Save as |
|------|--------|----|-------|---------|
| [ ] | Recharge WRPA | 7 | ~74 | `wrpa_recharge_0.json` |
| [ ] | Cockeysville Formation WRPA | 8 | ~5 | `wrpa_cockeysville_0.json` |
| [ ] | Well Head 300 ft | 4 | ~201 | `wrpa_wellhead_300_0.json` |
| [ ] | Well Head 150 ft | 9 | ~10 | `wrpa_wellhead_150_0.json` |
| [ ] | Flood Plains | 2 | ~1091 | `wrpa_floodplains_{offset}.json` |
| [ ] | Erosion Prone Slopes | 1 | ~246 | `wrpa_erosion_0.json` |
| [ ] | Class B / C WRPA | 5, 6 | small | `wrpa_class_b_0.json` / `wrpa_class_c_0.json` |

Example:
```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Hydrology/DE_NCCO_WRPA/FeatureServer/7/query?where=1=1&outFields=*&f=geojson&resultOffset=0
```

## 2C. Soils (engineering / borrow support)

Service: `Geology/DE_Soils/FeatureServer`  
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DE_Soils/FeatureServer

| Done | Layer | ID | Count | Save as |
|------|--------|----|-------|---------|
| [ ] | Soils Kent | 0 | ~10,508 | `soils_kent_{offset}.json` |
| [ ] | Soils New Castle | 1 | ~6,492 | `soils_ncc_{offset}.json` |
| [ ] | Soils Sussex | 2 | ~14,985 | `soils_sussex_{offset}.json` |

```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DE_Soils/FeatureServer/0/query?where=1=1&outFields=*&f=geojson&resultOffset=0
```
(Change layer id 0/1/2; page by 2000)

## 2D. Unconfined aquifer (Sussex)

`Geology/DGS_UnconfinedAquifer/MapServer` — Transmissivity / Thickness / Base elevation (rasters)  
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology/DGS_UnconfinedAquifer/MapServer

---

# PHASE 3 — Engineering constraints

| Done | Dataset | Service | Notes |
|------|---------|---------|-------|
| [ ] | Watersheds HUC12 | `Hydrology/DE_Watersheds` layer **5** (~365) | Good project-scale unit |
| [ ] | Wetlands 2017 | `Hydrology/DE_Wetlands` layer **6** (~52k) | Large; page carefully |
| [ ] | Major rivers / lakes | `Hydrology/DE_Water` layers 0, 2 | Hydrography |
| [ ] | Tax ditches | `Hydrology/DE_TaxDitch` | Coastal Plain drainage |
| [ ] | FEMA DFIRM | `Hydrology/DE_DFIRM/MapServer` | Flood; MapServer (complex) |
| [ ] | Coastal Zone | `Environmental/DE_Coastal_Zone` | Regulatory |
| [ ] | Coastal inundation 2017 | `Environmental/DE_Coastal_Inundation_2017` | Climate / design |
| [ ] | Contours 2014 | `Elevation/DE_Contours_2014` | Large |
| [ ] | Road centerlines | `Transportation/DE_Roadways_Main` | Corridor queries |
| [ ] | DelDOT assets | `Transportation/DE_Assets` | Tie to poles/bridges |

**HUC12 watersheds:**
```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Hydrology/DE_Watersheds/FeatureServer/5/query?where=1=1&outFields=*&f=geojson&resultOffset=0
```

**Wetlands 2017 (large):**
```
https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Hydrology/DE_Wetlands/FeatureServer/6/query?where=1=1&outFields=*&f=geojson&resultOffset=0
```

FirstMap folder browsers:  
- Geology: https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Geology  
- Hydrology: https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Hydrology  
- Boundaries: https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Boundaries  
- Transportation: https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Transportation  
- Environmental: https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Environmental  
- Elevation: https://enterprise.firstmap.delaware.gov/arcgis/rest/services/Elevation  

---

# PHASE 4 — AI / prediction enrichment

| Done | Data | Source | Role |
|------|------|--------|------|
| [x] | DGIR / DGS well inventory + log PDFs | `download-dgir-wells.bat` → `refs/dgir_wells.json` (AGOL NGGDPP mirrors; classic `maps.dgs.udel.edu` GeoServer often offline) | Nearby DGS lith + geophys logs with PDF/LAS links |
| [x] | DGS geophys coarse/fine zones | `download-dgir-geophys.bat` → `dgir-geophys-csv/` + `refs/dgir_geophys_zones.json` (~2.2k gamma/induction CSVs) | Screening sand vs clay/silt packages; shallow fines risk for infil |
| [ ] | DGIR structured lithology intervals (WFS WellLog) | http://maps.dgs.udel.edu/geoserver/dgs/ows | Interval text when GeoServer is reachable |
| [ ] | DGS digital datasets catalog | https://www.dgs.udel.edu/data | Master list of downloadable products |
| [ ] | DGS OGC / web services | https://www.dgs.udel.edu/web-services | WMS/WFS alternatives |
| [ ] | DNREC monitoring / facilities | FirstMap `Environmental/DE_DNREC_*` | Environmental constraints |
| [ ] | Historical geo-report PDF archive | Your M&R files | Mine Sections 2–4 / 8 patterns |
| [ ] | Lab / field density (optional later) | LabTrak or exports | Compaction / borrow performance |
| [ ] | Feature store export | Built by app | Every boring → geology, N, soils, flood, recharge/WRPA, DTW, … |

---

# Honest gaps (do not hunt for missing maps)

| Gap | Reality | App rule |
|-----|---------|----------|
| Full recharge classes in NCC | Do not exist (Andres method = Coastal Plain) | Use WRPA + “not encountered” |
| Depth-to-water in Piedmont | Often NoData | Same fallback as 2016 Hockessin reports |
| HA atlas every quad | Incomplete 1960s series | Cite when index has a match |
| Entire LiDAR DEM in `refs` | Too large | Use tile index + on-demand |

---

# Verification tests (after Phase 1)

| Click location | Expect geology | Expect recharge | Expect borings |
|----------------|----------------|-----------------|----------------|
| Dover / SR 1 corridor | Surficial unit | Yes (K/S) | Yes if imported |
| Hockessin | **Piedmont** unit (e.g. Cockeysville / Wissahickon family) | No | Only if you imported those jobs |
| Ocean / Bay | Offshore or none | No | Rare |
| PA / MD just over line | Often none | No | No |

---

# Recommended next 3 actions

1. Install **Geo_Report_Center.html v0.11** (full layer pack + DNREC FoS + climate blender).  
2. Run **`download-all-refs.bat`** (or `python download-all-refs.py`) overnight — fills `refs\` with geology, soils, WRPA, wetlands, flood, tax ditches, DNREC septic borings / GMZ / wellheads, coastal, roads, etc. Use `--all` for wells + LULC + DEN (~hundreds of thousands of points).  
3. Open project folder in the app → Map click → confirm septic PercRate / GMZ / wetlands appear with geology & soils.

---

# FULL PACK (v0.11) — `download-all-refs.py`

Default download (no flags) pulls **recommended full pack**. Optional:

| Flag | Adds |
|------|------|
| `--core` | Geology + recharge + quads/counties only |
| `--include-wells` | ~174k DNREC non-public wells |
| `--include-lulc` | 2022 land use / land cover |
| `--include-den` | ~163k DEN facility points |
| `--all` | Full pack + wells + LULC + DEN |
| `--list` | Print catalog |

**Online-only rasters** (no GeoJSON download — app Identify):

- `Geology/DGS_DepthToWater/MapServer`
- `Geology/DGS_WaterTableElevation/MapServer`
- `Geology/DGS_UnconfinedAquifer/MapServer` (Sussex T / thickness / base)

**DNREC Planning & Engineering** (`PlanningCadastre/DE_DNREC_Planning_and_Engineering`):

| Prefix | Layer | ~Count |
|--------|-------|--------|
| `dnrec_septic_site_evals` | 0 | 71k |
| `dnrec_septic_soil_borings` | 1 | 112k (has PercRate) |
| `dnrec_wellhead_protection` | 2 | 1.2k |
| `dnrec_soil_feasibility` | 3 | 579 |
| `dnrec_gmz` | 4 | 95 |
| `dnrec_sussex_landfills` | 5 | 18 |

Point layers query **nearest within 500 ft** on map click (up to **12** septic borings / site evals; **5** for other point kinds). Polygons use point-in-polygon. Lines (tax ditches / rivers / roads) use nearest vertex within 200 ft.

**Site Intel → Septic deck (v0.27+):** lists soil-boring attributes (Profile, PercRate, DepthtoLZ, LZReason, PercRateMethod, OptionArea) and site-evaluation fields (permit, approved system, address, evaluator, dates). DEN DocumentLink is not shown — public records almost never include usable attachments.

---

*Last verified against FirstMap REST: 2026-07-22*


# NRCS property join (v0.15)

Run `python download-nrcs-soil-props.py` (or `download-all-refs.py`) to write:

- `refs/nrcs_de_by_mukey.json` — app lookup (FirstMap `SOILKEY` ↔ `mukey`)
- `refs/nrcs_de_by_mukey.csv` — spreadsheet

Fields: Ksat (in/hr), AASHTO, USCS, drainage, flood/pond, restrictive depth, engineering ratings (roads / shallow excavations / sand source).

Open project folder so the app loads the JSON. Map click shows **NRCS mapunit properties** and blends Ksat into screening infil.

## Field infiltration anchors (v0.28)

DelDOT Materials & Research **Borehole Infiltration Test** PDFs → `refs/infil_anchors.json`.

```bat
pip install pypdf pyproj
REM drop PDFs into infil-pdfs\
import-infil-pdfs.bat
```

Or: `python import-infil-pdfs.py path\to\pdf-or-folder --project . --merge`

Each anchor stores Measured Rate (in/hr), Easting/Northing (DE SP ft → lat/lon), Test ID, depth, 4″ pipe, contract, date. Design rate = measured ÷ 2.5 for cased borehole. GeoTrak loads the JSON on Open project folder; amber map markers; Site Intel → **Anchors**. Within **75 ft**, measured rate overrides map/septic screening.


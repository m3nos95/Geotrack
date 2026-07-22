# DelDOT GeoTrak — Technical White Paper

**Product:** DelDOT GeoTrak  
**Application file:** `Geo_Report_Center.html` (current release **v0.25**)  
**Audience:** DelDOT geotechnical / materials staff, consultants supporting DelDOT work  
**Classification:** Technical description of capabilities and screening methods  
**Status:** Informational software tool — not a sealed engineering document  

---

## 1. Executive summary

DelDOT GeoTrak is a browser-based reconnaissance and draft-documentation platform for Delaware geotechnical work. It combines:

1. A local **historic boring database** built from GEOSYSTEM exports  
2. Statewide **FirstMap / DNREC** reference layers  
3. An interactive **map Site Intel** console for point-click screening estimates  
4. Draft **DelDOT memo** and **DNREC BMP Appendix 1** report generators  

The program is designed so that clicking a map location immediately surfaces soils, geology, neighbor borings, AASHTO/USCS class estimates, infiltration screening rates, DNREC septic PercRate context, and DGS water-table information — without requiring a long sidebar scroll.

**Critical framing:** All rates and classifications produced by GeoTrak are **screening / planning estimates**. They do not replace ASTM D5126 field permeability testing, project borings, laboratory classification, seasonal high water table determination, or Delaware PE/PG sealed design.

---

## 2. Purpose and intended use

### 2.1 What GeoTrak is for

- Rapid site reconnaissance using existing DelDOT / consultant GEO archives  
- Spatial context from public Delaware GIS (geology, soils, flood, wetlands, WRPA, septic)  
- Early-stage judgment support for infiltration feasibility, borrow/subgrade character, and groundwater depth  
- Assembly of draft Word reports in familiar DelDOT / DNREC structures  

### 2.2 What GeoTrak is not

- Not a substitute for site-specific exploration or sealed geotechnical recommendations  
- Not an approved DNREC design infiltration rate calculator  
- Not a LabSuite replacement for formal AASHTO / USCS determination  
- Not authoritative for Piedmont depth-to-water where DGS grids return NoData  

---

## 3. System architecture

| Component | Description |
|-----------|-------------|
| **Runtime** | Single HTML application opened in Chrome or Edge |
| **Project folder** | User selects a local folder via the File System Access API (“Open project folder”) |
| **`db.json`** | Canonical boring database `{ borings, cores, jobs }` |
| **`refs/`** | GeoJSON reference layers + optional `nrcs_de_by_mukey.json` |
| **Online services** | FirstMap Identify (DGS DTW / WTE / aquifer); Open-Meteo (climate blender) |
| **Libraries (inlined)** | Leaflet, Proj4, SheetJS, JSZip, docx |

**Coordinate systems:** Delaware State Plane (feet) ↔ WGS84 via Proj4. Map display is geographic; boring coordinates may be imported as State Plane or lat/lon.

**Suggested local layout:**

```text
Ultimate Geo Program/
├── Geo_Report_Center.html      ← DelDOT GeoTrak app
├── db.json
├── geo-zips/                   ← *.GEO.zip archives
├── refs/                       ← FirstMap / DNREC / NRCS JSON
└── (importers / download scripts)
```

---

## 4. User interface overview

### 4.1 Header and tabs

| Tab | Function |
|-----|----------|
| **Map** | Interactive map, search radius, layer toggles, hydro/climate options, Site Intel |
| **Reference data** | Load/enable GeoJSON; export database; purge out-of-state borings; export feature store CSV |
| **Jobs** | Import a job from Summary.XLS + coordinate sheet |
| **Report** | Draft DelDOT memo or DNREC Soil Investigation `.docx` |

### 4.2 Map controls

- **Estimate radius (lateral):** slider 250–5,280 ft (default **500 ft**) — used for neighbor borings and septic IDW  
- **Basemap:** streets / satellite toggle  
- **Phase 2 hydro grids:** sample DGS depth-to-water & water-table elevation online  
- **Aquifer (Sussex):** sample unconfined aquifer transmissivity / thickness / base  
- **Climate blender:** weight dry/normal/wet DTW using recent precip vs normals + season  
- **Immersive HUD:** Site Intel console (default on)  

### 4.3 Site Intel console (immersive mode)

On map click, GeoTrak flies to the point and opens a dual-panel console:

**Left rail (always visible headlines)**  
Brief · Site · Infil · Septic · Class · Column · Layers · Borings · Hydro  

**Right deck (full detail for the selected topic)**  
Tables, sticks/pies, septic PercRate lists, neighbor lab expanders, hydro dry/normal/wet  

**Top badges**  
Illustrative design rate · AASHTO · septic · DTW / separation status  

Esc or **Exit** dismisses the console. With immersive off, a compact classic sidebar summary is shown instead.

---

## 5. Data inputs

### 5.1 Boring database (`db.json`)

Built primarily by `import-geo-zips.py` from GEOSYSTEM `*.GEO.zip` archives (PDT/NDX, LIMCOMB/GSCOMB, sample `.LIM` / `.GS` files).

**Boring fields (conceptual):** job, boring ID, lat/lon (and State Plane), end of boring, samples with depth, description, Atterberg limits, P10/P200, USCS, AASHTO, SPT blows → \(N\).

**Jobs tab import:** Summary.XLS (GEOSYSTEM lab export) + coordinates workbook/CSV (DE State Plane ft or lat/lon).

### 5.2 Reference layers (`refs/`)

Downloaded via `download-all-refs.py` / `.bat` / `.ps1`. Typical pack includes:

| Kind | Content |
|------|---------|
| Geology | Surficial, Piedmont, offshore |
| Soils | FirstMap soils (SOILNAME, SOILSYM, SOILKEY, HYDGRP/RATING, drainage) |
| Water resources | Kent/Sussex recharge, NCC WRPA, GMZ, wellheads |
| Hazards / environment | FEMA flood, wetlands, coastal, tax ditches |
| DNREC septic | Soil borings with PercRate, evaluations, feasibility |
| Transportation | Roads / assets (as available) |
| NRCS join | `nrcs_de_by_mukey.json` — Ksat, AASHTO, USCS by mukey |

**Join key:** FirstMap `SOILKEY` ↔ NRCS `mukey`.

### 5.3 Online hydro surfaces

| Service | Layers used |
|---------|-------------|
| DGS Depth to Water | Dry / normal / wet grids |
| DGS Water Table Elevation | Dry / normal / wet (NAVD) |
| DGS Unconfined Aquifer (Sussex) | Transmissivity, thickness, base |
| Open-Meteo | Recent ~30-day precip vs 10-year same calendar window |

---

## 6. Spatial query model

When the user clicks the map at \((\phi,\lambda)\):

1. **Polygon layers** — point-in-polygon hits (geology, soils, flood, wetlands, WRPA, …)  
2. **Point layers** (e.g. septic borings) — nearest features within **500 ft** (up to 5)  
3. **Line layers** (tax ditch / hydrography / roads) — nearest within **200 ft**  
4. **Neighbor borings** — up to **`PROFILE_K = 16`** borings within the **estimate radius** (default **500 ft**, slider-controlled)  
5. **Online hydro** — Identify samples at the click (if enabled)  

Distance uses a local feet-per-degree approximation (`FT_PER_DEG_LAT ≈ 364,000`).

---

## 7. Estimation engines (technical)

All profile logic is centered on `buildSiteProfile(lat, lon, hits, radiusFt)` in the application script.

### 7.1 Neighborhood statistics

| Constant | Value | Meaning |
|----------|-------|---------|
| `PROFILE_RADIUS_FT` | 500 (default; UI override) | Lateral search for neighbor borings |
| `PROFILE_K` | 16 | Cap on neighbors used |
| IDW power | 2 | Weight \(w = 1/d^{2}\) (exact hit if \(d < 1\) ft) |

### 7.2 Near-surface classification (≤ 15 ft)

**Intent:** Estimate the AASHTO and USCS class that best represents the upper soil column at the click, from neighbor borings — not from the soils map alone.

**Method (`estimateLocationClass`):**

1. For each neighbor boring, collect AASHTO/USCS labels on samples with depth ≤ **15 ft**  
2. Take the per-boring majority  
3. Distance-weight those majorities (IDW \(1/d^{2}\)) across neighbors  
4. Report winning class, confidence %, and mix  

**USCS when blank in GEO:** screening estimate from P200 / LL / PI / description / AASHTO (`estimateUscsFromLab`, ASTM D2487–style logic).

**NRCS mapunit fallback:** If no neighbor class samples exist, GeoTrak may show NRCS Soil Data Access AASHTO/USCS for the FirstMap mapunit.  

**Important — A-8 / PT:** Official AASHTO M 145 highway groups are **A-1 through A-7 only**. NRCS often tags hydric mapunits (e.g. Fallsington FacA) as **A-8** + USCS **PT** (organic/peat engineering interpretation). GeoTrak labels these as **NRCS organic mapunit tags**, not M 145 classes from borings, and does **not** use A-8 to drive infiltration.

### 7.3 Soil column sticks (0–50 ft)

| Constant | Value |
|----------|-------|
| `CLASS_COL_DEPTH_FT` | **50 ft** |

**Methods:**

- `estimateClassColumn` — thickness-weighted IDW mix of AASHTO/USCS over 0–50 ft → pie charts  
- `estimateClassStick` — 1-ft bins, IDW vote per bin, merge runs → stick profile graphics  

**Upper 20 ft** (`upperStickDominant`) is also used to detect dominant granular material for infiltration.

### 7.4 Infiltration screening

GeoTrak estimates a **screening** infiltration rate (in/hr), then an **illustrative design** rate by dividing by FoS 2.5.

#### 7.4.1 Material bands (borehole-scale screening)

Calibrated toward Delaware Coastal Plain borehole experience (not ASTM design tables).

**By NRCS hydrologic group (`INFIL_BANDS`):**

| HYDGRP | Screening band (in/hr) |
|--------|-------------------------|
| A | 5 – 30 |
| B | 1.5 – 12 |
| C | 0.3 – 3 |
| D | 0.05 – 0.8 |

**By AASHTO group (`INFIL_AASHTO_BANDS`):**

| AASHTO | Screening band (in/hr) |
|--------|-------------------------|
| A-1-a | 15 – 60 |
| A-1-b / A-1 | 12 – 50 |
| A-3 | 10 – 40 |
| A-2-4 / A-2-5 | 2 – 15 |
| A-2-6 / A-2-7 | 0.5 – 5 |
| A-4 / A-5 | 0.2 – 2 |
| A-6 / A-7 | 0.05 – 0.5 |

Lab P200 and thick granular intervals in the upper column can nudge bands toward the higher or lower end.

#### 7.4.2 NRCS Ksat

Surface horizon Ksat (µm/s → in/hr, factor **0.141732**) is joined by mukey. For granular / HYDGRP A sites, the band is opened toward approximately **0.75× to 3×** map Ksat to allow borehole rates that often exceed NRCS surface Ksat.

#### 7.4.3 DNREC septic PercRate

PercRate in the septic layer is typically **minutes per inch**. Conversion:

\[
q_{\mathrm{in/hr}} = \frac{60}{\mathrm{mpi}}
\]

Nearby septic points are IDW-averaged. This is a **screening proxy only** — it is not Appendix 1 ASTM permeability.

#### 7.4.4 Blend

Midpoints of available sources are weighted:

| Source | Typical weight behavior |
|--------|-------------------------|
| HYDGRP / map / Ksat | Strong when Ksat present; reduced if far below sand AASHTO |
| AASHTO (esp. column) | Highest weight when upper column is granular |
| Septic IDW | Light; further reduced if it would crush a clear sand site |

\[
q_{\mathrm{est}} = \frac{\sum w_i\,q_i}{\sum w_i}
\]

#### 7.4.5 Illustrative design FoS

| Constant | Value | Basis |
|----------|-------|-------|
| `DNREC_BOREHOLE_FOS` | **2.5** | DNREC BMP Appendix 1 §II.A.4 — cased borehole / undersized rings |

\[
q_{\mathrm{design, illustrative}} = \frac{q_{\mathrm{est}}}{2.5}
\]

**Preferred DNREC field methods** are full-size single/double-ring infiltrometers (ASTM D5126). FoS 2.5 is specified for cased borehole / undersized-ring paths. Applying ÷2.5 to map/AASHTO/septic estimates is an **illustrative borehole-path planning number**, not an approved design rate.

#### 7.4.6 Groundwater separation (App.1 §II.A.3)

| Constant | Value |
|----------|-------|
| `DNREC_SEP_FT` | **2 ft** |

After hydro sampling, GeoTrak checks depth to water (preferring wet → climate-now → normal):

- **DTW &lt; 2 ft:** material screening rate kept; **illustrative design withheld**; separation flagged fail  
- **2 ≤ DTW &lt; 4 ft:** meets separation but notes possible mounding analysis (§I.B.2)  
- **DTW ≥ 4 ft:** no separation flag  

### 7.5 Subgrade rating (AASHTO M 57 / M 145)

Uses near-surface (prefer ≤ **5 ft**, fallback 10 ft) AASHTO groups from neighbor borings:

- Group Index (GI) per M 145 formulas  
- Qualitative band (excellent–good vs fair–poor)  
- M 57–style rating Excellent → Very poor with numeric score  
- Site aggregate via IDW of scores / GI / \(N\) plus majority rating  

Explicitly **not** the DelDOT pole/N-chart subgrade procedure (that chart is used only in the report pole annex).

### 7.6 Hydro / climate blender

1. Sample dry / normal / wet DTW and WTE from FirstMap  
2. Fetch recent precip and 10-year same-window climatology (Open-Meteo)  
3. Build weights: dry-heavy if precip ratio low; wet-heavy if high; seasonal nudge (spring wetter, late summer drier)  
4. Produce climate-conditioned **DTW now** / WTE now for screening text and separation checks  

### 7.7 Report-only computations (not Site Intel cards)

- **Pole base cases** from DelDOT Pole Base Selection / Table IV-11 using uncorrected field \(N\) and soil condition rules  
- Weak-zone / upper–lower zone summaries in the Computed Observations annex  

---

## 8. Report generation

### 8.1 DelDOT geo-report memo

Generates a `.docx` in DelDOT memo structure, including:

1. Introduction  
2. Area geology (from reference hits + placeholders)  
3. Ground water / FirstMap DTW narrative (optional climate blend)  
4. Hydrologic soils / recharge / WRPA  
5. Ground cover  
6. Groundwater observations  
7. Laboratory testing summary  
8. Recommendations (**engineer**)  
9. Limitations  

Yellow-highlighted fields mark engineer input. A **Computed Observations** annex holds strata/\(N\)/pole working notes intended for removal before issuing.

### 8.2 DNREC BMP Appendix 1 Soil Investigation draft

Draft structured to Appendix 1 (Eff. Feb 2019) reporting expectations: certification block, screening of NRCS/DGS/septic context, exploration notes, permeability testing placeholders (ASTM D5126), FoS language for borehole path, confirmatory testing reminder (≥ **150%** of approved design), limitations.

Again: draft / screening work product until field tests and PE/PG seal are complete.

---

## 9. Supporting utilities

| Tool | Role |
|------|------|
| `import-geo-zips.py` | Bulk GEO.zip → `db.json` |
| `zip-geo-folders.py` | Pack unpacked `.GEO` folders |
| `download-all-refs.py` / `.bat` / `.ps1` | FirstMap / DNREC GeoJSON pack |
| `download-nrcs-soil-props.py` | NRCS Soil Data Access → mukey property table |
| `build-feature-store.py` | Offline boring×map CSV (infil bands + FoS) |
| `repair-db.py` / `compact-db.py` | Scrub invalid JSON; compact large `db.json` |
| `purge-outside-de.py` | Remove borings outside Delaware |
| `open-app.bat` | Launch the HTML app in Edge |
| `DATA_INVENTORY.md` | Statewide layer inventory and setup checklist |

In-app **Export feature store (CSV)** produces a similar join for all mapped borings.

---

## 10. Capability timeline (selected)

| Version | Capability |
|---------|------------|
| Early | Jobs import, basic map, DelDOT memo draft |
| v0.4+ | Online DGS DTW/WTE Identify |
| v0.8+ | Screening infiltration from soils / lab |
| v0.11 | Full DE layer pack, DNREC FoS labeling, climate blender |
| v0.15 | NRCS mukey property join (Ksat / class) |
| v0.17 | Lateral estimate radius (default 500 ft); column depth 50 ft |
| v0.18–0.19 | Immersive HUD; AASHTO-driven infil without septic |
| v0.20 | App.1 separation check; clearer FoS labeling |
| v0.21 | Removed depth-to-borrow estimate |
| v0.22 | Borehole-scale infil band recalibration (DE field realism) |
| v0.23 | Site Intel rail/deck UI; dedicated Septic topic |
| v0.24 | Clarify NRCS A-8/PT vs AASHTO M 145 |
| v0.25 | Product branding: **DelDOT GeoTrak** |

---

## 11. Worked example (conceptual)

**Observed field test (cased 4″ borehole, Coastal Plain sand):** measured ≈ 43 in/hr → App.1 borehole design ≈ 43 / 2.5 ≈ **17 in/hr**.

**GeoTrak at a similar A-1-b + HYDGRP A + NRCS Ksat ≈ 13 in/hr site (post-v0.22):**  
screening mid-20s in/hr → illustrative ÷2.5 ≈ **11 in/hr** — same order of magnitude as field design, still labeled screening / illustrative.

Pre-calibration bands (&lt;1 in/hr HYDGRP-style) produced illustrative designs near **1.5 in/hr** and were judged unrealistic against Delaware borehole sand tests.

---

## 12. Governance and responsibility

| Role | Responsibility |
|------|----------------|
| **GeoTrak** | Compile data, screen, draft text, visualize |
| **Licensed PE / PG** | Exploration plan, field permeability, SHWT, sealed rates and recommendations |
| **DNREC / Delegated Agency** | Accept design rates based on App.1 procedures and confirmatory testing |

Users should retain citations for FirstMap / DGS products and NRCS Soil Data Access when reports leave the reconnaissance stage.

---

## 13. Key constants reference

| Name | Value | Use |
|------|-------|-----|
| `PROFILE_RADIUS_FT` | 500 (UI default) | Lateral neighbor / estimate radius |
| `PROFILE_K` | 16 | Max neighbor borings |
| `CLASS_COL_DEPTH_FT` | 50 | Column sticks / pies |
| Location class depth | 15 ft | Near-surface AASHTO/USCS IDW |
| Upper stick for infil | 20 ft | Granular dominance |
| `DNREC_BOREHOLE_FOS` | 2.5 | Illustrative design = est ÷ FoS |
| `DNREC_SEP_FT` | 2 | Min separation to GW / limiting layer |
| Septic / point query | 500 ft | Nearest septic points |
| Line query | 200 ft | Tax ditch / hydro / roads |
| Ksat conversion | 0.141732 | µm/s → in/hr |

---

## 14. Document control

| Item | Value |
|------|-------|
| Product name | DelDOT GeoTrak |
| App file | `Geo_Report_Center.html` |
| Described release | v0.25 |
| Repository path | `geo-report-center/` |
| Primary specification references | AASHTO M 57 / M 145; ASTM D2487 (USCS screening); ASTM D5126; DNREC BMP Standards & Specs Appendix 1 (Eff. Feb 2019) |

*This white paper describes software behavior as implemented. Field design must follow current DelDOT and DNREC standards and the judgment of the licensed professional of record.*

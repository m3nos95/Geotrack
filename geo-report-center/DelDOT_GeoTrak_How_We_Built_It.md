# DelDOT GeoTrak — How We Built It  
## From DNREC JSON to Logic-Based Infiltration Screening  
### A Complete Development Narrative

**Product:** DelDOT GeoTrak (`Geo_Report_Center.html`)  
**Current release described herein:** **v0.37**  
**Author context:** Built for Aaron W / DelDOT Materials & Research geotechnical workflow  
**Repository branch (this era):** `cursor/prediction-profile-engine-8782`  
**Companion docs:** `DelDOT_GeoTrak_Technical_White_Paper.md`, `DATA_INVENTORY.md`  

**Framing for every reader:**  
GeoTrak is a **desktop screening and draft-documentation tool**. Nothing in this paper claims sealed PE/PG design, DNREC Appendix 1 approval, or Phase I ESA equivalence. Illustrative infiltration rates are planning numbers.

---

## Abstract

This paper tells the full story of how DelDOT GeoTrak grew from a local boring-map viewer into a statewide reconnaissance engine: ingesting FirstMap and DNREC GeoJSON, joining NRCS Soil Data Access properties, blending multiple infiltration priors into a conservative screening estimate, anchoring that estimate with DelDOT field borehole tests, pulling DGS well inventories, and finally letting an engineer draw project limits and receive a qualitative site summary with a marked “best infiltration” cell.

It is written from the product’s actual evolution (v0.19 → v0.37), the data inventory checklist, the import/download scripts, and the working decisions made while refining the infiltration logic — including what DNREC GIS does *and does not* contain.

---

## 1. Why this existed

DelDOT geotechnical work in Delaware repeatedly needs the same early questions answered:

1. What geology and soils sit under this corridor / site?  
2. What do our historic GEO borings nearby say (AASHTO, USCS, P200, \(N\))?  
3. Is infiltration even plausible for stormwater BMP design under DNREC Post-Construction standards and Appendix 1?  
4. What red flags exist — wetlands, floodplain, GMZ, wellhead, UST/LUST, brownfields?  
5. Can we draft a familiar memo / soil investigation report without starting from a blank Word file?

The data to answer those questions already existed in pieces:

- DelDOT / consultant **GEOSYSTEM** archives (`.GEO.zip`)  
- Delaware **FirstMap** REST services (geology, soils, flood, wetlands, WRPA, …)  
- **DNREC** septic planning layers published through FirstMap (soil borings, site evaluations, GMZ, wellheads, …)  
- **NRCS** Soil Data Access (Ksat, mapunit engineering ratings)  
- **DGS** depth-to-water grids and, later, borehole log inventories  

What did not exist was a single offline-capable browser tool that joined those pieces at a clicked coordinate — and later inside a drawn project polygon — with explicit DelDOT / DNREC screening language.

GeoTrak is that join.

---

## 2. Architecture chosen (and why)

### 2.1 One HTML file, one project folder

Runtime is deliberately simple:

| Piece | Role |
|-------|------|
| `Geo_Report_Center.html` | Entire UI + Leaflet map + estimation engines + `.docx` generators |
| User “Open project folder” | File System Access API → local `db.json` + `refs/` |
| `db.json` | Canonical boring database |
| `refs/*.json` | FirstMap / DNREC GeoJSON pages + special JSON (NRCS, infil anchors, DGIR wells, mukey priors) |
| Online (optional) | FirstMap Identify for DGS DTW/WTE/aquifer; Open-Meteo for climate blender |

**Why this shape:** DelDOT staff often work on OneDrive-synced Windows machines with large GEO archives. A pure web SaaS would fight IT and data size. A local folder + Chrome/Edge app lets the boring DB stay private while still calling public GIS when online.

### 2.2 Coordinate systems

- Boring imports often arrive as **Delaware State Plane feet**  
- Map display is **WGS84** via Proj4  
- Distance queries use a local feet-per-degree approximation (`FT_PER_DEG_LAT ≈ 364,000`)

### 2.3 Suggested project layout

```text
Ultimate Geo Program/
├── Geo_Report_Center.html
├── db.json
├── geo-zips/                  ← *.GEO.zip archives
├── infil-pdfs/                ← DelDOT borehole infil PDFs (optional)
├── refs/                      ← FirstMap / DNREC / NRCS / DGIR JSON
│   ├── geology_surficial_0.json …
│   ├── soils_sussex_0.json …
│   ├── dnrec_septic_soil_borings_0.json …
│   ├── nrcs_de_by_mukey.json
│   ├── infil_anchors.json
│   ├── dgir_wells.json
│   └── mukey_priors.json
└── (import / download / build scripts + .bat launchers)
```

---

## 3. Chapter I — Getting the DNREC / FirstMap JSON files

### 3.1 The inventory-first approach

Before fancy estimates, the project needed **layers on disk**. That work is documented in `DATA_INVENTORY.md` and automated by `download-all-refs.py` (plus `.bat` / `.ps1` wrappers).

Base endpoint:

```text
https://enterprise.firstmap.delaware.gov/arcgis/rest/services
```

GeoJSON paging pattern (2,000 features per page):

```text
{SERVICE}/FeatureServer/{LAYER_ID}/query?where=1=1&outFields=*&f=geojson&resultOffset={0,2000,4000,…}
```

Paged files with the same prefix merge in the app. Empty pages stop the downloader.

### 3.2 What “getting DNREC JSON” actually means

DNREC does not ship a single “all septic reports” file to GeoTrak. What is public through FirstMap is an **enterprise geodatabase view** of Delaware Environmental Navigator (DEN) tables:

| FirstMap layer | Approx. size | What arrives in GeoJSON |
|----------------|--------------|-------------------------|
| Septic Site Evaluations (layer 0) | ~71k points | Permit/status, evaluator, dates, address, approved system type, `DocumentLink` |
| Septic Soil Borings (layer 1) | ~112k points | `Profile`, `PercRate`, `DepthtoLZ`, `LZReason`, `PercRateMethod`, option area |
| Wellhead protection (2) | ~1.2k | WHPA polygons / attributes |
| Soil feasibility (3) | ~579 | Feasibility study footprints |
| GMZ (4) | ~95 | Groundwater Management Zones |
| Sussex landfills (5) | ~18 | Landfill features |

**Critical honesty discovered while building the septic browser (v0.27) and later confirmed against the live FeatureServer schema:**

- Site-evaluation **`BoringDetails` and `SoilsReview` are date fields**, not hand-auger narratives.  
- **`DocumentLink`** points at DEN permit detail pages; usable public PDF attachments are rarely present (dead “Open DEN record” UI links were removed for that reason).  
- Soil-boring GIS attributes are **tabular** (PercRate in minutes/inch, depth to limiting zone, reason codes) — **not** complete horizon logs.

So “getting DNREC JSON” gave GeoTrak a powerful **spatial index of septic investigations**, not the complete licensed site-evaluator report library.

### 3.3 The rest of the Phase 1–3 pack

`download-all-refs.py` catalog groups:

| Group | Examples |
|-------|----------|
| **core** | Surficial / Piedmont / offshore geology; Kent–Sussex recharge; USGS quads; counties |
| **soils_wrpa** | Kent / NCC / Sussex soils; NCC WRPA classes |
| **hydro** | HUC12, wetlands 2017, tax ditches, rivers/lakes, FEMA DFIRM, tidal buffer |
| **dnrec** | Septic evals/borings, wellhead, feasibility, GMZ, permits (UST/LUST/…), facilities (RCRA, landfills, RS sites), ag wells |
| **coastal** | Coastal zone / inundation |
| **transport** | Road centerlines, bridges, assets |
| **optional `--all`** | Non-public wells, LULC, DEN locations (very large) |

Rasters (DGS DTW / WTE / unconfined aquifer) are **not** downloaded into `refs/`; the app samples them online via MapServer Identify when the user enables Phase 2 hydro.

### 3.4 NRCS property join (`nrcs_de_by_mukey.json`)

FirstMap soils polygons carry `SOILKEY` / mukey-like keys and a hydrologic group `RATING` (A–D), but not full Ksat / engineering ratings. `download-nrcs-soil-props.py` pulls USDA Soil Data Access properties into a compact lookup:

- hydrologic group, drainage class  
- surface Ksat (µm/s → in/hr)  
- NRCS mapunit AASHTO / USCS tags  
- restrictive layer depth/kind, flood/pond frequency, engineering ratings  

**Join key:** FirstMap `SOILKEY` ↔ NRCS `mukey`.

This join became central once infiltration screening preferred **mapunit HYDGRP/Ksat** over neighbor-boring AASHTO alone (v0.31).

---

## 4. Chapter II — Building the boring database

### 4.1 GEOSYSTEM imports

Historic engineering strength sits in DelDOT / consultant **GEOSYSTEM** archives. `import-geo-zips.py` unpacks `*.GEO.zip` and extracts:

- boring identity (job, boring ID)  
- coordinates (State Plane → lat/lon)  
- samples: depth, description, Atterberg limits, P10/P200, USCS, AASHTO, SPT → \(N\)  

Result: `db.json` with `{ borings, cores, jobs }`.

Supporting utilities grew around real Windows / OneDrive pain:

- `repair-db.py` — fix invalid JSON (`NaN` / `Infinity`)  
- `compact-db.py` — shrink file size  
- `purge-outside-de.py` — drop out-of-state points  
- Jobs-tab XLS import for Summary + coordinate sheets  

### 4.2 Feature store (statewide analogs later)

`build-feature-store.py` / in-app **Export feature store** joins each mapped boring to:

geology, soils HYDGRP, recharge, lab stats, screening infil band, illustrative design band (÷2.5), septic proximity, flood/wetland/WRPA flags, …

That CSV later feeds **mukey priors** (v0.34): statewide analogs of what DelDOT borings actually found on each NRCS mapunit.

---

## 5. Chapter III — Point query becomes Site Intel

### 5.1 Spatial query model

On map click at \((\phi,\lambda)\):

1. **Polygon layers** — point-in-polygon (geology, soils, flood, wetland, WRPA, GMZ, …)  
2. **Point layers** — nearest within 500 ft (septic, wells, env sites; septic capped higher for browsing)  
3. **Line layers** — nearest within 200 ft (tax ditch, hydrography, roads)  
4. **Neighbor borings** — up to `PROFILE_K = 16` within estimate radius (default **500 ft**)  
5. **Online hydro** — DTW / WTE / aquifer Identify + optional climate blender  

### 5.2 UI evolution (relevant milestones)

| Version | What changed for the user |
|---------|---------------------------|
| Early | Classic sidebar point query |
| v0.23 | Immersive **Site Intel** HUD (rail + detail deck) |
| v0.25 | Rebrand to **DelDOT GeoTrak** |
| v0.26 | Subsurface mode (GS elev + GWT on stick) |
| v0.27 | Septic deck browses boring + site-eval GIS attributes |
| v0.28–v0.30 | Field infil anchors from DelDOT PDFs |
| v0.31–v0.34 | Conservative map-first infil + caps + mukey analogs |
| v0.35 | DGS DGIR well inventory |
| v0.36–v0.37 | Project limits polygon + best infil + qualitative site summary |

---

## 6. Chapter IV — Developing the logic-based infiltration estimate

This is the heart of the product story. The infiltration engine did not arrive fully formed. It was recalibrated repeatedly against Delaware Coastal Plain borehole reality and DNREC Appendix 1 language.

### 6.1 Regulatory alignment (what ÷2.5 means)

DNREC BMP Appendix 1 (Eff. Feb 2019 / Updated 2019.10.01) §II.A.4:

- Factor of safety **2.5** applies to **cased borehole permeameter** and undersized rings treated as equivalent.  
- Preferred method is full-size single/double-ring (ASTM D5126); App.1 does **not** prescribe FoS 2.5 for those preferred rings.  
- Separation to groundwater / limiting layer ≥ **2 ft** (§II.A.3).  
- Construction confirmatory rate ≥ **150%** of approved design (§II.B).

GeoTrak constants:

```text
DNREC_BOREHOLE_FOS = 2.5
DNREC_SEP_FT       = 2
EST_INHR_CAP       = 10      # screening estimate ceiling
DESIGN_INHR_CAP    = 4       # = 10 / 2.5 illustrative design ceiling
P200_TOP_FT        = 10      # near-surface fines window
```

**Product language:**  
`est_inhr` = screening / estimated field-scale rate  
`design_inhr` = illustrative borehole-path planning rate ≈ `est / 2.5` (unless a field anchor supplies design)  

These are **not** sealed App.1 design rates.

### 6.2 Material band tables (borehole-scale screening)

**By HYDGRP (`INFIL_BANDS`):**

| HYDGRP | Screening band (in/hr) | Intent |
|--------|-------------------------|--------|
| A | 5 – 30 | Sands/gravels |
| B | 1.5 – 12 | Sandy loams |
| C | 0.3 – 3 | Silty / finer |
| D | 0.05 – 0.8 | Clay / restricted |

**By AASHTO (`INFIL_AASHTO_BANDS`)** — anchored toward DE Coastal Plain borehole experience (e.g. SP-SM / A-1-b field tests that can run tens of in/hr):

| AASHTO | Screening band (in/hr) |
|--------|-------------------------|
| A-1-a | 15 – 60 |
| A-1-b / A-1 | 12 – 50 |
| A-3 | 10 – 40 |
| A-2-4 / A-2-5 | 2 – 15 |
| A-2-6 / A-2-7 | 0.5 – 5 |
| A-4 / A-5 | 0.2 – 2 |
| A-6 / A-7 | 0.05 – 0.5 |

Lab **P200** and thick granular intervals in the upper column can nudge bands.

**NRCS A-8 / PT caveat (v0.24):** Official AASHTO M 145 highway groups are A-1–A-7 only. NRCS often tags hydric mapunits as A-8 + PT. GeoTrak labels those as NRCS organic mapunit tags and **does not** drive infiltration from A-8.

### 6.3 Source stack — how a single click builds a rate

Function chain:

```text
map click
  → queryRefs(lat, lon)
  → neighborBorings / enrichFromHits
  → buildSiteProfile(...)
       → HYDGRP/Ksat band (infilFromHydgrp)
       → AASHTO band (infilFromAashto) — only if map soils missing
       → septic PercRate IDW (minutes/inch → 60/mpi)
       → top-10′ P200 prior + hard ceiling
       → mukey analog prior (optional)
       → field anchors (hard ≤75 ft / soft ≤300 ft)
       → applyEstInhrCap / applyDesignInhrCap
  → sampleHydro → applyHydroLimitToInfil (≥2 ft separation gate)
```

#### 6.3.1 Map soils preferred (v0.31 — decisive design choice)

Early blends sometimes let **neighbor AASHTO** overstate near-surface rates (e.g. Matapeake silt loam mapped **C**, while nearby borings showed granular A-1-b at depth).  

**Rule now:** if FirstMap/NRCS supplies HYDGRP and/or Ksat (`hasMapSoils`), that mapunit drives infiltration. Neighbor AASHTO still feeds **Props / subgrade / column**, but not the primary infil blend when map soils exist.

Typical weights when map soils present:

| Source | Weight behavior |
|--------|-----------------|
| HYDGRP / Ksat map mid | ~1.0 – 1.35 (Ksat present → higher) |
| Septic PercRate IDW | light (~0.2 – 0.35), even lighter if HYDGRP A but septic rate tiny |
| AASHTO | **omitted** from infil blend when map soils present |

When map soils are **absent**, AASHTO column / IDW returns with higher weight (~1.2 – 1.6).

#### 6.3.2 DNREC septic PercRate as a light prior

Conversion:

\[
q_{\mathrm{in/hr}} = \frac{60}{\mathrm{mpi}}
\]

Nearby septic soil borings within the search radius are IDW-averaged.  

**Limitations baked into the product:**

- PercRate is often “by soil type,” not a ring/borehole ASTM test  
- It is septic-oriented, not DelDOT App.1 stormwater design  
- Many GIS points lack PercRate entirely  

Hence the light weight and constant UI warnings.

#### 6.3.3 Top-10′ P200 conservatism (v0.33)

Neighbor samples in the upper **10 ft** yield a fines prior (`estimateTopP200` → `infilPriorFromTopP200`):

- Higher P200 → lower prior rate + heavier blend weight  
- Hard **ceilings** after blend (e.g. very high fines → screening capped near ~1.5 in/hr class behavior)

This prevents “deep sand envy” from overstating surface infiltration.

#### 6.3.4 Screening and design caps (v0.33–v0.34)

Even after blending, optimistic Coastal Plain sands could still produce huge screening numbers. Conservative ceilings:

```text
screening est  ≤ 10 in/hr
illustrative design ≤ 4 in/hr   (= 10 / 2.5)
```

Field **measured** anchors can still show their true measured rate in the Anchors deck; the planning design path remains FoS-aware.

#### 6.3.5 Mukey analogs — Step 2 statewide memory (v0.34)

Workflow:

1. Export `feature-store.csv` (every mapped boring × map context)  
2. Run `build-mukey-priors.bat` → `refs/mukey_priors.json`  
3. Re-open project folder  

Priors store, per mukey (and HYDGRP|geology fallback):

- dominant AASHTO/USCS from DelDOT borings on that mapunit  
- median P200  
- mid screening infil  

Used to:

- replace weak NRCS organic class tags when DelDOT analogs exist  
- fill infil gaps with statewide experience on the same soil key  

#### 6.3.6 Field anchors from DelDOT M&R PDFs (v0.28–v0.30)

DelDOT borehole infiltration test sheets (Measured Rate + Easting/Northing) are dropped into `infil-pdfs/`, parsed by `import-infil-pdfs.py`, written to `refs/infil_anchors.json`.

Influence rules (tightened in v0.30):

| Distance | Behavior |
|----------|----------|
| ≤ **75 ft** | Hard override toward measured rate |
| ≤ **300 ft** | Soft pull (weight decays ~0.92 → 0.25) + headroom cap |
| Farther | IDW among anchors in radius; map blend still primary |

4″ cased borehole → design = measured ÷ 2.5 for App.1 borehole-path language.

Windows OneDrive path quoting bugs in the `.bat` launchers were fixed so staff can double-click import without broken trailing-`\` escapes.

#### 6.3.7 Hydro separation gate

After the rate is computed, `sampleHydro` reads DGS dry/normal/wet DTW (optionally climate-blended with Open-Meteo precip).  

If separation to water &lt; 2 ft, illustrative design is withheld / flagged — matching Appendix 1’s limiting-layer / SHWT logic at screening level. Piedmont often returns NoData; the UI says so.

### 6.4 One-sentence summary of the infil philosophy

> **Prefer what the ground’s mapunit says at the surface, temper it with fines and septic context, remember what DelDOT borings found on that mukey statewide, let nearby measured borehole tests dominate when they exist, never pretend the result is sealed App.1 design, and never exceed conservative screening ceilings.**

---

## 7. Chapter V — Beyond a single click

### 7.1 Engineering property forecast (v0.29)

Separate from infiltration, Site Intel **Props** forecasts near-surface subgrade / frost / drainage character from:

- AASHTO group priors  
- DTW  
- NRCS engineering ratings  

Screening judgment support for pavement/subgrade conversations — not CBR or lab strength.

### 7.2 DGS DGIR wells (v0.35)

Classic DGIR GeoServer (`maps.dgs.udel.edu` — `lithsites`, `WellLog`, `Wellheader`) is often unreachable.  

Public **DGS NGGDPP** ArcGIS Online FeatureServers (same family as the DGS Borehole Log Mapper) are downloadable:

```text
download-dgir-wells.bat  →  refs/dgir_wells.json
```

~5,200 wells with lithologic and/or geophysical PDF/LAS/CSV links.  

Teal map markers + Site Intel **DGS** panel.  

**Still missing:** structured interval lithology text from classic WellLog WFS when that host is down — PDFs remain the lithology source.

### 7.3 Project limits + best infiltration cell (v0.36)

User flow:

1. Map → **Project limits** → **Draw limits**  
2. Click vertices → **Close polygon** (or double-click)  
3. **Analyze & find best infil**

Engine:

1. Inventory everything inside the ring (GEO borings, DGS wells, septic, anchors, env points, …)  
2. Adaptive grid (~40–200 ft step, targeting ~80–140 cells)  
3. Score each cell with the same `buildSiteProfile` screening stack  
4. Soft-penalize wetland / GMZ / wellhead / flood flags  
5. Hydro-check top candidates for ≥2 ft separation  
6. Paint green/amber/red heatmap; mark **best** cell with green halo  

### 7.4 Qualitative site summary (v0.37)

After Analyze, GeoTrak writes a narrative **Site summary**:

| Section | Content |
|---------|---------|
| Overall outlook | Grade: favorable / mixed / limited / challenging |
| Setting | Dominant geology, soils, HYDGRP mix, AASHTO votes, recharge/WRPA |
| Infiltration preview | Design rate range, feasible cell fraction, best cell, anchors, septic |
| Groundwater & hydro | DTW, DGS logs, GMZ/wellhead coverage |
| Constraints & issues | Ranked HIGH/MED/LOW issues (poor infil, wetlands, flood, GMZ, wellhead, UST/LUST, RCRA/remedial, landfills, biosolids) |
| Data support | Counts of what was actually found inside the polygon |
| Next steps | Actionable screening advice |
| Copy summary text | Clipboard export |

**Accuracy stance (product truth):**  
With soils/geology/hazard refs loaded, the summary is a **fair early-project screening picture**. It is not a DNREC site evaluation and cannot invent hand-auger narratives that FirstMap never published.

Example live query (Georgetown, Sussex ~800 ft box) showed exactly that honesty in action: dominant HYDGRP C + poor recharge + Georgetown Water wellhead + open NPL/brownfield RS records → **challenging** outlook — useful as a red-flag synthesis, not a sealed report.

---

## 8. End-to-end workflow (how an engineer uses what was built)

```text
1. Collect *.GEO.zip → import-geo-zips.bat → db.json
2. download-all-refs.bat          → refs/ (geology, soils, DNREC, flood, …)
   download-nrcs-soil-props.bat  → refs/nrcs_de_by_mukey.json  (also chained from download-all-refs)
3. Optional:
     infil-pdfs/ + import-infil-pdfs.bat → refs/infil_anchors.json
     download-dgir-wells.bat            → refs/dgir_wells.json
     Export feature store → build-mukey-priors.bat → refs/mukey_priors.json
4. Open Geo_Report_Center.html → Open project folder
5. Map click → Site Intel (point screening)
   OR Draw project limits → Analyze → Site summary + best infil cell
6. Report tab → draft DelDOT memo / DNREC App.1 .docx (still requires PE judgment text)
```

Preferred raw install URL for the development branch:

```text
https://raw.githubusercontent.com/m3nos95/Geotrack/cursor/prediction-profile-engine-8782/geo-report-center/Geo_Report_Center.html
```

---

## 9. Version chronology (this era)

| Ver | Milestone |
|-----|-----------|
| v0.19 | Infil from AASHTO column without requiring DNREC septic |
| v0.20 | Align labeling with DNREC App.1 Feb 2019 |
| v0.22 | Recalibrate screening infil to DE borehole scale |
| v0.23–v0.25 | Immersive Site Intel; rebrand DelDOT GeoTrak |
| v0.26 | Subsurface mode with GS elev + GWT |
| v0.27 | Browse DNREC septic borings & site evals (GIS attributes) |
| v0.28–v0.30 | DelDOT borehole infil PDF anchors; tighten ≤300 ft influence |
| v0.31 | Prefer NRCS mapunit HYDGRP/Ksat over neighbor AASHTO for infil |
| v0.32 | Official DelDOT seal branding |
| v0.33 | Heavier top-10′ P200; design path conservatism |
| v0.34 | Screening est ≤10 → design ≤4; mukey analogs |
| v0.35 | DGS DGIR / NGGDPP well inventory |
| v0.36 | Project limits draw + grid best-infil marker |
| v0.37 | Qualitative polygon site summary + issues list |
| v0.38 | Formal normalized infil blender + exp field-anchor decay + contribution % UI |
| v0.39 | Guided M&R soil-boring request wizard (map pick → purpose → BDM §105 count/depth/tests → .xlsx / print) |

---

## 9b. Addendum — Formal blender (v0.38)

Screening estimate is now an explicit normalized weighted average:

\[
\hat{r}_{\mathrm{est}} = \min\!\left(\mathrm{EST\_INHR\_CAP},\; \frac{\sum_i w_i r_i}{\sum_i w_i}\right)
\]

then \(\hat{r}_{\mathrm{design}} = \min(4,\;\hat{r}_{\mathrm{est}}/2.5)\), with hydro separation gate unchanged.

**Hard rules retained from the pre-formal engine:**

- AASHTO weight = **0** when map HYDGRP/Ksat present  
- P200 **hard ceiling** after the average  
- Mukey weight **restrained** when map Ksat is present (gap-fill otherwise)  
- Field anchors ≤ **75 ft** hard override (95% measured + 5% map smoothness)  
- Soft anchors use \(w \propto e^{-d/120}\) out to ~400 ft  

Site Intel → Infil shows **Contribution %** bars for each source in the normalized blend.

---

## 9c. Addendum — Guided boring request (v0.39)

Map panel → **Request soil borings** walks designers through an M&R subsurface request aligned to BDM §105 / DRC Figure 105-2:

1. Tap boring location(s) on the map  
2. Choose purpose (bridge abutment/pier, wingwall, culvert, retaining wall, signal/light pole, infiltration BMP, roadway, other)  
3. Receive **median boring count**, **guide depth**, and **lab/field test** checklist from §105.4.1 / §105.4.3  
4. Export a draft **.xlsx** (Request / Borings / Lab_Tests sheets) or print a PDF-ready sheet  

Medians are guidelines for limited prior data — not automatic work orders. Attach structure plan, ROW/access, control, and utilities per §105.4.1. Official DRC Excel form remains the submittal vehicle when required.

---

## 10. What we deliberately did *not* claim

1. **DNREC complete site-evaluation reports** — FirstMap gives attribute points and DEN links, not hand-auger PDF libraries.  
2. **Sealed infiltration design** — App.1 ASTM field tests still required.  
3. **Phase I ESA** — UST/LUST/RCRA/landfill hits are screening flags iff layers are loaded.  
4. **Piedmont DTW completeness** — DGS grids often NoData; UI must say so.  
5. **Classic DGIR interval lithology** — AGOL inventory + PDFs yes; live GeoServer WellLog often no.  

These limits are features of honesty, not unfinished TODOs to hide.

---

## 11. Closing

GeoTrak’s path was incremental and evidence-driven:

- **Get the JSON** (FirstMap / DNREC / NRCS) onto disk so every Delaware click has context.  
- **Keep DelDOT’s GEO truth** in `db.json` as the engineering backbone.  
- **Build a logic-based infiltration estimate** that prefers surface mapunit reality, respects fines, lightly uses septic PercRate, remembers statewide mukey analogs, and yields to measured DelDOT borehole tests when they are nearby — then caps optimism and gates on water-table separation.  
- **Expand from a point to a polygon** so a project limit can inventory itself, mark the best screening infiltration cell, and speak a qualitative site summary an engineer can argue with.

That is how the program got here: not by pretending public GIS is a complete site investigation, but by chaining every trustworthy public and DelDOT signal into a conservative, inspectable screening story — from the first DNREC GeoJSON page download to the latest project-limits narrative.

---

## Appendix A — Key scripts

| Script | Purpose |
|--------|---------|
| `download-all-refs.py` | FirstMap / DNREC GeoJSON pack → `refs/` |
| `download-nrcs-soil-props.py` | NRCS SDA → `nrcs_de_by_mukey.json` |
| `download-dgir-wells.py` | DGS NGGDPP AGOL → `dgir_wells.json` |
| `import-geo-zips.py` | GEOSYSTEM zips → `db.json` |
| `import-infil-pdfs.py` | DelDOT infil PDFs → `infil_anchors.json` |
| `build-feature-store.py` | Boring × map context CSV |
| `build-mukey-priors.py` | Feature store → `mukey_priors.json` |
| `repair-db.py` / `compact-db.py` / `purge-outside-de.py` | Database hygiene |

## Appendix B — Key application functions

| Function | Role |
|----------|------|
| `queryRefs` | Layer hits at a point |
| `enrichFromHits` | Soils/HYDGRP/NRCS/geology/hazards → base infil band |
| `buildSiteProfile` | Full blend → `est_inhr` / `design_inhr` + classes/column |
| `infilFromHydgrp` / `infilFromAashto` | Band constructors |
| `applyEstInhrCap` / `applyDesignInhrCap` | Conservative ceilings |
| `estimateTopP200` / `infilPriorFromTopP200` | Fines prior |
| `lookupMukeyPrior` | Statewide mapunit analogs |
| `nearestInfilAnchors` | DelDOT field tests |
| `sampleHydro` / `applyHydroLimitToInfil` | DTW + separation |
| `analyzeProjectLimits` | Polygon grid + best cell |
| `buildLimitsSiteSummary` | Qualitative narrative + issues |

## Appendix C — Disclaimer (repeat for distribution)

Outputs of DelDOT GeoTrak — including map queries, polygon site summaries, illustrative infiltration rates, and draft `.docx` reports — are for **informational and supplemental use**. A licensed professional engineer (and, where required, professional geologist) remains responsible for interpretation, recommendations, field verification, and sealed documents. DNREC Appendix 1 design infiltration rates require ASTM field permeability testing and agency-appropriate review.

---

*End of paper.*

# GeoTrak — Feature tour (what to click, what you get)

Use this when showing someone the app for the first time.  
**Do not** drop them on the map alone — walk the left rail and the right-rail tools once.

**App:** https://m3nos95.github.io/Geotrack/geotrak/  
**Before you start:** Open a project folder (`refs/` + `db.json`), turn **Estimates ON**, zoom into Delaware.

---

## How to demo in ~10 minutes

1. Sign in → Open project folder → **Estimates ON**  
2. Click one map point → open each **Site Intel** rail tab (table below)  
3. Draw a **project limits** polygon → Analyze  
4. Start a **boring request** at one tap  
5. Say out loud: *“This is screening only — PE and field tests still decide design.”*

---

## A. Click a point on the map → Site Intel

Every map click opens **Site Intel** (left rail + detail drawer).  
Each left button is a different “deck” of information about **that exact spot**.

| You click… | What you’re looking at | What you should notice |
|------------|------------------------|------------------------|
| **Brief** | One-screen summary | Screening/design infil (if Estimates ON), class, neighbor count, hydro snapshot |
| **Site** | Mapped soils & geology | Soil name/symbol, HYDGRP A–D, geology unit, recharge / WRPA notes |
| **DNA** | “Fingerprint” of the ground | Same drainage+geology+recharge family elsewhere; can borrow typical lab/infil behavior when local data is thin |
| **Infil** | Screening infiltration story | Estimated in/hr, illustrative ÷2.5 design, plain-English **How we arrived at this rate**, contribution sliders |
| **Anchors** | Real DelDOT borehole infil tests | Measured rates (amber diamonds on map); strongest truth when nearby |
| **DGS** | Delaware Geological Survey wells | Nearby DGIR wells; **PDF / lith / geophys links** when available; shallow coarse/fine from gamma |
| **Props** | Screening engineering properties | Subgrade / frost / drainage-style priors from AASHTO — not a lab CBR report |
| **Septic** | DNREC septic / perc records | Browse PercRate points in the **search radius** list; screening blend uses a **fixed** septic window (not the slider) |
| **Class** | Soil classification at the point | AASHTO / USCS from nearby borings (or NRCS fallback) |
| **Column** | Stick log with depth | 0–50′ layers; enter **Subsurface** for a deeper column view |
| **Layers** | Constraint polygons hitting the point | Flood, wetland, GMZ, wellhead, brownfield/UST/landfill flags, etc. |
| **Borings** | Nearby DelDOT borings | List within the search radius; open a row for lab / log snippets |
| **Hydro** | Groundwater depth | Dry / normal / wet DTW; optional “current” climate blend; App.1 **2 ft separation** check for infiltration |

### Say this when they open Septic
> “This isn’t guessing — these are DNREC perc tests near the click. Distance and PercRate show up here. We use them lightly in the screening blend; they are not a substitute for an App.1 field infil test.”

### Say this when they open DGS
> “These are DGS well records. If a PDF or lith/geophys link is there, open it. Gamma coarse/fine can also pull the infiltration estimate down when clay is indicated.”

### Say this when they open Infil
> “This rate is a planning blend of map soils, neighbors, DNA analogs, septic, geophysics, and field anchors. The ÷2.5 number is an illustrative borehole-path design — not a sealed DNREC rate. Prefer full-size ring tests for approval.”

---

## B. Right-rail tools (don’t skip these)

| Feature | How to use it | What you get |
|---------|---------------|--------------|
| **Search radius** | Drag the slider (e.g. 500 ft) | Yellow map circle + nearby **lists** (borings / septic browse / DGS). Does **not** change screening infil — that uses fixed engine windows + statewide DNA |
| **Satellite** | Click | Toggle imagery basemap |
| **Project limits** | **Draw limits** → click vertices → **Close polygon** → **Analyze & find best infil** | Inventory inside the polygon; **best screening infiltration cell** marked; **qualitative site summary**; **boring recommendations** with **Request borings** / **Request at best cell** links into the top-bar wizard. Screening only — not Phase I / App.1 |
| **Request soil borings** | Top bar **Request borings** (next to Hydro) → tap locations → pick purpose | Draft **Soil Boring Request Sheet** (BDM Fig. 105-2): count, depth, continuous SPT, infil Y/N, rock core (purpose-gated), lab tests, M&R contact. Export for M&R; engineer confirms |

### Say this for project limits
> “Draw the job outline. Analyze ranks cells for screening, flags problems (wetland, GMZ, LUST), writes a short site story, and now suggests **where to request borings** — including a one-click jump to the best infil cell.”

### Say this for boring request
> “Tap where you want borings, pick what you’re building (bridge, pole, SWM…). GeoTrak drafts the official request sheet from BDM guidance. You still review with M&R before it goes out.”

---

## C. Top bar switches (what they control)

| Control | If you ignore it… | If you use it… |
|---------|-------------------|----------------|
| **Estimates OFF** | Only map facts (soils, geology, layers, borings list) | Safe “what does the map say?” mode |
| **Estimates ON** | — | Unlocks infil rates, class/column, DNA mids, eng. props, limits Analyze |
| **Layers** | Site Intel may miss soils/flood/GMZ | Turn on the refs you care about |
| **Markers** | Map looks empty of dots | Show/hide DGS wells and infil anchors |
| **Hydro** | No online DTW / climate blend | Sample FirstMap water grids + optional climate “now” |

---

## D. Other tabs (after the map tour)

| Tab | Feature | One-line explanation |
|-----|---------|----------------------|
| **Reference data** | Drop / load GeoJSON | Bring in FirstMap/DNREC soils, geology, flood, wetlands, anchors, DGS packs |
| **Reference data** | Boring database | Local `db.json` of DelDOT borings + lab; export / purge out-of-state / feature store |
| **Jobs** | Import Summary.xls + coordinates | Load a new job’s lab + locations into the DB |
| **Report** | Generate .docx drafts | DelDOT geo memo or DNREC Soil Investigation draft (yellow = engineer still fills) |

---

## E. Full feature checklist (handout)

Copy this into an email or print it. Check items as you demo.

### Map click → Site Intel
- [ ] **Brief** — snapshot of the point  
- [ ] **Site** — soils / geology / HYDGRP  
- [ ] **DNA** — statewide analogs with the same fingerprint  
- [ ] **Infil** — screening rate + “how we got here” + sliders  
- [ ] **Anchors** — measured DelDOT infil tests  
- [ ] **DGS** — wells with PDF / lith / geophys links  
- [ ] **Props** — screening subgrade / frost / drainage priors  
- [ ] **Septic** — DNREC PercRate points in radius  
- [ ] **Class** — AASHTO / USCS  
- [ ] **Column** — depth stick / subsurface mode  
- [ ] **Layers** — flood, wetland, GMZ, wellhead, contamination flags  
- [ ] **Borings** — nearby DelDOT borings + lab snippets  
- [ ] **Hydro** — DTW / WT elevation / separation check  

### Area & request tools
- [ ] **Draw project limits** → inventory + best infil cell + site summary  
- [ ] **Request borings** (top bar, next to Hydro) → purpose-based BDM sheet draft / export  
- [ ] **Search radius** — widen/narrow nearby **lists** / map circle (infil rate should stay the same)  
- [ ] **Satellite** — basemap toggle  

### Data & documents
- [ ] **Open project folder** — load `refs/` + `db.json`  
- [ ] **Reference data** — manage layers / import anchors / DGS  
- [ ] **Jobs** — import lab + coordinates  
- [ ] **Report** — draft Word documents  

### Guardrails to say out loud
- [ ] Screening ≠ sealed design  
- [ ] ÷2.5 is illustrative borehole-path planning, not preferred full-size ring approval  
- [ ] Contamination / GMZ / wetland flags do **not** “DNA transfer” away  
- [ ] Boring request still needs engineer + M&R confirmation  

---

## F. “What am I looking at?” cheat sheet

| Screen looks like… | It means… |
|--------------------|-----------|
| Empty Infil / “no estimate” | Estimates OFF, or no soils/HYDGRP loaded — open project folder, Estimates ON |
| Septic: none in radius | Widen search radius or load septic refs |
| DGS: run download bat | DGS pack not in `refs/` yet |
| Anchors: import infil PDFs | No measured borehole tests loaded |
| Layers = 0 | No reference GeoJSON enabled |
| High infil but red GMZ/wetland on Layers | Material might drain, but **siting may be restricted** — read constraints |
| Field anchor nearby | Prefer the measured test over the map blend |

---

## G. Suggested talking order for a boss / PM

1. **What problem it solves** — early site screening before boring/infil testing  
2. **Click a point** — Site → Septic → DGS → Borings → Hydro → Infil  
3. **Draw the project** — limits Analyze + qualitative summary  
4. **Boring request** — draft the M&R sheet from a purpose  
5. **Limits of the tool** — screening only; field tests + PE still required  

Longer box-by-box UI reference with screenshots: [README.md](./README.md)

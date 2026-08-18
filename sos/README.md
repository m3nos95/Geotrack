# Source of Supply (SOS) letter module

Browser app that turns a contractor DelDOT **Source of Supply** `.xls` / `.xlsx` into the M&R review letter.

Open: [deldot-sos.html](../deldot-sos.html) (GitHub Pages: `/Geotrack/deldot-sos.html`).

## Daily workflow

1. Drop the contractor form (`DEL DOT - SOS - ….xls`) on **Import**.
2. The app reads the sheet in the browser (no API key), groups related specs, and applies ACTION language.
3. Fill **Contract / Application #** if the contractor left it blank (the Frey form often does).
4. Review items — especially **MUST BE TESTED** (highlighted) and APL / not-approved tack coat.
5. Adjust CC, signature, and revision notes as needed.
6. **Print / PDF** from the letter preview.

## What the rules do

| Material family | Default ACTION |
|---|---|
| Borrow / GABC / stone / channel bed fill | Must be tested until a test date is on the letter. South → Ray Glanden; North → Damian Blakely; Canal → Rich Taylor. Results → Aaron Wieczorek |
| Superpave / HMA mixes | Approved — only approved mix designs; one source at a time if an alt is listed. `#401505` High Performance Bituminous → not approved (pending JMF) |
| Tack coat | Manufacturer is the SOURCE. On the local tack APL → approved (on APL). Russell Standard **Seaford** or **Chambersburg** → not approved. Seaboard Asphalt / Specialty Emulsions listed. Missing manufacturer → submit grade + producer |
| Crack / joint seal | Manufacturer SOURCE; Maxwell / Crafco products → APL |
| RCP / precast inlets | Shipped from state-inspected stock; reports on file |
| PCC curb / sidewalk / pedestrian connection | Only approved mix designs; group like HMA |
| Expansion joint | AASHTO M153 Type I, II, or IV (or submit that product if the form left it blank) |
| Riprap | Visual inspection |
| Water / sewer (710 / 711) | Conforms to the utility owner's specifications |
| Pavement marking (817 / 861 / 862) | Ennis Flint (and similar) → choose a product from the APL. Striping subcontractor listed as SOURCE → submit manufacturer |
| Clearing / excavation / removal (`#201000` / `#202000` / `#211000`) | Omitted when the contractor listed N/A |
| Topsoil | Visual inspection |
| Seed | Conforms to Standard Specifications table |
| TTC / detectable warning / curing / branded erosion | APL + on-site TTC inspection where applicable |

Related rows from the **same plant** are grouped (e.g. Type C + Type B Superpave). Tack coat is rewritten as `#401xxx – HMA ITEMS` with a product bullet, matching issued letters.

Tack / pavement marking / crack seal check the live [Approved Product Lists](https://materialsandresearch.deldot.gov/index.php/Approved_Product_Lists) (snapshot in `sos/lists/apl-snapshot.json`, refreshed with `refresh-sos-lists.bat`). GABC / borrow / stone check the office **Approved Aggregate Chart** — drop the current `.xls` on the **APL / Chart** tab. Sources on the chart with a test date become **Approved for use**; rejected rows are not approved; anything missing stays must-be-tested.

Spec `301003` submitted as GABC is issued as `#301001` (flagged in the review banner).

## Files

| File | Role |
|---|---|
| `sos-engine.js` | Spreadsheet grid parser + workflow |
| `sos-data.js` | Spec catalog, APL tables, CC seeds, letter language |
| `sos-app.js` | UI |
| `sos-lists.js` | Live APL + aggregate chart parsers |
| `fetch-lists.js` | Pull current APL PDFs (`node sos/fetch-lists.js`) |
| `sos-engine.test.js` | Node tests (`node sos/sos-engine.test.js`) |
| `corpus-learn.js` | Diff contractor `.xls` vs issued PDF (`node sos/corpus-learn.js`) |
| `corpus-formpdf.py` | Read contractor SOS forms that were saved as PDF |
| `corpus-learn.test.js` | Pairing tests (`node sos/corpus-learn.test.js`) |
| `letterhead-header.jpg` | 2026 first-page seal + address (from Shanté Hastings letterhead) |
| `letterhead-footer.png` | 2026 first-page DelDOT wordmark |

Libraries (sources, specs, CC, last project) persist in `localStorage` on this browser.

## Teaching the engine from real jobs

Do **not** send examples one-by-one in chat. On the office PC, put the matched jobs in the Desktop **SOS Program** folder and double-click `learn-sos.bat`. Or dump pairs in `sos/corpus/drop/` (`Job.xls` + `Job.pdf`). Then run `node sos/corpus-learn.js`. Details: [corpus/README.md](corpus/README.md). Those files are gitignored (this GitHub repo is public).

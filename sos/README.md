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
| Borrow / GABC / stone | Must be tested (Ray Glanden sampling + Aaron Wieczorek results) |
| Superpave / HMA mixes | Approved — only approved mix designs; one source at a time if an alt is listed |
| Tack coat | Manufacturer is the SOURCE. On the local tack APL → approved (on APL). Russell Standard **Seaford** → not approved. Missing manufacturer → submit grade + producer |
| Crack / joint seal | Manufacturer SOURCE; Maxwell / Crafco products → APL |
| RCP / precast inlets | Shipped from state-inspected stock; reports on file |
| PCC curb / sidewalk | Mix / admixture certs on file |
| Topsoil | Visual inspection |
| Seed | Conforms to Standard Specifications table |
| TTC / detectable warning / curing / branded erosion | APL + on-site TTC inspection where applicable |

Related rows from the **same plant** are grouped (e.g. Type C + Type B Superpave). Tack coat is rewritten as `#401xxx – HMA ITEMS` with a product bullet, matching issued letters.

Spec `301003` submitted as GABC is issued as `#301001` (flagged in the review banner).

## Files

| File | Role |
|---|---|
| `sos-engine.js` | Spreadsheet grid parser + workflow |
| `sos-data.js` | Spec catalog, APL tables, CC seeds, letter language |
| `sos-app.js` | UI |
| `sos-engine.test.js` | Node tests (`node sos/sos-engine.test.js`) |
| `corpus-learn.js` | Diff contractor `.xls` vs issued PDF (`node sos/corpus-learn.js`) |
| `corpus-formpdf.py` | Read contractor SOS forms that were saved as PDF |
| `corpus-learn.test.js` | Pairing tests (`node sos/corpus-learn.test.js`) |
| `letterhead-header.jpg` | 2026 first-page seal + address (from Shanté Hastings letterhead) |
| `letterhead-footer.png` | 2026 first-page DelDOT wordmark |

Libraries (sources, specs, CC, last project) persist in `localStorage` on this browser.

## Teaching the engine from real jobs

Do **not** send examples one-by-one in chat. Dump matching pairs in `sos/corpus/drop/` (`Job.xls` + `Job.pdf` — no subfolders needed) or one folder per job under `sos/corpus/cases/`. Then run `node sos/corpus-learn.js`. Details: [corpus/README.md](corpus/README.md). Those files are gitignored (this GitHub repo is public).

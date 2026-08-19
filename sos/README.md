# Source of Supply (SOS) letter module

Browser app that turns a contractor DelDOT **Source of Supply** `.xls` / `.xlsx` into the M&R review letter.

Open: [deldot-sos.html](../deldot-sos.html) (GitHub Pages: `/Geotrack/deldot-sos.html`).

## Daily workflow

1. Drop the contractor form (`DEL DOT - SOS - ….xls`) on **Import**.
2. The app reads the sheet in the browser (no API key), groups related specs, and applies ACTION language.
3. Fill **Contract / Application #** if the contractor left it blank (the Frey form often does).
4. Review items — especially **MUST BE TESTED** (highlighted) and APL / not-approved tack coat.
5. Review **CC**. Soil / stone items copy the lab-results person (Aaron Wieczorek by default) and the district sampler; hot mix copies the HMA person (Mark Schafer). Edit those names on the **CC** tab if someone leaves, or assign other materials to other people. ✕ on a **library** row removes a retired person from the master list so dropping `SOS-cc.json` will not put them back (add them again with **+ Library person** if they return). Optional: drop `SOS-cc.json` from `learn-sos.bat` to fill the name library.
6. Optional: drop **Source of Supply Database.xlsx** (Standard Items / Special Provisions) on **APL / Chart** so unknown spec numbers get the official item description. Letter ACTION language still follows issued letters, not the BABA/acceptance-method column.
7. **Print / PDF** from the letter preview.

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

Tack / pavement marking / crack seal check the live [Approved Product Lists](https://materialsandresearch.deldot.gov/index.php/Approved_Product_Lists) (snapshot in `sos/lists/apl-snapshot.json`, refreshed with `refresh-sos-lists.bat`). GABC / borrow / stone check the office **Approved Source List.xlsx** on `\\DOTFS01\Groups\Geo Construction Test Report\Reference Samples\`. `refresh-sos-lists.bat` (daily) and `watch-sos-inbox.bat` copy that file when the share is reachable and write `SOS Program\SOS-lists.json` plus a local `sos/lists/aggregate-snapshot.json` (gitignored — pit data stays off GitHub). You can still drop the .xlsx on **APL / Chart**. Sample date + unexpired expire date → **Approved for use**; Failed / none on site → not approved; expired sample → must be tested again.

The **Source of Supply Database.xlsx** (DelDOT Standard Items / Special Provisions catalog, last modified Sept 2023 in the copy we were given) is the official item-number list. Drop it on **APL / Chart** (or keep `sos/lists/sos-database-snapshot.json`). It fills spec descriptions for items not already in the built-in catalog. It does **not** rewrite ACTION notes — those stay matched to issued letters.

Spec `301003` submitted as GABC is issued as `#301001` (flagged in the review banner).

## Outlook inbox (every 30 minutes)

Contractor SOS forms that arrive by email can be processed on the office PC without Graph/API keys. Outlook desktop must be signed in (your mailbox, or a shared mailbox already in that Outlook profile).

1. Copy `sos/SOS-watch.example.json` to `sos/SOS-watch.json` and set `outputDir` (default: Desktop **SOS Program\completed**).
2. Double-click `watch-sos-inbox.bat` once to test. It saves `.xls` / `.xlsx` / contractor-form PDFs from Inbox, runs the letter engine, and writes a folder per job:
   - `completed/ready/` — letter.html, letter.txt, copy of the form
   - `completed/needs-review/` — blank application #, must-be-tested, or not-approved items (open REVIEW.txt)
   - `completed/skipped/` — random PDFs / issued letters / non-SOS spreadsheets
3. In **Task Scheduler**, run `watch-sos-inbox.bat --once` every 30 minutes (PC logged in, Outlook available). Or leave `watch-sos-inbox.bat --loop` running.
4. The same pass pulls **Approved Source List.xlsx** from `\\DOTFS01\Groups\Geo Construction Test Report\Reference Samples\`. For a once-a-day refresh without Outlook, schedule `refresh-sos-lists.bat` (set `SOS_WATCH_NOPAUSE=1`). Copy `sos/SOS-watch.example.json` to `sos/SOS-watch.json` if that share path ever changes (`aggregateChartPath`).

Messages already tagged **DelDOT SOS** are not pulled again. This does **not** auto-send the letter — it stages a completed draft for you to check and issue.

## Files

| File | Role |
|---|---|
| `sos-engine.js` | Spreadsheet grid parser + workflow |
| `sos-data.js` | Spec catalog, APL tables, CC seeds, letter language |
| `sos-app.js` | UI |
| `sos-lists.js` | Live APL + aggregate chart parsers |
| `lists/apl-snapshot.json` | Bundled public APL snapshot |
| `lists/sos-database-snapshot.json` | Bundled Source of Supply Database (item # / descriptions) |
| `sos-engine.test.js` | Node tests (`node sos/sos-engine.test.js`) |
| `corpus-learn.js` | Diff contractor `.xls` vs issued PDF (`node sos/corpus-learn.js`) |
| `corpus-formpdf.py` | Read contractor SOS forms that were saved as PDF |
| `corpus-learn.test.js` | Pairing tests (`node sos/corpus-learn.test.js`) |
| `watch-inbox.js` | Process SOS attachments into completed letter folders |
| `outlook-pull.ps1` | Save .xls/.xlsx/.pdf from the signed-in Outlook inbox |
| `watch-sos-inbox.bat` | Pull + process (Task Scheduler every 30 min, or `--loop`) |
| `letter-render.js` | HTML letter for the completed-folder draft |
| `letterhead-header.jpg` | 2026 first-page seal + address (from Shanté Hastings letterhead) |
| `letterhead-footer.png` | 2026 first-page DelDOT wordmark |

Libraries (sources, specs, CC, last project) persist in `localStorage` on this browser.

## Teaching the engine from real jobs

Do **not** send examples one-by-one in chat. On the office PC, put the matched jobs in the Desktop **SOS Program** folder and double-click `learn-sos.bat`. Or dump pairs in `sos/corpus/drop/` (`Job.xls` + `Job.pdf`). Then run `node sos/corpus-learn.js`. That diffs SECTION / SOURCE / ACTION and can fill the CC name library (`SOS-cc.json`). Who is copied on a letter is the material assignments on the **CC** tab (edit the name if Aaron or Mark leaves). Details: [corpus/README.md](corpus/README.md). Those files are gitignored (this GitHub repo is public).

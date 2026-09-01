# Geotrack

DelDOT Materials & Research tools hosted on GitHub Pages.

| App | Link |
|-----|------|
| **LabTrak** (sample tracking) | https://m3nos95.github.io/Geotrack/ |
| **GeoTrak** (geotech reconnaissance) | https://m3nos95.github.io/Geotrack/geotrak/ |
| **ConTrak** (IDIQ) | https://m3nos95.github.io/Geotrack/psa/ |

## GeoTrak user guide

| Doc | Use it for |
|-----|------------|
| **[geo-report-center/FEATURE_TOUR.md](geo-report-center/FEATURE_TOUR.md)** | Demo someone — click Septic / DGS / draw limits / boring request |
| **[geo-report-center/README.md](geo-report-center/README.md)** | Full box-by-box guide + screenshots |

Local app file: `geo-report-center/Geo_Report_Center.html`  
Open a project folder with `refs/` + `db.json` for full statewide data.

## ConTrak

IDIQ tracker for Materials & Research. Finance sets the agreement cap, term, and unit-price or lump-sum template. Project managers run Tasks and QPs (PSPM IDIQ task orders) inside that template.

Starter templates:

- **DelDOT IDIQ — unit price** — proposal review → NTP → invoice checklist against remaining NTP dollars and pay-item quantities. Bound to **2216F / 2217F** (RFP 2216-2217F, $3M cap) and the imported **2019F / 2018F** CGC and HCEA ledgers.
- **DelDOT IDIQ — lump sum** — NTP amount and invoices, no unit-price catalog.

Money follows Agreement → Task (PO) → QP. Close a QP to return unspent NTP to that task. Close the task to return leftover PO to the agreement.

Data stays in the browser (`localStorage`). Use **Backup** to export JSON or import another Excel task sheet.

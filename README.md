# Geotrack

DelDOT Materials & Research tools hosted on GitHub Pages.

| App | Link |
|-----|------|
| **LabTrak** (sample tracking) | https://m3nos95.github.io/Geotrack/ |
| **GeoTrak** (geotech reconnaissance) | https://m3nos95.github.io/Geotrack/geotrak/ |
| **ConTrak** (professional services / PSAs) | https://m3nos95.github.io/Geotrack/psa/ |

## GeoTrak user guide

| Doc | Use it for |
|-----|------------|
| **[geo-report-center/FEATURE_TOUR.md](geo-report-center/FEATURE_TOUR.md)** | Demo someone — click Septic / DGS / draw limits / boring request |
| **[geo-report-center/README.md](geo-report-center/README.md)** | Full box-by-box guide + screenshots |

Local app file: `geo-report-center/Geo_Report_Center.html`  
Open a project folder with `refs/` + `db.json` for full statewide data.

## ConTrak

DelDOT-standard tracker for professional-services agreements. Finance configures a template (assignment noun, workflow, money checks, admin checklist). Project managers run the ledger inside that template. Any PSA can be added — not only one section's contracts.

Starter templates:

- **DelDOT PSA — unit price (IDIQ)** — proposal review → NTP → invoice checklist against remaining NTP dollars and pay-item quantities. Bound to **2216F / 2217F** (RFP 2216-2217F, $3M cap) and the imported **2019F / 2018F** CGC and HCEA ledgers.
- **DelDOT PSA — lump sum** — NTP amount and invoices, no unit-price catalog.

Finance can duplicate a starter, rename assignments (QP / task order / work order), toggle workflow steps, and edit the invoice checklist. Data stays in the browser (`localStorage`). Use **Backup** to export JSON or import another Excel task sheet.

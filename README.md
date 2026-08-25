# Geotrack

DelDOT Materials & Research tools hosted on GitHub Pages.

| App | Link |
|-----|------|
| **LabTrak** (sample tracking) | https://m3nos95.github.io/Geotrack/ |
| **GeoTrak** (geotech reconnaissance) | https://m3nos95.github.io/Geotrack/geotrak/ |
| **PSA Trak** (agreements 2216F / 2217F) | https://m3nos95.github.io/Geotrack/psa/ |

## GeoTrak user guide

| Doc | Use it for |
|-----|------------|
| **[geo-report-center/FEATURE_TOUR.md](geo-report-center/FEATURE_TOUR.md)** | Demo someone — click Septic / DGS / draw limits / boring request |
| **[geo-report-center/README.md](geo-report-center/README.md)** | Full box-by-box guide + screenshots |

Local app file: `geo-report-center/Geo_Report_Center.html`  
Open a project folder with `refs/` + `db.json` for full statewide data.

## PSA Trak

Professional-services tracker for DelDOT subsurface investigation agreements.

- **2216F / 2217F** — new IDIQ pair from RFP 2216-2217F ($3M cap, cost per unit of work)
- **2019F / 2018F** — current CGC and HCEA ledgers imported from the existing Excel trackers
- Workflow: review a budget proposal → issue NTP → build an invoice checklist against remaining NTP dollars and pay-item quantities
- Data stays in the browser (`localStorage`). Use **Backup / import** to export JSON or pull in another Excel task sheet.

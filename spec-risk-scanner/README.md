# Spec Risk Scanner (DelDOT)

Internal review tool that scans DelDOT Standard Specifications (and later Special Provisions / contracts) for language that is commonly disputed or exploitable: vague obligations, payment shifts, measurement ambiguity, and document conflicts.

**Not legal advice.** Findings are candidate review items for Specs / Contracts / counsel.

## Source

2026 DelDOT Standard Specifications:

https://engineeringsupport.deldot.gov/images/b/b1/2026_DelDOT_Standard_Specifications.pdf

## Setup

```bash
cd spec-risk-scanner
pip install -r requirements.txt
python download_specs.py
python extract.py          # optional: text + section index
python scan.py             # JSON + HTML report under reports/
```

Open `reports/spec_risk_findings.html` in a browser.

## What it flags

| Category | Examples |
|----------|----------|
| Ambiguous obligation | as directed, as necessary, satisfactory, discretion |
| Payment risk | incidental, no separate payment, included in unit price |
| Measurement conflict | plan quantity, approximate, as shown on plans |
| Hierarchy / conflicts | order of precedence, discrepancy, design conflict → RFI |
| Open-ended risk | differing site conditions, utility conflicts, soft deadlines |
| Substitutions | or equal, approved equal |

Rules live in `rules/risk_patterns.yaml` — edit there to tune for DelDOT claims history.

## Next steps (natural extensions)

1. Ingest project Special Provisions + addenda and **diff against Standard Specs** for conflicts  
2. Seed rules from past claims / change-order themes  
3. Optional LLM pass for semantic conflicts between two cited sections (with human approval)  
4. Wire contract # from LabTrak / GeoTrak into a per-project scan

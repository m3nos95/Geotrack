# Spec Risk Scanner (DelDOT)

Internal review tool that scans DelDOT **Standard Specifications** and **Materials & Research** manuals for language that is commonly disputed or operationally impossible: vague obligations, payment shifts, and **testing-frequency commitments field/lab staff cannot meet**.

**Not legal advice.** Findings are candidate review items for Specs / Contracts / M&R / counsel.

## Why this exists (RT 301)

On US 301, **liquid/plastic limit (AASHTO T89/T90)** rates outran lab capacity.
Same pattern can show up for other slow lab tests (Proctor was just an example).
Table B-1 still bundles `T88, T89, T90, T99…` on earthwork/borrow frequency slots.

See [`docs/lesson-rt301-atterberg-testing-capacity.md`](docs/lesson-rt301-atterberg-testing-capacity.md).

## Sources

| Doc | URL |
|-----|-----|
| 2026 Standard Specs | https://engineeringsupport.deldot.gov/images/b/b1/2026_DelDOT_Standard_Specifications.pdf |
| M&R manuals index | https://deldot.gov/Publications/manuals/mat_research/index.shtml |
| Part B | `…/pdfs/4b_min_test_and_cert_req.pdf` |
| Table B-1 quantities | `…/pdfs/5-part_b_b-2-min_test_cert-quantities_list.pdf` |

## Setup

```bash
cd spec-risk-scanner
pip install -r requirements.txt
python download_specs.py          # Standard Specs + Part B + Table B-1 + C200/C300
python parse_table_b1.py          # structured capacity findings
python scan.py                    # within-doc HTML/JSON under reports/
python cross_ref.py               # Specs ↔ Materials ↔ Construction Manual conflicts
```

Open:
- `reports/spec_risk_findings.html` — phrase / capacity flags
- `reports/cross_pub_conflicts.html` — **cross-manual contradictions and gaps**

## What it flags

| Category | Examples |
|----------|----------|
| **Testing capacity** | **T89/T90 Atterbergs at Table B-1 rates** (RT 301); companion T99 package load; “increase sampling rates” |
| Ambiguous obligation | as directed, as necessary, satisfactory, discretion |
| Payment risk | incidental, no separate payment, included in unit price |
| Measurement conflict | plan quantity, approximate |
| Hierarchy / conflicts | order of precedence, discrepancy |
| Open-ended risk | DSC, utility conflicts, soft deadlines |

Rules: `rules/risk_patterns.yaml`.

## Capacity scenarios

For Table B-1 earthwork rows requiring Atterbergs, the parser estimates lab hours at
50k and 200k yd³ using screening defaults (LL/PL ≈ 2.5 hr/sample). These are
**review aids**, not time studies. Proctor hours are reported separately as related load.

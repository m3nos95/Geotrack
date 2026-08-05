# Spec Risk Scanner (DelDOT)

Internal review tool that scans DelDOT **Standard Specifications** and **Materials & Research** manuals for language that is commonly disputed or operationally impossible: vague obligations, payment shifts, and **testing-frequency commitments field/lab staff cannot meet**.

**Not legal advice.** Findings are candidate review items for Specs / Contracts / M&R / counsel.

## Why this exists (RT 301)

Table B-1 required **full AASHTO T99 (Method C)** at rates like 1/300–1/1000 yd³ on earthwork/borrow, often **without** a one-point / T272 alternative. On US 301, techs could not keep up; **Tutor Perini** later used that gap in proceedings.

See [`docs/lesson-rt301-t99-testing-capacity.md`](docs/lesson-rt301-t99-testing-capacity.md).

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
python parse_table_b1.py          # structured T99 capacity findings
python scan.py                    # combined HTML/JSON under reports/
```

Open `reports/spec_risk_findings.html`.

## What it flags

| Category | Examples |
|----------|----------|
| **Testing capacity** | Full T99 w/o T272/one-point; “increase sampling rates”; “double the testing frequency” |
| Ambiguous obligation | as directed, as necessary, satisfactory, discretion |
| Payment risk | incidental, no separate payment, included in unit price |
| Measurement conflict | plan quantity, approximate |
| Hierarchy / conflicts | order of precedence, discrepancy |
| Open-ended risk | DSC, utility conflicts, soft deadlines |

Rules: `rules/risk_patterns.yaml`.

## Capacity scenarios

For Table B-1 earthwork rows lacking a one-point alt, the parser estimates lab hours at 50k and 200k yd³ using screening defaults (full T99 ≈ 5 hr, one-point ≈ 0.75 hr). These are **review aids**, not time studies.

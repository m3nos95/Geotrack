#!/usr/bin/env python3
"""Scan DelDOT Standard Specs for ambiguity, payment traps, and conflict language.

Produces JSON + HTML review reports. Findings are candidate review items —
not determinations of legal risk. Intended for DelDOT internal specs/contracts review.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import yaml

from extract import DATA_DIR, extract_pages, page_at_offset, pages_to_full_text, parse_sections

RULES_PATH = Path(__file__).resolve().parent / "rules" / "risk_patterns.yaml"
REPORT_DIR = Path(__file__).resolve().parent / "reports"


def load_rules(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def context_window(text: str, start: int, end: int, radius: int = 180) -> str:
    a = max(0, start - radius)
    b = min(len(text), end + radius)
    snippet = text[a:b]
    snippet = re.sub(r"\s+", " ", snippet).strip()
    return snippet


def section_for_offset(sections: list[dict], offset: int) -> dict | None:
    # sections are in document order; linear scan is fine for MVP
    best = None
    for s in sections:
        if s["char_start"] <= offset < s["char_end"]:
            best = s
            break
        if s["char_start"] > offset:
            break
    return best


def scan_patterns(full_text: str, sections: list[dict], rules: dict) -> list[dict]:
    findings: list[dict] = []
    categories = rules.get("categories", {})

    for cat_id, cat in categories.items():
        cat_severity = cat.get("severity", "medium")
        for pat in cat.get("patterns", []):
            severity = pat.get("severity", cat_severity)
            regex = re.compile(pat["regex"], re.IGNORECASE)
            for m in regex.finditer(full_text):
                # Skip TOC region (early pages with dense leaders near match)
                local = full_text[max(0, m.start() - 80) : m.end() + 80]
                if "....." in local:
                    continue
                sec = section_for_offset(sections, m.start())
                # Skip meta-definitions in 101.1 that merely define judgment words
                if sec and sec["id"] == "101.1" and pat["id"] in {
                    "satisfactory",
                    "as_deemed",
                    "as_necessary",
                    "as_required",
                    "as_directed",
                    "reasonable",
                    "or_equal",
                }:
                    continue
                findings.append(
                    {
                        "id": f"{pat['id']}-{m.start()}",
                        "rule_id": pat["id"],
                        "category": cat_id,
                        "severity": severity,
                        "note": pat.get("note", ""),
                        "match": m.group(0),
                        "page": page_at_offset(full_text, m.start()),
                        "section_id": sec["id"] if sec else None,
                        "section_header": sec["header"] if sec else None,
                        "snippet": context_window(full_text, m.start(), m.end()),
                        "char_start": m.start(),
                    }
                )
    return findings


def scan_shall_will_proximity(full_text: str, sections: list[dict], window: int = 400) -> list[dict]:
    """Flag places where 'shall' and 'will' appear very close — actor ambiguity."""
    findings = []
    shall_iter = list(re.finditer(r"\bshall\b", full_text, re.I))
    will_iter = list(re.finditer(r"\bwill\b", full_text, re.I))
    will_pos = [m.start() for m in will_iter]
    wi = 0
    seen_buckets = set()
    for sm in shall_iter:
        while wi < len(will_pos) and will_pos[wi] < sm.start() - window:
            wi += 1
        j = wi
        while j < len(will_pos) and will_pos[j] <= sm.start() + window:
            dist = abs(will_pos[j] - sm.start())
            if dist < window:
                bucket = sm.start() // 500
                if bucket not in seen_buckets:
                    seen_buckets.add(bucket)
                    sec = section_for_offset(sections, sm.start())
                    findings.append(
                        {
                            "id": f"shall-will-{sm.start()}",
                            "rule_id": "shall_will_proximity",
                            "category": "ambiguous_obligation",
                            "severity": "low",
                            "note": "shall/will within ~same sentence block — verify actor is clear (101.1: will=Department, shall=contractor)",
                            "match": "shall … will",
                            "page": page_at_offset(full_text, sm.start()),
                            "section_id": sec["id"] if sec else None,
                            "section_header": sec["header"] if sec else None,
                            "snippet": context_window(full_text, min(sm.start(), will_pos[j]), max(sm.end(), will_pos[j] + 4), 220),
                            "char_start": sm.start(),
                        }
                    )
            j += 1
    return findings


def find_cross_section_keyword_conflicts(sections: list[dict]) -> list[dict]:
    """Heuristic: same topic keywords with opposing payment language in different sections."""
    # Build keyword → sections mentioning both "incidental" and explicit payment
    findings = []
    pay_item_re = re.compile(r"\b(?:Basis of Payment|Method of Measurement)\b", re.I)
    incidental_re = re.compile(r"\bincidental\b", re.I)
    no_pay_re = re.compile(r"\bno\s+separate\s+payment\b", re.I)

    for s in sections:
        if not pay_item_re.search(s["text"]):
            continue
        if incidental_re.search(s["text"]) and no_pay_re.search(s["text"]):
            # Not a conflict by itself, but a high-review payment package
            m = incidental_re.search(s["text"])
            findings.append(
                {
                    "id": f"pay-package-{s['id']}-{s['char_start']}",
                    "rule_id": "measurement_payment_package",
                    "category": "payment_risk",
                    "severity": "medium",
                    "note": "Section has Method of Measurement/Basis of Payment plus incidental / no-separate-payment language — review scope completeness",
                    "match": "incidental + no separate payment",
                    "page": s["page_start"],
                    "section_id": s["id"],
                    "section_header": s["header"],
                    "snippet": context_window(s["text"], m.start(), m.end(), 200) if m else s["text"][:300],
                    "char_start": s["char_start"],
                }
            )
    return findings


def dedupe_findings(findings: list[dict]) -> list[dict]:
    """Collapse near-duplicate matches of same rule in same section."""
    best = {}
    for f in findings:
        # Prefer stable id for Table B-1 / structured findings
        if f.get("rule_id") == "full_t99_no_one_point" or f.get("capacity_scenarios"):
            key = ("structured", f.get("id") or f.get("snippet") or id(f))
        else:
            page = f.get("page")
            key = (f["rule_id"], f.get("section_id"), page, f.get("source"))
        if key not in best:
            best[key] = f
    return sorted(
        best.values(),
        key=lambda x: (severity_rank(x["severity"]), x.get("page") or 0, x["rule_id"]),
    )


def severity_rank(s: str) -> int:
    return {"high": 0, "medium": 1, "low": 2}.get(s, 3)


def summarize(findings: list[dict]) -> dict:
    by_cat = Counter(f["category"] for f in findings)
    by_sev = Counter(f["severity"] for f in findings)
    by_rule = Counter(f["rule_id"] for f in findings)
    return {
        "total": len(findings),
        "by_severity": dict(by_sev),
        "by_category": dict(by_cat),
        "top_rules": by_rule.most_common(20),
    }


def render_html(findings: list[dict], summary: dict, source_name: str) -> str:
    rows = []
    for f in findings:
        cap = f.get("capacity_scenarios") or {}
        cap_bits = []
        for sc in cap.values():
            cap_bits.append(
                f"{sc.get('label', '')}: ~{sc.get('samples')} samples / "
                f"{sc.get('est_lab_hours')} lab-hrs ({sc.get('mode')})"
            )
        cap_html = ("<br><em>" + html.escape(" | ".join(cap_bits)) + "</em>") if cap_bits else ""
        page = f.get("page")
        page_s = "" if page is None else str(page)
        rows.append(
            "<tr>"
            f"<td class='sev {html.escape(f['severity'])}'>{html.escape(f['severity'])}</td>"
            f"<td>{html.escape(f['category'])}<br><small>{html.escape(str(f.get('source') or ''))}</small></td>"
            f"<td>{html.escape(f['rule_id'])}</td>"
            f"<td>{html.escape(page_s)}</td>"
            f"<td>{html.escape(str(f.get('section_id') or ''))}<br><small>{html.escape(f.get('section_header') or '')}</small></td>"
            f"<td><code>{html.escape(f['match'])}</code></td>"
            f"<td>{html.escape(f['note'])}{cap_html}</td>"
            f"<td class='snip'>{html.escape(f['snippet'])}</td>"
            "</tr>"
        )

    top_rules = "".join(
        f"<li><code>{html.escape(r)}</code> — {n}</li>" for r, n in summary["top_rules"]
    )
    by_sev = "".join(
        f"<li><strong>{html.escape(k)}</strong>: {v}</li>" for k, v in summary["by_severity"].items()
    )
    by_cat = "".join(
        f"<li><strong>{html.escape(k)}</strong>: {v}</li>" for k, v in summary["by_category"].items()
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>DelDOT Spec Risk Scan — {html.escape(source_name)}</title>
<style>
  :root {{
    --ink: #1a2332;
    --muted: #5a6a7a;
    --bg: #f3f6f4;
    --panel: #ffffff;
    --accent: #0b6e4f;
    --high: #9b2226;
    --med: #bc6c25;
    --low: #3d5a80;
    --line: #d5ddd8;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; font-family: "Source Sans 3", "Segoe UI", sans-serif;
    color: var(--ink); background:
      radial-gradient(1200px 600px at 10% -10%, #dceee6 0%, transparent 55%),
      radial-gradient(900px 500px at 100% 0%, #e7eef5 0%, transparent 50%),
      var(--bg);
    line-height: 1.45;
  }}
  header {{
    padding: 2.5rem 2rem 1.5rem; max-width: 1200px; margin: 0 auto;
  }}
  h1 {{
    font-family: "IBM Plex Serif", Georgia, serif;
    font-weight: 600; font-size: clamp(1.8rem, 3vw, 2.4rem);
    margin: 0 0 .4rem; letter-spacing: -0.02em;
  }}
  .sub {{ color: var(--muted); max-width: 50rem; }}
  .brand {{ color: var(--accent); font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; font-size: .8rem; }}
  main {{ max-width: 1200px; margin: 0 auto; padding: 0 2rem 3rem; }}
  .cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin: 1.5rem 0; }}
  .card {{ background: var(--panel); border: 1px solid var(--line); padding: 1rem 1.1rem; border-radius: 2px; }}
  .card h2 {{ margin: 0 0 .5rem; font-size: .95rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }}
  .card .num {{ font-size: 2rem; font-weight: 700; color: var(--accent); }}
  table {{ width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); font-size: .9rem; }}
  th, td {{ vertical-align: top; padding: .65rem .7rem; border-bottom: 1px solid var(--line); text-align: left; }}
  th {{ background: #eef3f0; position: sticky; top: 0; font-size: .75rem; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }}
  tr:hover td {{ background: #f7faf8; }}
  .sev {{ font-weight: 700; text-transform: uppercase; font-size: .75rem; }}
  .sev.high {{ color: var(--high); }}
  .sev.medium {{ color: var(--med); }}
  .sev.low {{ color: var(--low); }}
  .snip {{ color: var(--muted); font-size: .84rem; max-width: 28rem; }}
  code {{ background: #eef3f0; padding: .1rem .3rem; border-radius: 2px; }}
  small {{ color: var(--muted); }}
  footer {{ max-width: 1200px; margin: 0 auto; padding: 0 2rem 2rem; color: var(--muted); font-size: .85rem; }}
  ul {{ margin: .3rem 0 .8rem 1.1rem; padding: 0; }}
</style>
</head>
<body>
<header>
  <div class="brand">DelDOT · Spec Risk Scanner</div>
  <h1>Contract language review findings</h1>
  <p class="sub">Candidate issues in <strong>{html.escape(source_name)}</strong> —
  poor phrasing, payment shifts, document conflicts, and
  <em>unrealistic testing frequencies</em> (full T99 vs one-point — RT 301 lesson).
  For internal review only; not legal advice.</p>
</header>
<main>
  <div class="cards">
    <div class="card"><h2>Findings</h2><div class="num">{summary['total']}</div></div>
    <div class="card"><h2>By severity</h2><ul>{by_sev}</ul></div>
    <div class="card"><h2>By category</h2><ul>{by_cat}</ul></div>
    <div class="card"><h2>Top rules</h2><ul>{top_rules}</ul></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Severity</th><th>Category</th><th>Rule</th><th>Page</th>
        <th>Section</th><th>Match</th><th>Why it matters</th><th>Context</th>
      </tr>
    </thead>
    <tbody>
      {''.join(rows)}
    </tbody>
  </table>
</main>
<footer>
  Generated {html.escape(datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC'))}.
  Rules: risk_patterns.yaml. Deduplicated per rule / section / page.
</footer>
</body>
</html>
"""


def scan_pdf(pdf: Path, rules: dict, max_shall_will: int) -> tuple[list[dict], dict]:
    pages = extract_pages(pdf)
    full = pages_to_full_text(pages)
    sections = parse_sections(full)
    findings = scan_patterns(full, sections, rules)
    for f in findings:
        f["source"] = pdf.name
    heur = rules.get("heuristics", {})
    if heur.get("shall_will_proximity", {}).get("enabled", True):
        sw = scan_shall_will_proximity(
            full,
            sections,
            window=heur["shall_will_proximity"].get("window_chars", 400),
        )
        for f in sw[:max_shall_will]:
            f["source"] = pdf.name
        findings.extend(sw[:max_shall_will])
    if heur.get("measurement_vs_basis_of_payment", {}).get("enabled", True):
        extra = find_cross_section_keyword_conflicts(sections)
        for f in extra:
            f["source"] = pdf.name
        findings.extend(extra)
    meta = {"pages": len(pages), "sections": len(sections), "source": pdf.name}
    return findings, meta


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pdf",
        type=Path,
        default=DATA_DIR / "2026_DelDOT_Standard_Specifications.pdf",
    )
    parser.add_argument(
        "--also",
        type=Path,
        nargs="*",
        default=[],
        help="Additional PDFs (e.g. M&R Part B)",
    )
    parser.add_argument(
        "--include-table-b1",
        action="store_true",
        default=True,
        help="Merge Table B-1 full-T99-without-one-point findings (default on)",
    )
    parser.add_argument("--no-table-b1", action="store_true")
    parser.add_argument("--rules", type=Path, default=RULES_PATH)
    parser.add_argument("--out-dir", type=Path, default=REPORT_DIR)
    parser.add_argument(
        "--max-shall-will",
        type=int,
        default=40,
        help="Cap shall/will proximity findings (noisy)",
    )
    args = parser.parse_args()

    if not args.pdf.exists():
        raise SystemExit(f"PDF not found: {args.pdf}\nRun download_specs.py first.")

    rules = load_rules(args.rules)
    pdfs = [args.pdf] + list(args.also or [])
    # Default: also scan Part B if present
    part_b = DATA_DIR / "mat_research" / "4b_min_test_and_cert_req.pdf"
    if part_b.exists() and part_b not in pdfs:
        pdfs.append(part_b)

    all_findings: list[dict] = []
    sources_meta = []
    for pdf in pdfs:
        if not pdf.exists():
            print(f"skip missing {pdf}")
            continue
        findings, meta = scan_pdf(pdf, rules, args.max_shall_will)
        all_findings.extend(findings)
        sources_meta.append(meta)
        print(f"Scanned {pdf.name}: {len(findings)} raw findings")

    if args.include_table_b1 and not args.no_table_b1:
        try:
            from parse_table_b1 import build_findings, extract_text, parse_rows

            b1 = DATA_DIR / "mat_research" / "5-part_b_b-2-min_test_cert-quantities_list.pdf"
            if b1.exists():
                rows = parse_rows(extract_text(b1))
                b1_findings = build_findings(rows)
                all_findings.extend(b1_findings)
                print(f"Table B-1 T99 capacity findings: {len(b1_findings)}")
            else:
                print("Table B-1 PDF not found; run download_specs.py --only table_b1_quantities")
        except Exception as exc:
            print(f"Table B-1 parse skipped: {exc}")

    findings = dedupe_findings(all_findings)
    summary = summarize(findings)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    source_name = " + ".join(m["source"] for m in sources_meta) or args.pdf.name
    if any(f.get("source") == "Table B-1 quantities list" for f in findings):
        source_name += " + Table B-1"
    payload = {
        "sources": sources_meta,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "findings": findings,
        "lesson": "docs/lesson-rt301-t99-testing-capacity.md",
    }
    json_path = args.out_dir / "spec_risk_findings.json"
    html_path = args.out_dir / "spec_risk_findings.html"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    html_path.write_text(render_html(findings, summary, source_name), encoding="utf-8")

    print(f"Findings: {summary['total']}")
    print(f"By severity: {summary['by_severity']}")
    print(f"By category: {summary['by_category']}")
    print(f"Wrote {json_path}")
    print(f"Wrote {html_path}")


if __name__ == "__main__":
    main()

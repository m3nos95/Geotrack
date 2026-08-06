#!/usr/bin/env python3
"""Corpus-wide absence scan for expected closing clauses.

For each risk exposure, search Specs / Materials / Construction manuals for
provisions that *close* the risk (response time, QC/QA tiebreaker, covering-work
notice, work-continuation while awaiting tests, retest path, etc.).

Report where closers are missing or only weakly present. This is the inverse of
phrase-opposition detection: findings are absences, not asserted contradictions.

Review prompts only — not legal advice.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import yaml
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
PUBS = Path("/workspace/deldot-publications/files")
REPORT_DIR = ROOT / "reports"
CLAUSES_PATH = ROOT / "rules" / "closing_clauses.yaml"
ALT_SPECS = ROOT / "data" / "2026_DelDOT_Standard_Specifications.pdf"

CORPUS = {
    "standard_specs_2026": PUBS
    / "engineeringsupport.deldot.gov/images/b/b1/2026_DelDOT_Standard_Specifications.pdf",
    "mat_part_b": PUBS
    / "deldot.gov/Publications/manuals/mat_research/pdfs/4b_min_test_and_cert_req.pdf",
    "mat_table_b1": PUBS
    / "deldot.gov/Publications/manuals/mat_research/pdfs/5-part_b_b-2-min_test_cert-quantities_list.pdf",
    "mat_c200": PUBS / "deldot.gov/Publications/manuals/mat_research/pdfs/part_c/c200.pdf",
    "mat_c300": PUBS / "deldot.gov/Publications/manuals/mat_research/pdfs/part_c/c300.pdf",
    "mat_c400": PUBS / "deldot.gov/Publications/manuals/mat_research/pdfs/part_c/c400.pdf",
    "mat_c500": PUBS / "deldot.gov/Publications/manuals/mat_research/pdfs/part_c/c500.pdf",
    "construction_part_b": PUBS
    / "deldot.gov/Publications/manuals/construction_manual/pdfs/04-construction_manual-part_b.pdf",
    "construction_part_c": PUBS
    / "deldot.gov/Publications/manuals/construction_manual/pdfs/05-construction_manual-part_c.pdf",
    "construction_part_d": PUBS
    / "deldot.gov/Publications/manuals/construction_manual/pdfs/06-construction_manual-part_d.pdf",
    "construction_part_e": PUBS
    / "deldot.gov/Publications/manuals/construction_manual/pdfs/07-construction_manual-part_e.pdf",
    "construction_part_f": PUBS
    / "deldot.gov/Publications/manuals/construction_manual/pdfs/08-construction_manual-part_f.pdf",
    "construction_part_g": PUBS
    / "deldot.gov/Publications/manuals/construction_manual/pdfs/09-construction_manual-part_g.pdf",
}


def pdf_text(path: Path) -> str:
    if not path.exists():
        return ""
    reader = PdfReader(str(path))
    parts = []
    for i, page in enumerate(reader.pages):
        parts.append(f"\n===== PAGE {i+1} =====\n")
        parts.append(page.extract_text() or "")
    return "".join(parts)


def page_at(text: str, pos: int) -> int | None:
    page = None
    for m in re.finditer(r"===== PAGE (\d+) =====", text[: pos + 1]):
        page = int(m.group(1))
    return page


def load_corpus() -> dict[str, dict]:
    if not CORPUS["standard_specs_2026"].exists() and ALT_SPECS.exists():
        CORPUS["standard_specs_2026"] = ALT_SPECS
    docs = {}
    for doc_id, path in CORPUS.items():
        print(f"extract {doc_id} …")
        text = pdf_text(path)
        docs[doc_id] = {
            "id": doc_id,
            "path": str(path),
            "name": path.name,
            "chars": len(text),
            "text": text,
        }
        print(f"  {len(text):,} chars")
    return docs


def find_hits(text: str, patterns: list[str], limit: int = 6) -> list[dict]:
    hits = []
    seen = set()
    for pat in patterns:
        try:
            regex = re.compile(pat, re.I | re.S)
        except re.error:
            continue
        for m in regex.finditer(text):
            bucket = m.start() // 600
            key = (pat, bucket)
            if key in seen:
                continue
            seen.add(key)
            local = text[max(0, m.start() - 30) : m.end() + 30]
            if "....." in local:
                continue
            a, b = max(0, m.start() - 160), min(len(text), m.end() + 180)
            hits.append(
                {
                    "pattern": pat,
                    "match": m.group(0)[:100],
                    "page": page_at(text, m.start()),
                    "snippet": re.sub(r"\s+", " ", text[a:b]).strip()[:450],
                }
            )
            if len(hits) >= limit:
                return hits
    return hits


def scan_clause(clause: dict, docs: dict[str, dict]) -> dict:
    patterns = clause.get("present_patterns") or []
    hits_by_doc = {}
    total = 0
    for doc_id, doc in docs.items():
        if not doc["text"]:
            continue
        hits = find_hits(doc["text"], patterns)
        if hits:
            hits_by_doc[doc_id] = hits
            total += len(hits)

    expect = clause.get("expect_in") or []
    expected_with_hits = [d for d in expect if d in hits_by_doc]
    expected_missing = [d for d in expect if d not in hits_by_doc]

    if total == 0:
        status = "absent"
        severity = clause.get("severity_if_absent", "medium")
    elif expected_missing and not expected_with_hits:
        # Closers exist only outside the docs where we most need them
        status = "weak_or_misplaced"
        severity = clause.get("severity_if_absent", "medium")
    elif expected_missing and expected_with_hits:
        status = "partial"
        severity = "medium" if clause.get("severity_if_absent") == "high" else "low"
    else:
        status = "present"
        severity = "info"

    return {
        "id": clause["id"],
        "title": clause["title"],
        "risk": clause.get("risk", "").strip(),
        "status": status,
        "severity": severity,
        "kind": "absence" if status in {"absent", "weak_or_misplaced"} else "presence_check",
        "related_sections": clause.get("related_sections") or [],
        "expect_in": expect,
        "expected_missing": expected_missing,
        "hit_count": total,
        "hits_by_doc": hits_by_doc,
        "note": _status_note(status, expected_missing, expected_with_hits, total),
    }


def _status_note(status: str, missing: list, found: list, total: int) -> str:
    if status == "absent":
        return (
            "No closing-clause pattern matched in the scanned corpus. "
            "Human review: confirm the gap, then consider adding explicit language."
        )
    if status == "weak_or_misplaced":
        return (
            f"Possible closer language found, but not in expected controlling docs "
            f"({', '.join(missing) or '—'}). Verify whether project Specs actually close the risk."
        )
    if status == "partial":
        return (
            f"Closer language found in {', '.join(found)}; still missing from "
            f"{', '.join(missing)}. Check whether coverage is complete."
        )
    return f"Closing-clause patterns matched ({total} hits). Skim snippets to confirm they actually close the risk."


def find_regions_of_interest(docs: dict[str, dict]) -> list[dict]:
    """Multi-actor / high-density neighborhoods — NOT asserted contradictions."""
    rois = []
    # QC/QA dual-actor density
    for doc_id, doc in docs.items():
        text = doc.get("text") or ""
        if not text:
            continue
        qc = len(re.findall(r"\b(?:quality\s+control|\bQC\b)", text, re.I))
        qa = len(re.findall(r"\b(?:quality\s+assurance|\bQA\b)", text, re.I))
        dept_test = len(
            re.findall(r"\b(?:department|engineer)\s+will\s+(?:test|sample|inspect)\b", text, re.I)
        )
        contr_test = len(
            re.findall(r"\bcontractor\s+shall\s+(?:test|sample|perform)\b", text, re.I)
        )
        if (qc >= 3 and qa >= 3) or (dept_test >= 2 and contr_test >= 2):
            rois.append(
                {
                    "id": f"roi-dual-testing-{doc_id}",
                    "kind": "region_of_interest",
                    "severity": "info",
                    "title": f"Region of interest: dual testing actors in {doc_id}",
                    "summary": (
                        "Both Department/engineer and contractor testing language appear "
                        "with meaningful density. This is a review neighborhood — not an "
                        "asserted contradiction. Check for absences: QC/QA tiebreaker, "
                        "response time, work-continuation while awaiting tests."
                    ),
                    "doc": doc_id,
                    "signals": {
                        "qc_mentions": qc,
                        "qa_mentions": qa,
                        "dept_will_test": dept_test,
                        "contractor_shall_test": contr_test,
                    },
                }
            )
    return rois


def render_html(results: list[dict], rois: list[dict], docs_meta: list[dict]) -> str:
    absents = [r for r in results if r["status"] in {"absent", "weak_or_misplaced"}]
    partials = [r for r in results if r["status"] == "partial"]
    presents = [r for r in results if r["status"] == "present"]

    def card(r: dict) -> str:
        hits = r.get("hits_by_doc") or {}
        hit_html = ""
        if hits:
            blocks = []
            for doc_id, hs in hits.items():
                items = "".join(
                    f"<li><small>p.{h.get('page') or '?'} · <code>{html.escape(h.get('match') or '')}</code></small><br>"
                    f"{html.escape(h.get('snippet') or '')}</li>"
                    for h in hs[:3]
                )
                blocks.append(f"<div class='doc'><h3>{html.escape(doc_id)}</h3><ul>{items}</ul></div>")
            hit_html = f"<div class='docs'>{''.join(blocks)}</div>"
        else:
            hit_html = "<p class='none'>No matching closer language found.</p>"
        secs = ", ".join(r.get("related_sections") or []) or "—"
        return (
            f"<article class='finding {html.escape(r['severity'])} status-{html.escape(r['status'])}'>"
            f"<div class='meta'><span class='sev'>{html.escape(r['severity'])}</span> "
            f"<span class='kind'>{html.escape(r['status'])}</span> "
            f"<span class='kind'>§ {html.escape(secs)}</span></div>"
            f"<h2>{html.escape(r['title'])}</h2>"
            f"<p>{html.escape(r.get('risk') or '')}</p>"
            f"<p><em>{html.escape(r.get('note') or '')}</em></p>"
            f"{hit_html}</article>"
        )

    roi_cards = []
    for r in rois:
        sig = r.get("signals") or {}
        roi_cards.append(
            f"<article class='finding info'>"
            f"<div class='meta'><span class='sev'>roi</span> "
            f"<span class='kind'>region_of_interest</span></div>"
            f"<h2>{html.escape(r['title'])}</h2>"
            f"<p>{html.escape(r['summary'])}</p>"
            f"<p class='none'>Signals: {html.escape(json.dumps(sig))}</p>"
            f"</article>"
        )

    doc_list = "".join(
        f"<li><code>{html.escape(d['id'])}</code> — {html.escape(d['name'])}</li>" for d in docs_meta
    )

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>DelDOT absence scan — missing closing clauses</title>
<style>
:root {{ --ink:#1a2332; --muted:#5a6a7a; --bg:#f2f5f3; --panel:#fff; --accent:#0b6e4f;
  --high:#9b2226; --med:#bc6c25; --info:#3d5a80; --line:#d5ddd8; --ok:#2a6f4e; }}
body {{ margin:0; font-family:"Source Sans 3","Segoe UI",sans-serif; color:var(--ink);
  background: radial-gradient(1000px 500px at 0% 0%, #dceee6, transparent 50%), var(--bg); }}
header, main, footer {{ max-width:1100px; margin:0 auto; padding:1.5rem; }}
h1 {{ font-family:"IBM Plex Serif", Georgia, serif; }}
.brand {{ color:var(--accent); text-transform:uppercase; letter-spacing:.04em; font-size:.8rem; font-weight:700; }}
.sub {{ color:var(--muted); max-width:46rem; line-height:1.45; }}
.stats {{ display:flex; gap:1rem; flex-wrap:wrap; margin:1rem 0; }}
.stat {{ background:var(--panel); border:1px solid var(--line); padding:.8rem 1rem; min-width:7rem; }}
.stat b {{ display:block; font-size:1.5rem; color:var(--accent); }}
.finding {{ background:var(--panel); border:1px solid var(--line); padding:1rem 1.2rem; margin:1rem 0; }}
.finding.high {{ border-left:4px solid var(--high); }}
.finding.medium {{ border-left:4px solid var(--med); }}
.finding.info, .finding.low {{ border-left:4px solid var(--info); }}
.status-present {{ border-left-color: var(--ok) !important; }}
.sev {{ font-weight:700; text-transform:uppercase; font-size:.75rem; }}
.high .sev {{ color:var(--high); }} .medium .sev {{ color:var(--med); }} .info .sev {{ color:var(--info); }}
.kind {{ color:var(--muted); font-size:.78rem; margin-left:.45rem; }}
.docs {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:.8rem; }}
.doc {{ background:#f7faf8; padding:.6rem .8rem; border:1px solid var(--line); font-size:.86rem; color:var(--muted); }}
.doc h3 {{ margin:0 0 .35rem; font-size:.82rem; }}
.none {{ color:var(--muted); font-size:.9rem; }}
code {{ background:#eef3f0; padding:0 .25rem; }}
h2.section {{ margin-top:2rem; font-size:1.2rem; }}
</style></head><body>
<header>
  <div class="brand">DelDOT · Absence scan</div>
  <h1>Missing closing clauses</h1>
  <p class="sub">
    Negative search across Specs, Materials Manual, and Construction Manual for
    provisions that close known exposures (response time, QC/QA tiebreaker,
    covering-work notice, work-continuation while awaiting tests, retest path).
    <strong>Absences are the findings.</strong> Dual-actor clusters are labeled
    regions of interest — not contradictions.
  </p>
  <div class="stats">
    <div class="stat"><b>{len(absents)}</b> absent / weak</div>
    <div class="stat"><b>{len(partials)}</b> partial</div>
    <div class="stat"><b>{len(presents)}</b> present</div>
    <div class="stat"><b>{len(rois)}</b> ROI neighborhoods</div>
  </div>
  <p><strong>Corpus</strong></p><ul>{doc_list}</ul>
</header>
<main>
  <h2 class="section">Gaps (review these)</h2>
  {''.join(card(r) for r in absents) or '<p class="none">None flagged absent.</p>'}
  <h2 class="section">Partial coverage</h2>
  {''.join(card(r) for r in partials) or '<p class="none">None.</p>'}
  <h2 class="section">Regions of interest (not findings)</h2>
  <p class="sub">High dual-actor density. Use these to aim absence review — do not treat as contradictions.</p>
  {''.join(roi_cards) or '<p class="none">None.</p>'}
  <h2 class="section">Closers found (verify they actually close the risk)</h2>
  {''.join(card(r) for r in presents) or '<p class="none">None.</p>'}
</main>
<footer>Generated {html.escape(datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC'))}.
Rules: rules/closing_clauses.yaml</footer>
</body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clauses", type=Path, default=CLAUSES_PATH)
    parser.add_argument("--out-dir", type=Path, default=REPORT_DIR)
    args = parser.parse_args()

    clauses = yaml.safe_load(args.clauses.read_text(encoding="utf-8"))["clauses"]
    docs = load_corpus()
    results = [scan_clause(c, docs) for c in clauses]
    rois = find_regions_of_interest(docs)

    meta = [{"id": d["id"], "name": d["name"], "chars": d["chars"], "path": d["path"]} for d in docs.values()]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "corpus": meta,
        "summary": {
            "absent_or_weak": sum(1 for r in results if r["status"] in {"absent", "weak_or_misplaced"}),
            "partial": sum(1 for r in results if r["status"] == "partial"),
            "present": sum(1 for r in results if r["status"] == "present"),
            "regions_of_interest": len(rois),
        },
        "clauses": results,
        "regions_of_interest": rois,
        "method_note": (
            "Absence detection: search for closing-clause patterns; report where missing. "
            "Regions of interest flag dual-actor neighborhoods without asserting contradiction."
        ),
    }

    args.out_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.out_dir / "absence_findings.json"
    html_path = args.out_dir / "absence_findings.html"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    html_path.write_text(render_html(results, rois, meta), encoding="utf-8")

    print(f"Summary: {payload['summary']}")
    for r in results:
        mark = {
            "absent": "ABSENT",
            "weak_or_misplaced": "WEAK",
            "partial": "partial",
            "present": "present",
        }[r["status"]]
        print(f"  [{mark:7}] {r['id']}: {r['title'][:70]}")
    print(f"ROIs: {len(rois)}")
    print(f"Wrote {html_path}")


if __name__ == "__main__":
    main()

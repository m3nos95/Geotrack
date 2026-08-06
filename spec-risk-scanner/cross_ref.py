#!/usr/bin/env python3
"""Cross-reference DelDOT publications for contradictions and ambiguous overlaps.

Compares key manuals side-by-side on shared topics (testing, compaction,
payment, precedence, definitions). Findings are review prompts — not legal
conclusions or blame.
"""

from __future__ import annotations

import argparse
import html
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
PUBS = Path("/workspace/deldot-publications/files")
REPORT_DIR = ROOT / "reports"

# Core corpus for cross-doc review (latest / controlling where possible)
CORPUS = {
    "standard_specs_2026": PUBS
    / "engineeringsupport.deldot.gov/images/b/b1/2026_DelDOT_Standard_Specifications.pdf",
    "mat_part_b": PUBS
    / "deldot.gov/Publications/manuals/mat_research/pdfs/4b_min_test_and_cert_req.pdf",
    "mat_table_b1": PUBS
    / "deldot.gov/Publications/manuals/mat_research/pdfs/5-part_b_b-2-min_test_cert-quantities_list.pdf",
    "mat_c200": PUBS
    / "deldot.gov/Publications/manuals/mat_research/pdfs/part_c/c200.pdf",
    "mat_c300": PUBS
    / "deldot.gov/Publications/manuals/mat_research/pdfs/part_c/c300.pdf",
    "mat_c400": PUBS
    / "deldot.gov/Publications/manuals/mat_research/pdfs/part_c/c400.pdf",
    "mat_glossary": PUBS
    / "deldot.gov/Publications/manuals/mat_research/pdfs/6f_glossary.pdf",
    "construction_part_b": PUBS
    / "deldot.gov/Publications/manuals/construction_manual/pdfs/04-construction_manual-part_b.pdf",
    "construction_part_c": PUBS
    / "deldot.gov/Publications/manuals/construction_manual/pdfs/05-construction_manual-part_c.pdf",
    "construction_part_d": PUBS
    / "deldot.gov/Publications/manuals/construction_manual/pdfs/06-construction_manual-part_d.pdf",
    "construction_part_e": PUBS
    / "deldot.gov/Publications/manuals/construction_manual/pdfs/07-construction_manual-part_e.pdf",
}

# Fallback if Eng Support path missing
ALT_SPECS = ROOT / "data" / "2026_DelDOT_Standard_Specifications.pdf"

TOPICS = {
    "atterberg_limits": {
        "label": "Liquid / plastic limits (Atterberg)",
        "patterns": [
            r"\bT\s*-?\s*89\b",
            r"\bT\s*-?\s*90\b",
            r"\bliquid\s+limit\b",
            r"\bplastic\s+limit\b",
            r"\bplasticity\s+index\b",
            r"\bAtterberg\b",
        ],
    },
    "proctor_density": {
        "label": "Proctor / maximum density / compaction %",
        "patterns": [
            r"\bT\s*-?\s*99\b",
            r"\bT\s*-?\s*180\b",
            r"\bT\s*-?\s*272\b",
            r"\bone[-\s]?point\b",
            r"\bmaximum\s+density\b",
            r"\b\d{2,3}\s+percent\b.{0,40}\b(?:maximum\s+density|standard\s+proctor|proctor)\b",
            r"\bcompact(?:ed|ion)?\b.{0,60}\b\d{2,3}\s+percent\b",
        ],
    },
    "testing_frequency": {
        "label": "Sampling / testing frequency",
        "patterns": [
            r"\btesting\s+frequenc",
            r"\bsampling\s+rate",
            r"\b1\s*/\s*\d+\b",
            r"\bminimum\s+testing\b",
            r"\bincrease\s+the\s+sampling\b",
            r"\bTable\s+B-?1\b",
        ],
    },
    "materials_manual_deferral": {
        "label": "Deferral to Materials Manual",
        "patterns": [
            r"\bMaterials\s+Manual\b",
            r"\bDepartment.?s\s+Materials\s+Manual\b",
        ],
    },
    "order_of_precedence": {
        "label": "Order of precedence / document conflicts",
        "patterns": [
            r"\border\s+of\s+precedence\b",
            r"\btake(?:s)?\s+precedence\b",
            r"\bconflict\s+between\s+the\s+contract\s+documents\b",
            r"\bdiscrepanc(?:y|ies)\b",
        ],
    },
    "incidental_payment": {
        "label": "Incidental / no separate payment",
        "patterns": [
            r"\bincidental\b",
            r"\bno\s+separate\s+payment\b",
            r"\bno\s+additional\s+compensation\b",
            r"\bincluded?\s+in\s+the\s+(?:unit\s+)?price\b",
        ],
    },
    "shall_will_definitions": {
        "label": "Shall / will / satisfactory definitions",
        "patterns": [
            r"\bthe\s+word\s+[\"']?will[\"']?\b",
            r"\bthe\s+word\s+[\"']?shall[\"']?\b",
            r"\bsatisfactory\b",
            r"\bas\s+directed\b",
            r"\bas\s+necessary\b",
        ],
    },
    "borrow_earthwork_acceptance": {
        "label": "Borrow / embankment acceptance",
        "patterns": [
            r"\bborrow\b",
            r"\bembankment\b",
            r"\bsubgrade\b",
            r"\bType\s+[A-G]\b.{0,40}\bborrow\b",
        ],
    },
}


def pdf_text(path: Path, max_pages: int | None = None) -> str:
    if not path.exists():
        return ""
    reader = PdfReader(str(path))
    parts = []
    pages = reader.pages if max_pages is None else reader.pages[:max_pages]
    for i, page in enumerate(pages):
        parts.append(f"\n===== PAGE {i+1} =====\n")
        parts.append(page.extract_text() or "")
    return "".join(parts)


def load_corpus() -> dict[str, dict]:
    docs = {}
    specs = CORPUS["standard_specs_2026"]
    if not specs.exists() and ALT_SPECS.exists():
        CORPUS["standard_specs_2026"] = ALT_SPECS
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
        print(f"  {path.name}: {len(text):,} chars")
    return docs


def snippets_for(text: str, patterns: list[str], limit: int = 8, radius: int = 220) -> list[dict]:
    found = []
    seen_buckets = set()
    for pat in patterns:
        for m in re.finditer(pat, text, re.I | re.S):
            bucket = m.start() // 800
            key = (pat, bucket)
            if key in seen_buckets:
                continue
            seen_buckets.add(key)
            a = max(0, m.start() - radius)
            b = min(len(text), m.end() + radius)
            snip = re.sub(r"\s+", " ", text[a:b]).strip()
            # skip TOC leaders
            if "....." in snip:
                continue
            page_m = None
            for pm in re.finditer(r"===== PAGE (\d+) =====", text[: m.start()]):
                page_m = int(pm.group(1))
            found.append(
                {
                    "match": m.group(0)[:80],
                    "page": page_m,
                    "snippet": snip[:500],
                }
            )
            if len(found) >= limit:
                return found
    return found


def compaction_percents(text: str) -> list[str]:
    vals = set()
    for m in re.finditer(
        r"(\d{2,3})\s+percent(?:\s+or\s+more)?\s+of\s+the\s+maximum\s+density",
        text,
        re.I,
    ):
        vals.add(m.group(1))
    for m in re.finditer(
        r"compact(?:ed|ion)?[^\n.]{0,80}?(\d{2,3})\s*%?\s*(?:of\s+)?(?:standard\s+)?proctor",
        text,
        re.I,
    ):
        vals.add(m.group(1))
    return sorted(vals, key=int)


def analyze(docs: dict[str, dict]) -> list[dict]:
    findings: list[dict] = []

    # 1) Topic coverage matrix + ambiguity when only one side is specific
    topic_hits: dict[str, dict[str, list]] = {}
    for topic_id, topic in TOPICS.items():
        topic_hits[topic_id] = {}
        for doc_id, doc in docs.items():
            if not doc["text"]:
                continue
            hits = snippets_for(doc["text"], topic["patterns"])
            if hits:
                topic_hits[topic_id][doc_id] = hits

    # Atterberg: Table B-1 specific vs Specs vague
    att_docs = topic_hits.get("atterberg_limits", {})
    freq_docs = topic_hits.get("testing_frequency", {})
    if "mat_table_b1" in att_docs and "standard_specs_2026" in docs:
        specs_att = att_docs.get("standard_specs_2026", [])
        findings.append(
            {
                "id": "xref-atterberg-specs-vs-b1",
                "severity": "high",
                "kind": "cross_doc_gap",
                "topic": "atterberg_limits",
                "title": "Standard Specs defer density; Table B-1 requires T89/T90 at rate",
                "summary": (
                    "Earthwork acceptance in Standard Specs often says only "
                    "'compact to X% of maximum density' and points to the Materials Manual, "
                    "while Table B-1 assigns liquid/plastic limits (T89/T90) at per-yd³ "
                    "frequencies. That split is easy to miss in project staffing and is "
                    "ambiguous about whether every density sample also needs Atterbergs."
                ),
                "docs": {
                    "standard_specs_2026": snippets_for(
                        docs["standard_specs_2026"]["text"],
                        [r"maximum\s+density", r"Materials\s+Manual"],
                        limit=4,
                    ),
                    "mat_table_b1": att_docs.get("mat_table_b1", [])[:4],
                    "mat_part_b": freq_docs.get("mat_part_b", [])[:2],
                },
            }
        )

    # Compaction percent conflicts across docs
    pct_by_doc = {
        doc_id: compaction_percents(doc["text"])
        for doc_id, doc in docs.items()
        if doc["text"]
    }
    all_pcts = sorted({pct for vals in pct_by_doc.values() for pct in vals}, key=int)
    if len(all_pcts) >= 2:
        pct_label = ", ".join(f"{pct}%" for pct in all_pcts)
        docs_block = {}
        for doc_id, vals in pct_by_doc.items():
            if not vals:
                continue
            label = ", ".join(f"{v}%" for v in vals)
            docs_block[doc_id] = [
                {
                    "match": label,
                    "page": None,
                    "snippet": f"Document uses {label} of maximum density / Proctor language.",
                }
            ]
        findings.append(
            {
                "id": "xref-compaction-percent-variance",
                "severity": "medium",
                "kind": "possible_conflict",
                "topic": "proctor_density",
                "title": f"Compaction percent requirements vary across manuals ({pct_label})",
                "summary": (
                    "Different manuals state different 'percent of maximum density' "
                    "targets. Confirm which applies by work type (subgrade vs embankment "
                    "vs backfill) and that Construction Manual guidance matches Specs."
                ),
                "docs": docs_block,
                "values_by_doc": pct_by_doc,
            }
        )

    # Part B "increase sampling" vs no capacity language in Specs
    if "mat_part_b" in docs and re.search(
        r"increase\s+the\s+sampling\s+rates", docs["mat_part_b"]["text"], re.I
    ):
        findings.append(
            {
                "id": "xref-increase-sampling-no-capacity-backstop",
                "severity": "high",
                "kind": "ambiguous_authority",
                "topic": "testing_frequency",
                "title": "Part B allows increasing sampling rates with no capacity backstop in Specs",
                "summary": (
                    "Materials Manual Part B lets the Engineer raise sampling above "
                    "Table B-1 minimums. Standard Specs do not pair that authority with "
                    "a placement pause or lab-capacity check — rates can climb while "
                    "testing falls behind."
                ),
                "docs": {
                    "mat_part_b": snippets_for(
                        docs["mat_part_b"]["text"],
                        [r"increase\s+the\s+sampling\s+rates?"],
                        limit=2,
                    ),
                    "standard_specs_2026": snippets_for(
                        docs["standard_specs_2026"]["text"],
                        [r"Materials\s+Manual", r"sampling\s+and\s+testing"],
                        limit=3,
                    ),
                },
            }
        )

    # Precedence: Specs have order; other manuals may not align
    prec = topic_hits.get("order_of_precedence", {})
    if "standard_specs_2026" in prec:
        findings.append(
            {
                "id": "xref-precedence-only-in-specs",
                "severity": "medium",
                "kind": "clarity_gap",
                "topic": "order_of_precedence",
                "title": "Conflict hierarchy lives in Specs; manuals may still contradict without saying who wins",
                "summary": (
                    "Order-of-precedence language is concentrated in Standard Specs. "
                    "Materials / Construction Manual text can still conflict with Specs "
                    "on methods or frequencies; readers need an explicit reminder that "
                    "project Special Provisions and Specs beat manual guidance unless "
                    "incorporated."
                ),
                "docs": {
                    doc_id: hits[:3] for doc_id, hits in prec.items()
                },
            }
        )

    # Incidental payment language density across manuals
    inc = topic_hits.get("incidental_payment", {})
    if len(inc) >= 2:
        findings.append(
            {
                "id": "xref-incidental-multi-manual",
                "severity": "medium",
                "kind": "ambiguous_overlap",
                "topic": "incidental_payment",
                "title": "Incidental / no-separate-payment language appears in multiple manuals",
                "summary": (
                    "Payment-shift phrases show up in Specs and Construction Manual "
                    "guidance. Cross-check that Construction Manual examples do not "
                    "expand 'incidental' work beyond what Specs Method of Measurement / "
                    "Basis of Payment allow."
                ),
                "docs": {doc_id: hits[:3] for doc_id, hits in inc.items()},
            }
        )

    # Construction Manual vs Specs on borrow/earthwork
    if "construction_part_c" in docs or "construction_part_d" in docs:
        cm_text = (docs.get("construction_part_c", {}) or {}).get("text", "") + (
            docs.get("construction_part_d", {}) or {}
        ).get("text", "")
        if cm_text and docs.get("standard_specs_2026", {}).get("text"):
            cm_pct = compaction_percents(cm_text)
            sp_pct = compaction_percents(docs["standard_specs_2026"]["text"])
            if cm_pct and sp_pct and set(cm_pct) != set(sp_pct):
                findings.append(
                    {
                        "id": "xref-cm-vs-specs-compaction",
                        "severity": "high",
                        "kind": "possible_conflict",
                        "topic": "proctor_density",
                        "title": "Construction Manual vs Standard Specs compaction percentages differ",
                        "summary": (
                            f"Construction Manual compaction language uses {cm_pct}% targets; "
                            f"Standard Specs use {sp_pct}%. Verify inspectors are not applying "
                            "manual guidance that under/over-shoots the contract Specs."
                        ),
                        "docs": {
                            "standard_specs_2026": snippets_for(
                                docs["standard_specs_2026"]["text"],
                                [r"\d{2,3}\s+percent(?:\s+or\s+more)?\s+of\s+the\s+maximum\s+density"],
                                limit=4,
                            ),
                            "construction_manual": snippets_for(
                                cm_text,
                                [r"\d{2,3}\s+percent(?:\s+or\s+more)?\s+of\s+the\s+maximum\s+density", r"proctor"],
                                limit=4,
                            ),
                        },
                    }
                )

    # T272 present in some B-1 rows / absent in Specs earthwork
    b1 = docs.get("mat_table_b1", {}).get("text", "")
    sp = docs.get("standard_specs_2026", {}).get("text", "")
    if b1 and sp:
        b1_has_t272 = bool(re.search(r"\bT\s*-?\s*272\b", b1, re.I))
        sp_has_one_point = bool(
            re.search(r"\bone[-\s]?point\b|\bT\s*-?\s*272\b|family\s+of\s+curves", sp, re.I)
        )
        if b1_has_t272 and not sp_has_one_point:
            findings.append(
                {
                    "id": "xref-t272-in-b1-not-in-specs",
                    "severity": "medium",
                    "kind": "inconsistent_methods",
                    "topic": "proctor_density",
                    "title": "Table B-1 mentions T272 for some items; 2026 Specs earthwork path does not",
                    "summary": (
                        "Some base/GABC Table B-1 rows list T272 (family of curves) with T99, "
                        "but 2026 Standard Specs earthwork language does not surface a one-point "
                        "/ T272 production path. Method availability looks inconsistent across "
                        "item types — worth aligning for clarity (example of the pattern, not "
                        "the RT 301 Atterberg issue)."
                    ),
                    "docs": {
                        "mat_table_b1": snippets_for(b1, [r"T\s*-?\s*272"], limit=3),
                        "standard_specs_2026": snippets_for(
                            sp, [r"maximum\s+density", r"T\s*-?\s*99"], limit=3
                        ),
                    },
                }
            )

    # Build coverage appendix as informational findings for topics with multi-doc hits
    for topic_id, by_doc in topic_hits.items():
        if len(by_doc) < 2:
            continue
        # skip topics already heavily covered above if desired — keep as inventory
        findings.append(
            {
                "id": f"xref-coverage-{topic_id}",
                "severity": "low",
                "kind": "topic_coverage",
                "topic": topic_id,
                "title": f"Topic covered in {len(by_doc)} manuals: {TOPICS[topic_id]['label']}",
                "summary": (
                    "Same topic appears in multiple publications — review snippets for "
                    "wording that pulls in different directions (methods, rates, who decides)."
                ),
                "docs": {d: hits[:2] for d, hits in by_doc.items()},
            }
        )

    severity_rank = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (severity_rank.get(f["severity"], 9), f["id"]))
    return findings


def render_html(findings: list[dict], docs_meta: list[dict]) -> str:
    cards = []
    for f in findings:
        if f["kind"] == "topic_coverage" and f["severity"] == "low":
            continue  # keep HTML focused on conflicts/ambiguity
        doc_blocks = []
        for doc_id, hits in (f.get("docs") or {}).items():
            items = "".join(
                f"<li><small>p.{h.get('page') or '?'} · <code>{html.escape(str(h.get('match') or ''))}</code></small><br>"
                f"{html.escape(h.get('snippet') or '')}</li>"
                for h in hits[:4]
            )
            doc_blocks.append(f"<div class='doc'><h3>{html.escape(doc_id)}</h3><ul>{items}</ul></div>")
        cards.append(
            f"<article class='finding {html.escape(f['severity'])}'>"
            f"<div class='meta'><span class='sev'>{html.escape(f['severity'])}</span> "
            f"<span class='kind'>{html.escape(f['kind'])}</span></div>"
            f"<h2>{html.escape(f['title'])}</h2>"
            f"<p>{html.escape(f['summary'])}</p>"
            f"<div class='docs'>{''.join(doc_blocks)}</div>"
            f"</article>"
        )

    doc_list = "".join(
        f"<li><code>{html.escape(d['id'])}</code> — {html.escape(d['name'])} ({d['chars']:,} chars)</li>"
        for d in docs_meta
    )
    high = sum(1 for f in findings if f["severity"] == "high")
    med = sum(1 for f in findings if f["severity"] == "medium")

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>DelDOT cross-publication conflict review</title>
<style>
:root {{ --ink:#1a2332; --muted:#5a6a7a; --bg:#f2f5f3; --panel:#fff; --accent:#0b6e4f;
  --high:#9b2226; --med:#bc6c25; --low:#3d5a80; --line:#d5ddd8; }}
body {{ margin:0; font-family:"Source Sans 3","Segoe UI",sans-serif; color:var(--ink);
  background: radial-gradient(1000px 500px at 0% 0%, #dceee6, transparent 50%), var(--bg); }}
header, main, footer {{ max-width:1100px; margin:0 auto; padding:1.5rem 1.5rem; }}
h1 {{ font-family:"IBM Plex Serif", Georgia, serif; margin:0.2rem 0 0.5rem; }}
.brand {{ color:var(--accent); text-transform:uppercase; letter-spacing:.04em; font-size:.8rem; font-weight:700; }}
.sub {{ color:var(--muted); max-width:42rem; }}
.stats {{ display:flex; gap:1rem; flex-wrap:wrap; margin:1rem 0; }}
.stat {{ background:var(--panel); border:1px solid var(--line); padding:.8rem 1rem; min-width:7rem; }}
.stat b {{ display:block; font-size:1.6rem; color:var(--accent); }}
.finding {{ background:var(--panel); border:1px solid var(--line); padding:1rem 1.2rem; margin:1rem 0; }}
.finding.high {{ border-left:4px solid var(--high); }}
.finding.medium {{ border-left:4px solid var(--med); }}
.finding.low {{ border-left:4px solid var(--low); }}
.sev {{ font-weight:700; text-transform:uppercase; font-size:.75rem; }}
.high .sev {{ color:var(--high); }} .medium .sev {{ color:var(--med); }}
.kind {{ color:var(--muted); font-size:.8rem; margin-left:.5rem; }}
.docs {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:.8rem; }}
.doc {{ background:#f7faf8; padding:.6rem .8rem; border:1px solid var(--line); }}
.doc h3 {{ margin:0 0 .4rem; font-size:.85rem; color:var(--muted); }}
.doc ul {{ margin:0; padding-left:1rem; font-size:.86rem; color:var(--muted); }}
code {{ background:#eef3f0; padding:0 .25rem; }}
</style></head><body>
<header>
  <div class="brand">DelDOT · Cross-publication review</div>
  <h1>Conflicts, gaps, and ambiguous overlaps</h1>
  <p class="sub">Side-by-side check of Standard Specs, Materials Manual, and Construction
  Manual on shared topics. Review prompts only — not determinations of fault.</p>
  <div class="stats">
    <div class="stat"><b>{high}</b> high</div>
    <div class="stat"><b>{med}</b> medium</div>
    <div class="stat"><b>{len(findings)}</b> total flags</div>
  </div>
  <p><strong>Corpus</strong></p>
  <ul>{doc_list}</ul>
</header>
<main>{''.join(cards)}</main>
<footer>Generated {html.escape(datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC'))}</footer>
</body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, default=REPORT_DIR)
    args = parser.parse_args()

    docs = load_corpus()
    findings = analyze(docs)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    meta = [{"id": d["id"], "name": d["name"], "chars": d["chars"], "path": d["path"]} for d in docs.values()]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "corpus": meta,
        "finding_count": len(findings),
        "by_severity": {
            s: sum(1 for f in findings if f["severity"] == s) for s in ("high", "medium", "low")
        },
        "findings": findings,
    }
    json_path = args.out_dir / "cross_pub_conflicts.json"
    html_path = args.out_dir / "cross_pub_conflicts.html"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    html_path.write_text(render_html(findings, meta), encoding="utf-8")
    print(f"Findings: {payload['finding_count']} {payload['by_severity']}")
    for f in findings:
        if f["severity"] in ("high", "medium") and f["kind"] != "topic_coverage":
            print(f"  [{f['severity']}] {f['title']}")
    print(f"Wrote {html_path}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Discovery-oriented cross-reference of DelDOT publications.

Finds contradictions and ambiguous overlaps across manuals by mining:
  - numeric constraints (%, °F, days, inches, psi, frequencies) by topic family
  - duty / modality clashes (shall vs may, Department vs contractor)
  - glossary vs Specs definition mismatches
  - shared-topic wording that pulls in different directions

Not limited to compaction/Atterbergs — those are only two of many families.
Findings are review prompts, not legal conclusions.
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
    "mat_glossary": PUBS / "deldot.gov/Publications/manuals/mat_research/pdfs/6f_glossary.pdf",
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

# Topic families used to bucket nearby numeric / obligation language.
# Intentionally broad — discovery, not a shortlist of known issues.
TOPIC_FAMILIES = {
    "compaction_density": [r"compact", r"density", r"proctor", r"T\s*-?\s*99", r"T\s*-?\s*180"],
    "atterberg_classification": [r"liquid\s+limit", r"plastic\s+limit", r"plasticity", r"Atterberg", r"T\s*-?\s*89", r"T\s*-?\s*90", r"T\s*-?\s*88"],
    "moisture_content": [r"moisture", r"optimum\s+moisture", r"water\s+content"],
    "temperature_limits": [r"temperature", r"degrees?\s*F", r"°\s*F", r"fahrenheit", r"ambient"],
    "curing_concrete": [r"\bcure\b", r"curing", r"moist\s+cure"],
    "time_notice": [r"\bdays?\b", r"\bhours?\b", r"notice", r"within\s+\d+", r"calendar\s+day", r"working\s+day"],
    "tolerances_dimensions": [r"tolerance", r"variation", r"\binch", r"\bmm\b", r"straight.?edge", r"deviation"],
    "strength_psi": [r"\bpsi\b", r"compressive\s+strength", r"flexural", r"ksi"],
    "payment_measurement": [r"incidental", r"no\s+separate\s+payment", r"method\s+of\s+measurement", r"basis\s+of\s+payment", r"unit\s+price", r"lump\s+sum"],
    "sampling_frequency": [r"sampling", r"testing\s+frequen", r"1\s*/\s*\d+", r"per\s+\d+", r"lot\s+size"],
    "utilities": [r"utilit", r"relocation", r"miss\s+utility"],
    "weather_season": [r"weather", r"inclement", r"rain", r"freeze", r"frost"],
    "acceptance_rejection": [r"reject", r"unacceptable", r"acceptance", r"nonconforming", r"remove\s+and\s+replace"],
    "qc_qa_responsibility": [r"quality\s+control", r"quality\s+assurance", r"independent\s+assurance", r"\bQC\b", r"\bQA\b", r"\bIA\b"],
    "precedence_conflicts": [r"order\s+of\s+precedence", r"take(?:s)?\s+precedence", r"conflict\s+between", r"discrepanc"],
    "asphalt_hma": [r"bituminous", r"asphalt", r"hot.?mix", r"Superpave", r"PG\s*\d+"],
    "concrete_pcc": [r"portland", r"concrete", r"slump", r"air\s+content", r"w/\s*c\b"],
    "traffic_mot": [r"maintenance\s+of\s+traffic", r"\bMOT\b", r"detour", r"lane\s+closure"],
    "safety_osha": [r"OSHA", r"safety", r"PPE", r"confined\s+space"],
    "environmental": [r"erosion", r"sediment", r"NPDES", r"wetland", r"permit"],
}

NUM_PAT = re.compile(
    r"(?P<val>\d+(?:\.\d+)?)\s*"
    r"(?P<unit>"
    r"percent|%|degrees?\s*F|°\s*F|deg\.?\s*F|psi|ksi|"
    r"days?|hours?|minutes?|"
    r"inches?|in\.?|feet|foot|ft\.?|mm|cm|"
    r"tons?|yd(?:3|²|2|³)?|cy|"
    r"pounds?|lbs?\.?"
    r")\b",
    re.I,
)

DUTY_PAT = re.compile(
    r"\b(?P<actor>contractor|department|engineer|inspector|technician)\b"
    r".{0,40}?\b(?P<modal>shall|will|must|may|should)\b"
    r"|"
    r"\b(?P<modal2>shall|will|must|may|should)\b"
    r".{0,40}?\b(?P<actor2>contractor|department|engineer|inspector|technician)\b",
    re.I | re.S,
)


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


def normalize_unit(unit: str) -> str:
    u = re.sub(r"\s+", "", unit.lower())
    u = u.replace("degreesf", "degf").replace("°f", "degf").replace("deg.f", "degf")
    if u in {"percent", "%"}:
        return "percent"
    if u.startswith("day"):
        return "days"
    if u.startswith("hour"):
        return "hours"
    if u.startswith("minute"):
        return "minutes"
    if u in {"inch", "inches", "in", "in."}:
        return "inches"
    if u in {"foot", "feet", "ft", "ft."}:
        return "feet"
    if u in {"lb", "lbs", "lb.", "pound", "pounds"}:
        return "pounds"
    return u


def topic_for_window(window: str) -> list[str]:
    hits = []
    for topic, pats in TOPIC_FAMILIES.items():
        for pat in pats:
            if re.search(pat, window, re.I):
                hits.append(topic)
                break
    return hits or ["general"]


def extract_numeric_claims(doc_id: str, text: str) -> list[dict]:
    claims = []
    for m in NUM_PAT.finditer(text):
        # skip TOC-ish
        local = text[max(0, m.start() - 40) : m.end() + 40]
        if "....." in local:
            continue
        # skip AASHTO/ASTM method numbers (T310, T89, etc.) mistaken as quantities
        lead = text[max(0, m.start() - 6) : m.start()]
        if re.search(r"(?i)(?:\bT|\bM|\bR)\s*-?\s*$", lead):
            continue
        if re.search(r"(?i)AASHTO\s*$", text[max(0, m.start() - 10) : m.start()]):
            continue
        a = max(0, m.start() - 160)
        b = min(len(text), m.end() + 160)
        window = re.sub(r"\s+", " ", text[a:b]).strip()
        if len(window) < 20:
            continue
        val = float(m.group("val"))
        unit = normalize_unit(m.group("unit"))
        topics = topic_for_window(window)
        if topics == ["general"] and unit in {"days", "hours", "inches", "feet"} and val > 365:
            continue
        # Drop absurd dimension outliers likely from method IDs / noise
        if unit == "inches" and val >= 100:
            continue
        if unit == "feet" and val >= 100:
            continue
        claims.append(
            {
                "doc": doc_id,
                "value": val,
                "unit": unit,
                "topics": topics,
                "page": page_at(text, m.start()),
                "snippet": window[:420],
                "match": m.group(0),
            }
        )
    return claims


def extract_duty_claims(doc_id: str, text: str, limit: int = 400) -> list[dict]:
    claims = []
    for m in DUTY_PAT.finditer(text):
        g = m.groupdict()
        actor = (g.get("actor") or g.get("actor2") or "").lower()
        modal = (g.get("modal") or g.get("modal2") or "").lower()
        if not actor or not modal:
            continue
        a = max(0, m.start() - 120)
        b = min(len(text), m.end() + 160)
        window = re.sub(r"\s+", " ", text[a:b]).strip()
        if "....." in window:
            continue
        topics = topic_for_window(window)
        claims.append(
            {
                "doc": doc_id,
                "actor": actor,
                "modal": modal,
                "topics": topics,
                "page": page_at(text, m.start()),
                "snippet": window[:420],
                "match": m.group(0)[:80],
            }
        )
        if len(claims) >= limit:
            break
    return claims


def find_numeric_conflicts(claims: list[dict]) -> list[dict]:
    """Same topic + unit, different values across docs → candidate conflict."""
    buckets: dict[tuple, list] = defaultdict(list)
    for c in claims:
        for topic in c["topics"]:
            if topic == "general":
                continue
            key = (topic, c["unit"])
            buckets[key].append(c)

    findings = []
    for (topic, unit), items in buckets.items():
        by_doc: dict[str, set] = defaultdict(set)
        examples: dict[str, list] = defaultdict(list)
        for c in items:
            # round to reduce float noise
            v = int(c["value"]) if c["value"].is_integer() else round(c["value"], 2)
            by_doc[c["doc"]].add(v)
            if len(examples[c["doc"]]) < 3:
                examples[c["doc"]].append(c)
        if len(by_doc) < 2:
            continue
        # values that appear in some docs but not others
        all_vals = set()
        for vs in by_doc.values():
            all_vals |= vs
        if len(all_vals) < 2:
            continue
        # Require that at least two docs disagree on the set of values
        value_sets = {frozenset(vs) for vs in by_doc.values()}
        if len(value_sets) < 2:
            continue
        # Ignore very noisy topics/units with too many distinct values (page debris)
        if len(all_vals) > 12:
            continue
        # Prefer meaningful units
        if unit not in {
            "percent",
            "degf",
            "psi",
            "ksi",
            "days",
            "hours",
            "minutes",
            "inches",
            "feet",
            "mm",
        }:
            continue

        docs_payload = {}
        for doc, clist in examples.items():
            docs_payload[doc] = [
                {
                    "match": c["match"],
                    "page": c["page"],
                    "snippet": c["snippet"],
                }
                for c in clist
            ]
        vals_fmt = ", ".join(f"{v} {unit}" for v in sorted(all_vals, key=lambda x: float(x)))
        sev = "high" if unit in {"percent", "psi", "degf", "days"} and len(all_vals) <= 6 else "medium"
        findings.append(
            {
                "id": f"num-{topic}-{unit}",
                "severity": sev,
                "kind": "numeric_conflict",
                "topic": topic,
                "title": f"Numeric mismatch on {topic.replace('_',' ')} ({unit}): {vals_fmt}",
                "summary": (
                    f"Different publications state different {unit} values in "
                    f"{topic.replace('_', ' ')} contexts. Confirm which figure "
                    f"governs by work type / document hierarchy."
                ),
                "values_by_doc": {d: sorted(vs, key=float) for d, vs in by_doc.items()},
                "docs": docs_payload,
            }
        )
    return findings


def find_duty_conflicts(claims: list[dict]) -> list[dict]:
    """Multi-actor duty clusters → regions of interest (NOT asserted contradictions)."""
    by_topic: dict[str, list] = defaultdict(list)
    for c in claims:
        for topic in c["topics"]:
            if topic == "general":
                continue
            by_topic[topic].append(c)

    findings = []
    for topic, items in by_topic.items():
        pairs_by_doc: dict[str, set] = defaultdict(set)
        examples: dict[str, list] = defaultdict(list)
        for c in items:
            pairs_by_doc[c["doc"]].add((c["actor"], c["modal"]))
            if len(examples[c["doc"]]) < 2:
                examples[c["doc"]].append(c)
        if len(pairs_by_doc) < 2:
            continue

        docs_with_contractor_shall = {
            d for d, pairs in pairs_by_doc.items()
            if ("contractor", "shall") in pairs or ("contractor", "must") in pairs
        }
        docs_with_dept_will = {
            d for d, pairs in pairs_by_doc.items()
            if ("department", "will") in pairs or ("engineer", "will") in pairs
        }
        if topic not in {"qc_qa_responsibility", "acceptance_rejection", "sampling_frequency"}:
            continue
        if not (docs_with_contractor_shall and docs_with_dept_will):
            continue

        docs_payload = {
            d: [{"match": c["match"], "page": c["page"], "snippet": c["snippet"]} for c in cl]
            for d, cl in examples.items()
        }
        findings.append(
            {
                "id": f"roi-duty-{topic}",
                "severity": "info",
                "kind": "region_of_interest",
                "topic": topic,
                "title": (
                    f"Region of interest: dual actors on {topic.replace('_', ' ')} "
                    "(not an asserted contradiction)"
                ),
                "summary": (
                    "Contractor shall… and Department/engineer will… both appear here. "
                    "Often a complementary role split. Use as a pointer — then absence-scan "
                    "for QC/QA tiebreaker, Department test response time, and work-continuation "
                    "while awaiting tests."
                ),
                "docs": docs_payload,
            }
        )
    return findings


def find_glossary_vs_specs(docs: dict[str, dict]) -> list[dict]:
    """Pull defined terms from glossary and Specs 101.3; flag terms present in both with dissimilar text."""
    gloss = docs.get("mat_glossary", {}).get("text", "")
    specs = docs.get("standard_specs_2026", {}).get("text", "")
    if not gloss or not specs:
        return []

    def definitions(text: str) -> dict[str, str]:
        defs = {}
        for m in re.finditer(
            r"(?m)^(?P<term>[A-Z][A-Za-z0-9 /\-()]{2,60})\.\s+(?P<body>.{20,400})",
            text,
        ):
            term = re.sub(r"\s+", " ", m.group("term")).strip().lower()
            if term.startswith("section ") or term.startswith("table "):
                continue
            defs[term] = re.sub(r"\s+", " ", m.group("body"))[:400]
        return defs

    gdefs = definitions(gloss)
    idx = specs.lower().find("101.3 definitions")
    chunk = specs[idx : idx + 50000] if idx >= 0 else specs[:80000]
    sdefs = definitions(chunk)

    shared = set(gdefs) & set(sdefs)
    findings = []
    for term in sorted(shared)[:80]:
        g = gdefs[term].lower()
        s = sdefs[term].lower()
        gt = set(re.findall(r"[a-z]{4,}", g))
        st = set(re.findall(r"[a-z]{4,}", s))
        if not gt or not st:
            continue
        overlap = len(gt & st) / max(1, len(gt | st))
        if overlap >= 0.35:
            continue
        findings.append(
            {
                "id": f"def-{re.sub(r'[^a-z0-9]+', '-', term)[:40]}",
                "severity": "medium",
                "kind": "definition_mismatch",
                "topic": "definitions",
                "title": f"Definition may disagree for “{term}” (glossary vs Specs)",
                "summary": (
                    "Materials glossary and Standard Specs both define this term but "
                    "the wording diverges. Confirm which definition controls on projects."
                ),
                "docs": {
                    "mat_glossary": [{"match": term, "page": None, "snippet": gdefs[term]}],
                    "standard_specs_2026": [{"match": term, "page": None, "snippet": sdefs[term]}],
                },
            }
        )
        if len(findings) >= 25:
            break
    return findings


def find_phrase_oppositions(docs: dict[str, dict]) -> list[dict]:
    """Phrase co-occurrence neighborhoods → regions of interest (not contradictions)."""
    pairs = [
        (
            "required_vs_optional",
            r"\b(?:is\s+required|shall\s+be\s+required|must\s+be\s+provided)\b",
            r"\b(?:optional|not\s+required|at\s+the\s+contractor.?s\s+option|may\s+be\s+omitted)\b",
            "Region of interest: required-language near optional-language",
            False,
        ),
        (
            "approved_equal_vs_no_sub",
            r"\bor\s+equal\b|\bapproved\s+equal\b",
            r"\bno\s+substitut|\bdo\s+not\s+substitute|\bsole\s+source\b",
            "Region of interest: or-equal language near no-substitute / sole-source cues",
            False,
        ),
        (
            "department_test_vs_contractor_test",
            r"\bdepartment\s+will\s+(?:test|sample|perform)\b|\bengineer\s+will\s+(?:test|sample)\b",
            r"\bcontractor\s+shall\s+(?:test|sample|perform\s+.*test)",
            "Region of interest: dual testing actors (usually complementary — not a contradiction)",
            True,
        ),
        (
            "stop_work_vs_continue",
            r"\bstop\s+work\b|\bsuspend\s+(?:work|operations)\b|\bdo\s+not\s+proceed\b",
            r"\bcontinue\s+work\b|\bwork\s+may\s+proceed\b|\bdo\s+not\s+delay\b",
            "Region of interest: stop/suspend cues near continue/do-not-delay cues",
            False,
        ),
        (
            "weather_pay_vs_no_pay",
            r"\bweather\b.{0,60}\b(?:time\s+extension|additional\s+compensation|excusable)\b",
            r"\bweather\b.{0,60}\b(?:no\s+additional\s+compensation|non-?excusable|at\s+the\s+contractor.?s\s+expense)\b",
            "Region of interest: weather treated as excusable near contractor-risk cues",
            False,
        ),
    ]
    findings = []
    for pid, pat_a, pat_b, title, complementary_default in pairs:
        docs_a = {}
        docs_b = {}
        for doc_id, doc in docs.items():
            text = doc.get("text") or ""
            if not text:
                continue
            for pat, bucket in ((pat_a, docs_a), (pat_b, docs_b)):
                hits = []
                for m in re.finditer(pat, text, re.I | re.S):
                    local = text[max(0, m.start() - 30) : m.end() + 30]
                    if "....." in local:
                        continue
                    a = max(0, m.start() - 150)
                    b = min(len(text), m.end() + 150)
                    hits.append(
                        {
                            "match": m.group(0)[:80],
                            "page": page_at(text, m.start()),
                            "snippet": re.sub(r"\s+", " ", text[a:b])[:420],
                        }
                    )
                    if len(hits) >= 3:
                        break
                if hits:
                    bucket[doc_id] = hits
        if not docs_a or not docs_b:
            continue
        only_a = set(docs_a) - set(docs_b)
        only_b = set(docs_b) - set(docs_a)
        summary = (
            "Two cue families appear in the corpus. "
            "This is a review neighborhood, not an asserted contradiction. "
        )
        if complementary_default:
            summary += (
                "Default reading: complementary roles (who tests what). "
                "Next step: absence-scan for tiebreaker, response time, work-continuation. "
            )
        else:
            summary += "Skim snippets; escalate only if the same work item is pulled both ways. "
        if only_a or only_b:
            summary += (
                f"A-leaning docs: {', '.join(sorted(only_a)[:5]) or '—'}. "
                f"B-leaning docs: {', '.join(sorted(only_b)[:5]) or '—'}."
            )
        findings.append(
            {
                "id": f"roi-opp-{pid}",
                "severity": "info",
                "kind": "region_of_interest",
                "topic": pid,
                "title": title,
                "summary": summary,
                "docs": {
                    **{f"{d} [A]": h for d, h in docs_a.items()},
                    **{f"{d} [B]": h for d, h in docs_b.items()},
                },
            }
        )
    return findings



def load_corpus() -> dict[str, dict]:
    if not CORPUS["standard_specs_2026"].exists() and ALT_SPECS.exists():
        CORPUS["standard_specs_2026"] = ALT_SPECS
    docs = {}
    for doc_id, path in CORPUS.items():
        print(f"extract {doc_id} …")
        text = pdf_text(path)
        docs[doc_id] = {"id": doc_id, "path": str(path), "name": path.name, "chars": len(text), "text": text}
        print(f"  {path.name}: {len(text):,} chars")
    return docs


def analyze(docs: dict[str, dict]) -> list[dict]:
    numeric: list[dict] = []
    duties: list[dict] = []
    for doc_id, doc in docs.items():
        if not doc["text"]:
            continue
        print(f"mine {doc_id} …")
        numeric.extend(extract_numeric_claims(doc_id, doc["text"]))
        duties.extend(extract_duty_claims(doc_id, doc["text"]))
    print(f"numeric claims: {len(numeric)}  duty claims: {len(duties)}")

    findings: list[dict] = []
    findings.extend(find_numeric_conflicts(numeric))
    findings.extend(find_duty_conflicts(duties))
    findings.extend(find_glossary_vs_specs(docs))
    findings.extend(find_phrase_oppositions(docs))

    # Keep a few seeded high-value structural gaps (not the only findings)
    sp = docs.get("standard_specs_2026", {}).get("text", "")
    b1 = docs.get("mat_table_b1", {}).get("text", "")
    pb = docs.get("mat_part_b", {}).get("text", "")
    if sp and b1 and re.search(r"T\s*-?\s*89", b1, re.I) and re.search(r"Materials\s+Manual", sp, re.I):
        findings.append(
            {
                "id": "struct-specs-defer-b1-specific",
                "severity": "high",
                "kind": "cross_doc_gap",
                "topic": "sampling_frequency",
                "title": "Specs defer to Materials Manual; Table B-1 carries specific lab methods/rates",
                "summary": (
                    "Structural gap: contract Specs often point to the Materials Manual "
                    "while Table B-1 states concrete methods and frequencies. Easy to "
                    "staff from Specs alone and miss lab load."
                ),
                "docs": {
                    "standard_specs_2026": _snips(sp, [r"Materials\s+Manual", r"maximum\s+density"], 3),
                    "mat_table_b1": _snips(b1, [r"T\s*-?\s*89", r"1\s*/\s*\d+"], 3),
                },
            }
        )
    if pb and re.search(r"increase\s+the\s+sampling\s+rates", pb, re.I):
        findings.append(
            {
                "id": "struct-increase-sampling",
                "severity": "high",
                "kind": "ambiguous_authority",
                "topic": "sampling_frequency",
                "title": "Part B allows increasing sampling rates without a Specs capacity backstop",
                "summary": (
                    "Authority to raise rates exists in Materials Manual Part B; Specs do "
                    "not clearly tie that to pausing work when lab/field capacity is short."
                ),
                "docs": {
                    "mat_part_b": _snips(pb, [r"increase\s+the\s+sampling\s+rates?"], 2),
                    "standard_specs_2026": _snips(sp, [r"Materials\s+Manual"], 2),
                },
            }
        )

    rank = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (rank.get(f["severity"], 9), f["kind"], f["id"]))
    return findings


def _snips(text: str, pats: list[str], limit: int) -> list[dict]:
    out = []
    for pat in pats:
        for m in re.finditer(pat, text, re.I):
            if "....." in text[max(0, m.start() - 20) : m.end() + 20]:
                continue
            a, b = max(0, m.start() - 150), min(len(text), m.end() + 150)
            out.append(
                {
                    "match": m.group(0)[:80],
                    "page": page_at(text, m.start()),
                    "snippet": re.sub(r"\s+", " ", text[a:b])[:420],
                }
            )
            if len(out) >= limit:
                return out
    return out


def render_html(findings: list[dict], docs_meta: list[dict]) -> str:
    # Focus HTML on high/medium; include low count in stats
    focus = [f for f in findings if f["severity"] in ("high", "medium")]
    rois = [f for f in findings if f.get("kind") == "region_of_interest"]
    cards = []
    for f in focus:
        doc_blocks = []
        for doc_id, hits in (f.get("docs") or {}).items():
            items = "".join(
                f"<li><small>p.{h.get('page') or '?'} · <code>{html.escape(str(h.get('match') or ''))}</code></small><br>"
                f"{html.escape(h.get('snippet') or '')}</li>"
                for h in (hits or [])[:4]
            )
            extra = ""
            if f.get("values_by_doc") and doc_id in f["values_by_doc"]:
                extra = f"<div><em>values: {html.escape(str(f['values_by_doc'][doc_id]))}</em></div>"
            doc_blocks.append(
                f"<div class='doc'><h3>{html.escape(doc_id)}</h3>{extra}<ul>{items}</ul></div>"
            )
        cards.append(
            f"<article class='finding {html.escape(f['severity'])}'>"
            f"<div class='meta'><span class='sev'>{html.escape(f['severity'])}</span> "
            f"<span class='kind'>{html.escape(f['kind'])}</span> "
            f"<span class='kind'>{html.escape(f.get('topic',''))}</span></div>"
            f"<h2>{html.escape(f['title'])}</h2>"
            f"<p>{html.escape(f['summary'])}</p>"
            f"<div class='docs'>{''.join(doc_blocks)}</div></article>"
        )

    high = sum(1 for f in findings if f["severity"] == "high")
    med = sum(1 for f in findings if f["severity"] == "medium")
    low = sum(1 for f in findings if f["severity"] == "low")
    info = sum(1 for f in findings if f["severity"] == "info")
    by_kind = defaultdict(int)
    by_topic = defaultdict(int)
    for f in findings:
        by_kind[f["kind"]] += 1
        by_topic[f.get("topic", "")] += 1
    kind_li = "".join(f"<li>{html.escape(k)}: {v}</li>" for k, v in sorted(by_kind.items(), key=lambda x: -x[1]))
    topic_li = "".join(
        f"<li>{html.escape(k)}: {v}</li>" for k, v in sorted(by_topic.items(), key=lambda x: -x[1])[:20]
    )
    doc_list = "".join(
        f"<li><code>{html.escape(d['id'])}</code> — {html.escape(d['name'])} ({d['chars']:,} chars)</li>"
        for d in docs_meta
    )
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>DelDOT cross-publication discovery</title>
<style>
:root {{ --ink:#1a2332; --muted:#5a6a7a; --bg:#f2f5f3; --panel:#fff; --accent:#0b6e4f;
  --high:#9b2226; --med:#bc6c25; --low:#3d5a80; --line:#d5ddd8; }}
body {{ margin:0; font-family:"Source Sans 3","Segoe UI",sans-serif; color:var(--ink);
  background: radial-gradient(1000px 500px at 0% 0%, #dceee6, transparent 50%), var(--bg); }}
header, main, footer {{ max-width:1100px; margin:0 auto; padding:1.5rem; }}
h1 {{ font-family:"IBM Plex Serif", Georgia, serif; }}
.brand {{ color:var(--accent); text-transform:uppercase; letter-spacing:.04em; font-size:.8rem; font-weight:700; }}
.sub {{ color:var(--muted); max-width:44rem; }}
.stats {{ display:flex; gap:1rem; flex-wrap:wrap; }}
.stat {{ background:var(--panel); border:1px solid var(--line); padding:.8rem 1rem; }}
.stat b {{ display:block; font-size:1.5rem; color:var(--accent); }}
.columns {{ display:grid; grid-template-columns:1fr 1fr; gap:1rem; }}
.finding {{ background:var(--panel); border:1px solid var(--line); padding:1rem 1.2rem; margin:1rem 0; }}
.finding.high {{ border-left:4px solid var(--high); }}
.finding.medium {{ border-left:4px solid var(--med); }}
.sev {{ font-weight:700; text-transform:uppercase; font-size:.75rem; }}
.high .sev {{ color:var(--high); }} .medium .sev {{ color:var(--med); }}
.kind {{ color:var(--muted); font-size:.78rem; margin-left:.45rem; }}
.docs {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:.8rem; }}
.doc {{ background:#f7faf8; padding:.6rem .8rem; border:1px solid var(--line); font-size:.86rem; color:var(--muted); }}
.doc h3 {{ margin:0 0 .35rem; font-size:.82rem; }}
code {{ background:#eef3f0; padding:0 .25rem; }}
</style></head><body>
<header>
  <div class="brand">DelDOT · Cross-publication discovery</div>
  <h1>Inconsistencies beyond a single theme</h1>
  <p class="sub">Automated sweep for numeric mismatches and definition drift.
  Dual-actor / phrase neighborhoods are labeled <em>regions of interest</em>
  (not contradictions). For missing closing clauses, use absence_scan.py.</p>
  <div class="stats">
    <div class="stat"><b>{high}</b> high</div>
    <div class="stat"><b>{med}</b> medium</div>
    <div class="stat"><b>{low}</b> low</div>
    <div class="stat"><b>{info}</b> ROI / info</div>
    <div class="stat"><b>{len(findings)}</b> total</div>
  </div>
  <div class="columns">
    <div><p><strong>By kind</strong></p><ul>{kind_li}</ul></div>
    <div><p><strong>By topic</strong></p><ul>{topic_li}</ul></div>
  </div>
  <p><strong>Corpus</strong></p><ul>{doc_list}</ul>
</header>
<main>
  <p class="sub">Showing high/medium findings ({len(focus)}). ROI items are in JSON
  (severity=info) — use absence_findings.html for missing closing clauses.</p>
  {''.join(cards)}
</main>
<footer>Generated {html.escape(datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC'))}</footer>
</body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, default=REPORT_DIR)
    args = parser.parse_args()
    docs = load_corpus()
    findings = analyze(docs)
    meta = [{"id": d["id"], "name": d["name"], "chars": d["chars"], "path": d["path"]} for d in docs.values()]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "corpus": meta,
        "finding_count": len(findings),
        "by_severity": {s: sum(1 for f in findings if f["severity"] == s) for s in ("high", "medium", "low")},
        "by_kind": {k: sum(1 for f in findings if f["kind"] == k) for k in sorted({f["kind"] for f in findings})},
        "by_topic": {k: sum(1 for f in findings if f.get("topic") == k) for k in sorted({f.get("topic") for f in findings})},
        "findings": findings,
    }
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "cross_pub_conflicts.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    (args.out_dir / "cross_pub_conflicts.html").write_text(render_html(findings, meta), encoding="utf-8")
    print(f"Findings: {payload['finding_count']} {payload['by_severity']}")
    print(f"By kind: {payload['by_kind']}")
    print("High/medium titles:")
    for f in findings:
        if f["severity"] in ("high", "medium"):
            print(f"  [{f['severity']}/{f['kind']}] {f['title'][:100]}")


if __name__ == "__main__":
    main()

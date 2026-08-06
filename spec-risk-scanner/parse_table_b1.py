#!/usr/bin/env python3
"""Parse DelDOT M&R Table B-1 (minimum testing frequencies / quantities list).

Primary RT 301 lesson: Table B-1 requires liquid/plastic limits (AASHTO T89/T90)
at per-quantity rates the lab could not sustain — Tutor Perini exploited that.
Also flags companion full-T99 packages as related capacity load.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from pypdf import PdfReader

DATA_DIR = Path(__file__).resolve().parent / "data"
MAT_DIR = DATA_DIR / "mat_research"
DEFAULT_PDF = MAT_DIR / "5-part_b_b-2-min_test_cert-quantities_list.pdf"

# Screening lab effort (hours per sample event) — not a time study.
HOURS_LL_PL = 2.5  # T89 + T90 Atterberg pair (RT 301 bottleneck)
HOURS_T88 = 1.0  # particle-size when bundled
HOURS_FULL_T99 = 5.0
HOURS_ONE_POINT = 0.75
HOURS_FIELD_DENSITY = 0.5  # T310

SCENARIOS = {
    "medium_earthwork_50k_cy": {"yd3": 50_000, "label": "50,000 yd³ embankment/borrow"},
    "large_earthwork_200k_cy": {
        "yd3": 200_000,
        "label": "200,000 yd³ embankment/borrow (RT-301-scale)",
    },
}

T99_RE = re.compile(r"\bT\s*-?\s*99(?:M)?\b", re.I)
T272_RE = re.compile(r"\bT\s*-?\s*272\b", re.I)
T88_RE = re.compile(r"\bT\s*-?\s*88\b", re.I)
T89_RE = re.compile(r"\bT\s*-?\s*89\b", re.I)
T90_RE = re.compile(r"\bT\s*-?\s*90\b", re.I)
T310_RE = re.compile(r"\bT\s*-?\s*310\b", re.I)
ONE_POINT_RE = re.compile(r"one[-\s]?point|family\s+of\s+curves", re.I)


def extract_text(pdf: Path) -> str:
    reader = PdfReader(str(pdf))
    parts = []
    for i, page in enumerate(reader.pages):
        parts.append(f"\n===== PAGE {i+1} =====\n")
        parts.append(page.extract_text() or "")
    return "".join(parts)


def normalize(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return text


def parse_frequency(freq: str) -> dict:
    freq = re.sub(r"\s+", " ", freq).strip()
    m = re.search(r"1\s*/\s*(\d+)", freq)
    if m:
        return {"kind": "per_unit", "every": int(m.group(1)), "raw": freq}
    if re.search(r"source\s*/\s*contract", freq, re.I):
        return {"kind": "per_source_contract", "every": None, "raw": freq}
    return {"kind": "other", "every": None, "raw": freq}


def parse_rows(text: str) -> list[dict]:
    """Parse Table B-1 lines that include Atterberg and/or T99 procedures."""
    text = normalize(text)
    rows: list[dict] = []

    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if "MINIMUM TESTING FREQUENCY" in line.upper():
            continue
        has_atterberg = bool(T89_RE.search(line) or T90_RE.search(line))
        has_t99 = bool(T99_RE.search(line))
        if not has_atterberg and not has_t99:
            continue

        item_m = re.match(r"^(\d{6})\s+(.*)$", line)
        item = item_m.group(1) if item_m else None
        rest = item_m.group(2) if item_m else line

        unit_m = re.search(r"\b(yd3\s*\(m3\)|yd2\s*\(m2\)|Ton\s*\(t\)|ft\s*\(m\))\b", rest, re.I)
        freq_m = re.search(
            r"(1\s*/\s*\d+(?:\s*\(\s*1\s*/\s*\d+\s*\))?|minimum\s+1\s*/\s*Source\s*/\s*Contract)",
            rest,
            re.I,
        )
        if not freq_m:
            continue

        desc = rest[: freq_m.start()].strip()
        if unit_m and unit_m.start() < freq_m.start():
            desc = rest[: unit_m.start()].strip()
            unit = unit_m.group(1)
        else:
            unit = unit_m.group(1) if unit_m else None

        tests = rest[freq_m.end() :].strip()
        if not tests:
            continue

        has_t272 = bool(T272_RE.search(line))
        has_one_point = bool(ONE_POINT_RE.search(line))
        freq = parse_frequency(freq_m.group(1))

        rows.append(
            {
                "item": item,
                "description": re.sub(r"\s+", " ", desc).strip(" -,"),
                "unit": unit,
                "frequency": freq,
                "tests": re.sub(r"\s+", " ", tests).strip(),
                "requires_t89": bool(T89_RE.search(line)),
                "requires_t90": bool(T90_RE.search(line)),
                "requires_atterberg": has_atterberg,
                "requires_t88": bool(T88_RE.search(line)),
                "requires_t99": has_t99,
                "requires_t310": bool(T310_RE.search(line)),
                "allows_t272_or_one_point": has_t272 or has_one_point,
                "full_t99_without_one_point_alt": has_t99 and not (has_t272 or has_one_point),
                "source_line": line[:400],
            }
        )

    seen = set()
    uniq = []
    for r in rows:
        key = (r["item"], r["description"][:60].lower(), r["frequency"]["raw"], r["tests"][:80])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(r)
    return uniq


def capacity_for_row(row: dict, quantity: float) -> dict | None:
    freq = row["frequency"]
    if freq["kind"] != "per_unit" or not freq["every"]:
        return None
    every = freq["every"]
    n = max(1, int((quantity + every - 1) // every))

    atterberg_hours = n * HOURS_LL_PL if row["requires_atterberg"] else 0.0
    if row["requires_t88"]:
        atterberg_hours += n * HOURS_T88

    if row["full_t99_without_one_point_alt"]:
        proctor_hours = n * HOURS_FULL_T99
        proctor_mode = "full_t99"
    elif row["requires_t99"] and row["allows_t272_or_one_point"]:
        proctor_hours = n * HOURS_ONE_POINT
        proctor_mode = "one_point_allowed"
    else:
        proctor_hours = 0.0
        proctor_mode = "none"

    field_hours = n * HOURS_FIELD_DENSITY if row.get("requires_t310") else 0.0
    return {
        "samples": n,
        "every": every,
        "quantity": quantity,
        "proctor_mode": proctor_mode,
        "est_atterberg_lab_hours": round(atterberg_hours, 1),
        "est_proctor_lab_hours": round(proctor_hours, 1),
        "est_field_density_hours": round(field_hours, 1),
        "est_total_lab_hours": round(atterberg_hours + proctor_hours, 1),
    }


def build_findings(rows: list[dict]) -> list[dict]:
    findings = []
    for idx, r in enumerate(rows):
        freq = r["frequency"]
        scenarios = {}
        for key, sc in SCENARIOS.items():
            cap = capacity_for_row(r, sc["yd3"])
            if cap:
                scenarios[key] = {**cap, "label": sc["label"]}

        item_key = r.get("item") or r["description"][:40]

        # Primary: Atterberg (LL/PL) at frequency — the actual RT 301 failure
        if r["requires_atterberg"] and freq.get("kind") == "per_unit":
            note = (
                "Table B-1 requires liquid/plastic limits (AASHTO T89/T90) at this "
                "frequency. RT 301 lesson: the lab could not sustain Atterberg "
                "throughput; Tutor Perini later exploited missed LL/PL testing."
            )
            if freq.get("every") and freq["every"] <= 500:
                note += f" Aggressive rate: 1 per {freq['every']} {r.get('unit') or 'units'}."
            findings.append(
                {
                    "id": f"table-b1-atterberg-{idx}-{item_key}-{freq.get('raw')}",
                    "rule_id": "atterberg_at_frequency",
                    "category": "testing_capacity_risk",
                    "severity": "high",
                    "note": note,
                    "match": "T89/T90 at Table B-1 frequency",
                    "page": None,
                    "section_id": r.get("item"),
                    "section_header": r.get("description"),
                    "snippet": r["source_line"],
                    "item": r.get("item"),
                    "frequency": freq,
                    "tests": r["tests"],
                    "capacity_scenarios": scenarios,
                    "source": "Table B-1 quantities list",
                }
            )

        # Secondary: full T99 without one-point — related package load
        if r["full_t99_without_one_point_alt"]:
            findings.append(
                {
                    "id": f"table-b1-t99-{idx}-{item_key}-{freq.get('raw')}",
                    "rule_id": "full_t99_no_one_point",
                    "category": "testing_capacity_risk",
                    "severity": "medium",
                    "note": (
                        "Same Table B-1 row also lists full AASHTO T99 without T272/"
                        "one-point alt — adds Proctor lab load on top of Atterbergs. "
                        "Related capacity risk; RT 301’s exploited miss was LL/PL."
                    ),
                    "match": "T99 without T272/one-point",
                    "page": None,
                    "section_id": r.get("item"),
                    "section_header": r.get("description"),
                    "snippet": r["source_line"],
                    "item": r.get("item"),
                    "frequency": freq,
                    "tests": r["tests"],
                    "capacity_scenarios": scenarios,
                    "source": "Table B-1 quantities list",
                }
            )
    return findings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--out", type=Path, default=DATA_DIR / "table_b1_parsed.json")
    parser.add_argument(
        "--findings-out",
        type=Path,
        default=Path(__file__).resolve().parent / "reports" / "table_b1_t99_findings.json",
    )
    args = parser.parse_args()

    if not args.pdf.exists():
        raise SystemExit(
            f"Missing {args.pdf}. Run: python download_specs.py --only table_b1_quantities"
        )

    text = extract_text(args.pdf)
    rows = parse_rows(text)
    findings = build_findings(rows)

    summary = {
        "rows_parsed": len(rows),
        "rows_with_atterberg": sum(1 for r in rows if r["requires_atterberg"]),
        "rows_with_t99": sum(1 for r in rows if r["requires_t99"]),
        "full_t99_without_alt": sum(1 for r in rows if r["full_t99_without_one_point_alt"]),
        "atterberg_findings": sum(1 for f in findings if f["rule_id"] == "atterberg_at_frequency"),
        "t99_findings": sum(1 for f in findings if f["rule_id"] == "full_t99_no_one_point"),
    }

    payload = {
        "source": args.pdf.name,
        "summary": summary,
        "rows": rows,
        "findings": findings,
        "assumptions": {
            "hours_ll_pl": HOURS_LL_PL,
            "hours_t88": HOURS_T88,
            "hours_full_t99": HOURS_FULL_T99,
            "note": (
                "Hour estimates are screening defaults. RT 301 exploited miss was "
                "liquid/plastic limits (T89/T90), not Proctor."
            ),
        },
        "lesson": "docs/lesson-rt301-atterberg-testing-capacity.md",
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    args.findings_out.parent.mkdir(parents=True, exist_ok=True)
    args.findings_out.write_text(
        json.dumps({"summary": summary, "findings": findings}, indent=2), encoding="utf-8"
    )

    print(f"Rows: {summary['rows_parsed']}")
    print(f"With Atterberg (T89/T90): {summary['rows_with_atterberg']}")
    print(f"Atterberg frequency findings: {summary['atterberg_findings']}")
    print(f"Full T99 without one-point alt: {summary['full_t99_without_alt']}")
    print(f"Wrote {args.out}")
    print(f"Wrote {args.findings_out}")
    print("\nEarthwork/borrow Atterberg highlights:")
    for f in findings:
        if f["rule_id"] != "atterberg_at_frequency":
            continue
        if not f.get("item") or not (
            f["item"].startswith("202")
            or f["item"].startswith("209")
            or f["item"].startswith("212")
            or f["item"].startswith("301")
        ):
            continue
        sc = f.get("capacity_scenarios", {}).get("large_earthwork_200k_cy")
        extra = ""
        if sc:
            extra = (
                f" | 200k yd³ → ~{sc['samples']} LL/PL sets ≈ "
                f"{sc['est_atterberg_lab_hours']} Atterberg lab-hrs"
            )
        print(f"  {f.get('item')} {f.get('section_header')[:45]} @ {f['frequency']['raw']}{extra}")


if __name__ == "__main__":
    main()

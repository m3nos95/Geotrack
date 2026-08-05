#!/usr/bin/env python3
"""Parse DelDOT M&R Table B-1 (minimum testing frequencies / quantities list).

Flags pay items that require full AASHTO T99 without an alternate one-point /
family-of-curves method (T272) — the RT 301 / Tutor Perini failure mode.
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

# Rough lab effort assumptions for capacity screening (hours per sample set).
# Full multi-point T99 Method C is far heavier than a one-point / T272 check.
HOURS_FULL_T99 = 5.0
HOURS_ONE_POINT = 0.75
HOURS_ATTERBERG_SET = 2.0  # T88/T89/T90 bundle rough
HOURS_FIELD_DENSITY = 0.5  # T310 nuclear per location rough

# Example project sizes for "what if we had to honor Table B-1 literally"
SCENARIOS = {
    "medium_earthwork_50k_cy": {"yd3": 50_000, "label": "50,000 yd³ embankment/borrow"},
    "large_earthwork_200k_cy": {"yd3": 200_000, "label": "200,000 yd³ embankment/borrow (RT-301-scale)"},
}

ROW_RE = re.compile(
    r"(?P<item>\d{6})?\s*"
    r"(?P<desc>[A-Za-z][A-Za-z0-9 ,/\-\(\)]{3,80}?)\s+"
    r"(?P<unit>yd3\s*\(m3\)|yd2\s*\(m2\)|Ton\s*\(t\)|ft\s*\(m\))\s+"
    r"(?P<freq>1\s*/\s*\d+(?:\s*\(\s*1\s*/\s*\d+\s*\))?|minimum\s+1\s*/\s*Source\s*/\s*Contract)\s+"
    r"(?P<tests>.+?)(?=(?:\d{6})|$)",
    re.I | re.S,
)

T99_RE = re.compile(r"\bT\s*-?\s*99(?:M)?\b", re.I)
T272_RE = re.compile(r"\bT\s*-?\s*272\b", re.I)
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
    """Heuristic row parse focused on earthwork/borrow/base density items."""
    text = normalize(text)
    rows: list[dict] = []

    # Line-oriented pass: many rows survive extraction as single long lines
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if "T99" not in line.upper() and "T 99" not in line.upper():
            # Also catch split "T99"
            if not re.search(r"T\s*99", line, re.I):
                continue
        if "MINIMUM TESTING FREQUENCY" in line.upper():
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
        # Prefer tests portion after frequency; if empty, whole rest after desc
        if not tests:
            continue

        has_t99 = bool(T99_RE.search(line))
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
                "requires_t99": has_t99,
                "allows_t272_or_one_point": has_t272 or has_one_point,
                "full_t99_without_one_point_alt": has_t99 and not (has_t272 or has_one_point),
                "source_line": line[:400],
            }
        )

    # Deduplicate near-identical descriptions+freq+tests
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
    # Conservative: if T99 listed, assume full curve unless T272 alt present
    if row["full_t99_without_one_point_alt"]:
        lab_hours = n * (HOURS_FULL_T99 + HOURS_ATTERBERG_SET)
        mode = "full_t99"
    elif row["requires_t99"] and row["allows_t272_or_one_point"]:
        lab_hours = n * (HOURS_ONE_POINT + HOURS_ATTERBERG_SET)
        mode = "one_point_allowed"
    else:
        return None
    field_hours = n * HOURS_FIELD_DENSITY if re.search(r"T\s*-?\s*310", row["tests"], re.I) else 0
    return {
        "samples": n,
        "mode": mode,
        "est_lab_hours": round(lab_hours, 1),
        "est_field_density_hours": round(field_hours, 1),
        "quantity": quantity,
        "every": every,
    }


def build_findings(rows: list[dict]) -> list[dict]:
    findings = []
    for idx, r in enumerate(rows):
        if not r["full_t99_without_one_point_alt"]:
            continue
        freq = r["frequency"]
        sev = "high"
        note = (
            "Table B-1 lists full AASHTO T99 without T272 / one-point alternative. "
            "On high-volume earthwork this can exceed field/lab capacity "
            "(RT 301 lesson: Tutor Perini exploited missed testing frequencies)."
        )
        # Tighter frequencies are worse
        if freq.get("every") and freq["every"] <= 500:
            sev = "high"
            note += f" Frequency is aggressive: 1 per {freq['every']} {r.get('unit') or 'units'}."
        elif freq.get("every") and freq["every"] <= 1000:
            sev = "high"

        scenarios = {}
        for key, sc in SCENARIOS.items():
            cap = capacity_for_row(r, sc["yd3"])
            if cap:
                scenarios[key] = {**cap, "label": sc["label"]}

        item_key = r.get("item") or r["description"][:40]
        findings.append(
            {
                "id": f"table-b1-t99-{idx}-{item_key}-{freq.get('raw')}",
                "rule_id": "full_t99_no_one_point",
                "category": "testing_capacity_risk",
                "severity": sev,
                "note": note,
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
    parser.add_argument(
        "--out",
        type=Path,
        default=DATA_DIR / "table_b1_parsed.json",
    )
    parser.add_argument(
        "--findings-out",
        type=Path,
        default=Path(__file__).resolve().parent / "reports" / "table_b1_t99_findings.json",
    )
    args = parser.parse_args()

    if not args.pdf.exists():
        raise SystemExit(f"Missing {args.pdf}. Run: python download_specs.py --only table_b1_quantities")

    text = extract_text(args.pdf)
    rows = parse_rows(text)
    findings = build_findings(rows)

    summary = {
        "rows_with_t99": sum(1 for r in rows if r["requires_t99"]),
        "full_t99_without_alt": sum(1 for r in rows if r["full_t99_without_one_point_alt"]),
        "t99_with_t272_alt": sum(
            1 for r in rows if r["requires_t99"] and r["allows_t272_or_one_point"]
        ),
    }

    payload = {
        "source": args.pdf.name,
        "summary": summary,
        "rows": rows,
        "findings": findings,
        "assumptions": {
            "hours_full_t99": HOURS_FULL_T99,
            "hours_one_point": HOURS_ONE_POINT,
            "hours_atterberg_set": HOURS_ATTERBERG_SET,
            "note": "Hour estimates are screening defaults for capacity review, not time studies.",
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    args.findings_out.parent.mkdir(parents=True, exist_ok=True)
    args.findings_out.write_text(
        json.dumps({"summary": summary, "findings": findings}, indent=2), encoding="utf-8"
    )

    print(f"Parsed T99-related rows: {summary['rows_with_t99']}")
    print(f"Full T99 without T272/one-point alt: {summary['full_t99_without_alt']}")
    print(f"T99 with T272 alt present: {summary['t99_with_t272_alt']}")
    print(f"Wrote {args.out}")
    print(f"Wrote {args.findings_out}")
    # Show worst earthwork examples
    earth = [
        f
        for f in findings
        if f.get("item")
        and (
            f["item"].startswith("202")
            or f["item"].startswith("209")
            or f["item"].startswith("212")
            or f["item"].startswith("301")
        )
    ]
    print("\nEarthwork/borrow highlights:")
    for f in earth[:12]:
        sc = f.get("capacity_scenarios", {}).get("large_earthwork_200k_cy")
        extra = ""
        if sc:
            extra = f" | 200k yd³ → ~{sc['samples']} full T99s ≈ {sc['est_lab_hours']} lab-hrs"
        print(f"  {f.get('item')} {f.get('section_header')[:50]} @ {f['frequency']['raw']}{extra}")


if __name__ == "__main__":
    main()

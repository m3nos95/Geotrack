#!/usr/bin/env python3
"""Build spec-year item catalogs + awarded-contract snapshot from DelDOT PDFs.

  python3 sos/build-spec-year-lists.py \
    --awarded Awarded_Contract_List.pdf \
    --items-15 2016_standard_items.pdf \
    --items-20 standardItemsSpecProvList.pdf \
    --items-25 Standard_Items_May11_2026.pdf
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT_JSON = ROOT / "lists" / "spec-year-catalog-snapshot.json"
OUT_JS = ROOT / "spec-year-data.js"

ITEM_RE = re.compile(
    r"^(?P<desc>.+?)(?P<yr>15|20|25)\s+(?P<uom>\S+)\s+(?P<obs>[YN])(?P<num>\d{6})\s*$"
)
SKIP_LINE = re.compile(
    r"^(State of Delaware|Department of Transportation|Item List|Spec Year|"
    r"AASHTOWare|Delaware Department|DescriptionSpec|Description\s*Spec|"
    r"Page \d+|DATE PRINTED|"
    r"\d{2}/\d{2}/\d{4})",
    re.I,
)
CHAPTER_PREFIX = re.compile(
    r"^(EARTHWORK|BASES|PAVEMENTS|STRUCTURES|INCIDENTALS|ROADSIDE(?: DEVELOPMENT)?|"
    r"TRAFFIC|LIGHTING|UTILITIES)\s+",
    re.I,
)
SECTION_HEAD = re.compile(r"^\d{4}\s*-\s*[A-Z][A-Z0-9 /&-]{2,}$")
SECTION_PREFIX = re.compile(r"^\d{4}\s*-\s*[\d.\s-]+-\s*")
SPEC_TAIL = re.compile(
    r"(?P<spec>2001|2016(?:\s+\d{1,2}/\d{1,2}/\d{2,4})?|"
    r"20(?:20|21|22|24|25|26)\s+(?:January|June|August))\s*$",
    re.I,
)
FAP_HEAD = re.compile(
    r"^(?P<fap>[A-Z]{2,8}-[A-Z0-9()/,]+)(?:\s+(?P<dist>NCC|KC|SC|S\d|N\d|C\d))?\s+",
    re.I,
)


def pdf_text(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def squeeze(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def clean_desc(desc: str) -> str:
    d = squeeze(desc)
    d = SECTION_PREFIX.sub("", d)
    d = CHAPTER_PREFIX.sub("", d)
    return squeeze(d).upper()


def parse_item_list(text: str, expect_year: str) -> dict:
    items: dict[str, str] = {}
    obsolete: list[str] = []
    as_of = ""
    aashto = expect_year
    m_yr = re.search(r"Spec Year\(s\):\s*(\d{2})", text)
    if m_yr:
        aashto = m_yr.group(1)
    m_date = re.search(r"(\d{2}/\d{2}/\d{4})\s+\d", text)
    if m_date:
        as_of = m_date.group(1)
    buf = ""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or SKIP_LINE.match(line):
            continue
        if SECTION_HEAD.match(line):
            continue
        line = SECTION_PREFIX.sub("", line).strip()
        if not line:
            continue
        buf = squeeze((buf + " " + line) if buf else line)
        m = ITEM_RE.match(buf)
        if not m:
            m2 = re.search(
                r"^(.*)(15|20|25)\s+(\S+)\s+([YN])(\d{6})$", buf
            )
            if m2:
                desc, yr, uom, obs, num = m2.groups()
            else:
                if len(buf) > 500:
                    buf = ""
                continue
        else:
            desc, yr, uom, obs, num = (
                m.group("desc"),
                m.group("yr"),
                m.group("uom"),
                m.group("obs"),
                m.group("num"),
            )
            _ = uom
        if yr != expect_year and yr != aashto:
            buf = ""
            continue
        items[num] = clean_desc(desc)
        if obs == "Y":
            obsolete.append(num)
        buf = ""
    return {
        "aashto": int(aashto),
        "asOf": as_of,
        "count": len(items),
        "items": items,
        "obsolete": obsolete,
    }


def catalog_year_for_awarded(spec_year: str) -> int | None:
    m = re.match(r"(\d{4})", spec_year or "")
    if not m:
        return None
    y = int(m.group(1))
    if y <= 2001:
        return None
    if y <= 2016:
        return 15
    if y <= 2022:
        return 20
    return 25


def parse_awarded(text: str) -> dict:
    as_of = ""
    m_print = re.search(r"DATE PRINTED:\s*(\d{1,2}/\d{1,2}/\d{4})", text, re.I)
    if m_print:
        as_of = m_print.group(1)
    body = re.sub(r"DATE PRINTED:.*?Spec Year", " ", text, flags=re.S | re.I)
    body = re.sub(
        r"Contract # FAP #: Description ContractorDemo workSpec Year", " ", body
    )
    body = re.sub(r"--\s*\d+\s+of\s+\d+\s*--", " ", body)
    contracts = {}
    for part in re.split(r"(?=T\d{9})", body):
        m = re.match(r"(T\d{9})\s*(.*)", part.strip(), re.S)
        if not m:
            continue
        num = m.group(1).upper()
        rest = squeeze(m.group(2))
        spec = ""
        sm = SPEC_TAIL.search(rest)
        if sm:
            spec = squeeze(sm.group("spec"))
            rest = rest[: sm.start()].strip()
        fap = ""
        dist = ""
        fm = FAP_HEAD.match(rest)
        if fm:
            fap = fm.group("fap")
            dist = fm.group("dist") or ""
            rest = rest[fm.end() :].strip()
        rec = {
            "fap": fap,
            "title": rest,
            "specYear": spec,
            "catalogYear": catalog_year_for_awarded(spec),
        }
        if dist:
            rec["districtCode"] = dist
        contracts[num] = rec
    return {"asOf": as_of, "count": len(contracts), "contracts": contracts}


YEAR_META = {
    "15": {
        "label": "2016 Standard Specs",
        "awardedYears": [2016],
    },
    "20": {
        "label": "2020 Standard Specs",
        "awardedYears": [2020, 2021, 2022],
    },
    "25": {
        "label": "2025 Standard Specs",
        "awardedYears": [2024, 2025, 2026],
    },
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--awarded", required=True)
    ap.add_argument("--items-15", required=True)
    ap.add_argument("--items-20", required=True)
    ap.add_argument("--items-25", required=True)
    args = ap.parse_args()

    years = {}
    for code, path in (
        ("15", args.items_15),
        ("20", args.items_20),
        ("25", args.items_25),
    ):
        text = pdf_text(Path(path))
        parsed = parse_item_list(text, code)
        meta = YEAR_META[code]
        years[code] = {
            "label": meta["label"],
            "aashto": parsed["aashto"],
            "asOf": parsed["asOf"],
            "awardedYears": meta["awardedYears"],
            "file": Path(path).name,
            "items": parsed["items"],
            "obsolete": parsed["obsolete"],
        }
        print(
            f"spec year {code}: {parsed['count']} items, {len(parsed['obsolete'])} obsolete, asOf {parsed['asOf']}",
            file=sys.stderr,
        )

    awarded_text = pdf_text(Path(args.awarded))
    awarded = parse_awarded(awarded_text)
    awarded["file"] = Path(args.awarded).name
    print(
        f"awarded: {awarded['count']} contracts, {sum(1 for c in awarded['contracts'].values() if c.get('specYear'))} with spec year, asOf {awarded['asOf']}",
        file=sys.stderr,
    )

    payload = {
        "kind": "spec-year-catalog",
        "awarded": awarded,
        "years": years,
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    js = (
        "/* Generated by sos/build-spec-year-lists.py — DelDOT spec-year item catalogs + awarded contracts. */\n"
        "(function (root, factory) {\n"
        "  if (typeof module === 'object' && module.exports) module.exports = factory();\n"
        "  else root.SOSSpecYearData = factory();\n"
        "})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n"
        "  return "
        + json.dumps(payload, separators=(",", ":"))
        + ";\n"
        "});\n"
    )
    OUT_JS.write_text(js, encoding="utf-8")
    print(f"wrote {OUT_JSON} ({OUT_JSON.stat().st_size} bytes)", file=sys.stderr)
    print(f"wrote {OUT_JS} ({OUT_JS.stat().st_size} bytes)", file=sys.stderr)
    kirk = awarded["contracts"].get("T202506101")
    print("T202506101", kirk, file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

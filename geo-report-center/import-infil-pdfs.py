#!/usr/bin/env python3
"""
Import DelDOT Materials & Research Borehole Infiltration Test PDFs
into refs/infil_anchors.json for DelDOT GeoTrak.

Typical form title:
  STATE OF DELAWARE / MATERIALS AND RESEARCH / BOREHOLE INFILTRATION TEST

Extracts per page:
  Measured Rate (in/hr), Easting/Northing (DE State Plane US ft),
  Test ID, depth from surface, pipe diameter, contract, date, project.

Usage:
  python import-infil-pdfs.py "./infil-pdfs" --project .
  python import-infil-pdfs.py "./sheet.pdf" --project . --merge

Requires: Python 3.8+, pypdf, pyproj
  pip install pypdf pyproj
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    print("Missing pypdf. Run:  pip install pypdf", file=sys.stderr)
    sys.exit(1)

try:
    from pyproj import CRS, Transformer
except ImportError:
    print("Missing pyproj. Run:  pip install pyproj", file=sys.stderr)
    sys.exit(1)

_DE_SPFT = CRS.from_proj4(
    "+proj=tmerc +lat_0=38 +lon_0=-75.41666666666667 +k=0.999995 "
    "+x_0=200000.0001016002 +y_0=0 +ellps=GRS80 +towgs84=0,0,0 +units=us-ft +no_defs"
)
_TO_WGS84 = Transformer.from_crs(_DE_SPFT, "EPSG:4326", always_xy=True)

DNREC_BOREHOLE_FOS = 2.5


def sp_to_ll(e: float, n: float) -> tuple[float, float]:
    lon, lat = _TO_WGS84.transform(e, n)
    return round(lat, 7), round(lon, 7)


def _num(s: str | None) -> float | None:
    if s is None:
        return None
    m = re.search(r"[-+]?\d+(?:\.\d+)?", str(s).replace(",", ""))
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


def _norm_date(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip()
    for fmt in ("%m/%d/%Y", "%m-%d-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return s


def parse_page_text(text: str, source_file: str, page_index: int) -> dict | None:
    """Parse one DelDOT borehole infil spreadsheet page."""
    if not text or "INFILTRATION" not in text.upper():
        return None

    tid = None
    m = re.search(r"Infiltration\s+Test\s+ID\s*#?\s*:?\s*([A-Za-z0-9\-_/]+)", text, re.I)
    if m:
        tid = m.group(1).strip().rstrip(":")

    measured = None
    m = re.search(r"Measured\s+Rate\s*([0-9]+(?:\.[0-9]+)?)", text, re.I)
    if m:
        measured = float(m.group(1))

    easting = None
    m = re.search(r"Easting\s*:?\s*([0-9]+(?:\.[0-9]+)?)", text, re.I)
    if m:
        easting = float(m.group(1))

    northing = None
    m = re.search(r"Northing\s*:?\s*([0-9]+(?:\.[0-9]+)?)", text, re.I)
    if m:
        northing = float(m.group(1))
    if northing is None and easting is not None:
        # Form often leaves Northing unlabeled on its own line; DE SP N is typically 5e4–2.2e5
        cands = [
            float(x)
            for x in re.findall(r"\b([0-9]{5,6}(?:\.[0-9]+)?)\b", text)
            if 40000 <= float(x) <= 250000
        ]
        # Prefer values near Coastal Plain / Piedmont working range, not the easting
        cands = [c for c in cands if abs(c - easting) > 500]
        if cands:
            # Heuristic: northing often appears once as a standalone high-precision value
            northing = max(cands, key=lambda c: (len(f"{c}"), c))

    depth = None
    m = re.search(
        r"(?:from\s+the\s+)?Surface\s+Elev\s*:?\s*([0-9]+(?:\.[0-9]+)?)\s*'?",
        text,
        re.I,
    )
    if m:
        depth = float(m.group(1))

    pipe = None
    m = re.search(r"Pipe\s+Diameter\s*([0-9]+(?:\.[0-9]+)?)\s*inch", text, re.I)
    if m:
        pipe = float(m.group(1))

    job = None
    m = re.search(r"State\s+Contract\s*#\s*:?\s*([A-Za-z0-9\-]+)", text, re.I)
    if m:
        job = m.group(1).strip()

    project = None
    m = re.search(r"Project\s+Name\s*:?\s*(.+)", text, re.I)
    if m:
        project = re.sub(r"\s+", " ", m.group(1)).strip()
        project = re.split(r"\s+State\s+Contract", project, maxsplit=1)[0].strip()

    date = None
    m = re.search(r"\b(\d{1,2}/\d{1,2}/\d{4})\b", text)
    if m:
        date = _norm_date(m.group(1))

    contractor = None
    m = re.search(r"Contractor\s*:?\s*([^\n]+)", text, re.I)
    # Often layout-scrambled; look for known firm line near date instead
    for firm in ("Hillis-Carnes", "Hillis Carnes", "JMT", "Rummel", "AECOM", "WRA"):
        if firm.lower() in text.lower():
            contractor = firm
            break

    reviewer = None
    m = re.search(r"Review(?:ed)?\s*BY\s*:?\s*([A-Za-z .,\-']+)", text, re.I)
    if m:
        reviewer = m.group(1).strip()
    else:
        m = re.search(r"\b([A-Z]\.\s*[A-Z][a-z]+)\b", text)
        if m and "Holden" in text:
            reviewer = m.group(1)

    if measured is None or easting is None or northing is None:
        return None

    lat, lon = sp_to_ll(easting, northing)
    method = "cased_borehole"
    if pipe and pipe >= 12:
        method = "ring_or_large_casing"
    fos = DNREC_BOREHOLE_FOS if method == "cased_borehole" else 1.0
    design = round(measured / fos, 4) if fos else measured

    return {
        "id": tid or f"page-{page_index + 1}",
        "job": job,
        "project": project,
        "date": date,
        "easting": easting,
        "northing": northing,
        "lat": lat,
        "lon": lon,
        "depth_ft": depth,
        "pipe_in": pipe,
        "method": method,
        "measured_inhr": measured,
        "design_inhr": design,
        "fos": fos,
        "contractor": contractor,
        "reviewer": reviewer,
        "source_file": source_file,
        "source_page": page_index + 1,
        "form": "DelDOT M&R Borehole Infiltration Test",
    }


def parse_pdf(path: Path) -> list[dict]:
    reader = PdfReader(str(path))
    out: list[dict] = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        rec = parse_page_text(text, path.name, i)
        if rec:
            out.append(rec)
        else:
            # Soft warn only when page looks like the form but failed
            if "BOREHOLE INFILTRATION" in text.upper() or "Measured Rate" in text:
                print(f"  WARN: could not parse {path.name} page {i + 1}", file=sys.stderr)
    return out


def anchor_key(a: dict) -> str:
    return "|".join(
        [
            str(a.get("job") or ""),
            str(a.get("id") or ""),
            f"{a.get('easting')}",
            f"{a.get('northing')}",
            f"{a.get('measured_inhr')}",
        ]
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Import DelDOT borehole infil PDFs → infil_anchors.json")
    ap.add_argument("input", help="PDF file or folder of PDFs")
    ap.add_argument("--project", default=".", help="Project folder (contains refs/)")
    ap.add_argument("--merge", action="store_true", help="Merge with existing infil_anchors.json")
    ap.add_argument("-o", "--output", default=None, help="Output JSON path (default refs/infil_anchors.json)")
    args = ap.parse_args()

    src = Path(args.input).expanduser().resolve()
    if not src.exists():
        print(f"Not found: {src}", file=sys.stderr)
        return 1

    pdfs: list[Path] = []
    if src.is_file():
        if src.suffix.lower() != ".pdf":
            print("Input file must be a .pdf", file=sys.stderr)
            return 1
        pdfs = [src]
    else:
        pdfs = sorted(src.rglob("*.pdf")) + sorted(src.rglob("*.PDF"))
        # de-dupe case-insensitive
        seen = set()
        uniq = []
        for p in pdfs:
            k = str(p).lower()
            if k in seen:
                continue
            seen.add(k)
            uniq.append(p)
        pdfs = uniq

    if not pdfs:
        print(f"No PDFs under {src}", file=sys.stderr)
        return 1

    # Windows bat quirk: trailing \" in --project "C:\path\" can glue args together.
    proj_raw = str(args.project).strip().strip('"').rstrip("\\/")
    root = Path(proj_raw).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"Project folder not found: {root}", file=sys.stderr)
        print("Tip: run from the GeoTrak folder, or pass --project with no trailing backslash.", file=sys.stderr)
        return 1
    refs = root / "refs"
    try:
        refs.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        print(f"Could not create refs/ under {root}: {e}", file=sys.stderr)
        return 1
    out_path = Path(args.output).expanduser().resolve() if args.output else refs / "infil_anchors.json"

    anchors: list[dict] = []
    for pdf in pdfs:
        print(f"Parsing {pdf.name} …", flush=True)
        got = parse_pdf(pdf)
        print(f"  → {len(got)} test(s)")
        anchors.extend(got)

    if not anchors:
        print("No infiltration tests parsed.", file=sys.stderr)
        return 2

    if args.merge and out_path.exists():
        try:
            prev = json.loads(out_path.read_text(encoding="utf-8"))
            old = prev.get("anchors") if isinstance(prev, dict) else prev
            if isinstance(old, list):
                by = {anchor_key(a): a for a in old if isinstance(a, dict)}
                for a in anchors:
                    by[anchor_key(a)] = a
                anchors = list(by.values())
                print(f"Merged → {len(anchors)} total anchors")
        except Exception as e:
            print(f"WARN: could not merge existing file ({e}); overwriting", file=sys.stderr)

    anchors.sort(key=lambda a: (str(a.get("job") or ""), str(a.get("id") or ""), a.get("easting") or 0))

    payload = {
        "type": "deldot_infil_anchors",
        "version": 1,
        "source": "DelDOT M&R Borehole Infiltration Test PDFs",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fos_default": DNREC_BOREHOLE_FOS,
        "n": len(anchors),
        "anchors": anchors,
    }
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {out_path} ({len(anchors)} anchors)")
    for a in anchors[:5]:
        print(
            f"  {a.get('id')}  {a.get('measured_inhr')} in/hr  "
            f"E{a.get('easting')} N{a.get('northing')}  → {a.get('lat')}, {a.get('lon')}"
        )
    if len(anchors) > 5:
        print(f"  … +{len(anchors) - 5} more")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

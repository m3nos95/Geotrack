#!/usr/bin/env python3
"""Download DelDOT Standard Specs and Materials & Research manuals used by the scanner."""

from __future__ import annotations

import argparse
import urllib.error
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
MAT_DIR = DATA_DIR / "mat_research"

SOURCES = {
    "standard_specs_2026": {
        "url": (
            "https://engineeringsupport.deldot.gov/images/b/b1/"
            "2026_DelDOT_Standard_Specifications.pdf"
        ),
        "out": DATA_DIR / "2026_DelDOT_Standard_Specifications.pdf",
    },
    "part_b": {
        "url": (
            "https://deldot.gov/Publications/manuals/mat_research/pdfs/"
            "4b_min_test_and_cert_req.pdf"
        ),
        "out": MAT_DIR / "4b_min_test_and_cert_req.pdf",
        "index": "https://deldot.gov/Publications/manuals/mat_research/index.shtml",
    },
    "table_b1_quantities": {
        "url": (
            "https://deldot.gov/Publications/manuals/mat_research/pdfs/"
            "5-part_b_b-2-min_test_cert-quantities_list.pdf"
        ),
        "archive_url": (
            "https://web.archive.org/web/20250702041622/"
            "https://deldot.gov/Publications/manuals/mat_research/pdfs/"
            "5-part_b_b-2-min_test_cert-quantities_list.pdf"
        ),
        "out": MAT_DIR / "5-part_b_b-2-min_test_cert-quantities_list.pdf",
    },
    "c200_earthwork": {
        "url": "https://deldot.gov/Publications/manuals/mat_research/pdfs/part_c/c200.pdf",
        "out": MAT_DIR / "c200.pdf",
    },
    "c300_bases": {
        "url": "https://deldot.gov/Publications/manuals/mat_research/pdfs/part_c/c300.pdf",
        "out": MAT_DIR / "c300.pdf",
    },
}


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "DelDOT-SpecRiskScanner/0.2 (internal review tool)"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as out:
        out.write(resp.read())
    # Reject HTML error pages masquerading as downloads
    head = dest.read_bytes()[:8]
    if not head.startswith(b"%PDF"):
        dest.unlink(missing_ok=True)
        raise urllib.error.URLError(f"Not a PDF from {url}")
    return dest


def download_with_fallback(meta: dict) -> Path:
    try:
        return download(meta["url"], meta["out"])
    except Exception as first:
        if "archive_url" in meta:
            print(f"  live failed ({first}); trying archive…")
            return download(meta["archive_url"], meta["out"])
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only",
        nargs="*",
        choices=sorted(SOURCES),
        help="Download only these keys (default: all)",
    )
    args = parser.parse_args()
    keys = args.only or list(SOURCES)
    for key in keys:
        meta = SOURCES[key]
        print(f"{key}: {meta['url']}")
        path = download_with_fallback(meta)
        print(f"  → {path} ({path.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

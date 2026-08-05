#!/usr/bin/env python3
"""Download the DelDOT Standard Specifications PDF."""

from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

DEFAULT_URL = (
    "https://engineeringsupport.deldot.gov/images/b/b1/"
    "2026_DelDOT_Standard_Specifications.pdf"
)
DATA_DIR = Path(__file__).resolve().parent / "data"


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "DelDOT-SpecRiskScanner/0.1 (internal review tool)"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as out:
        out.write(resp.read())
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument(
        "--out",
        type=Path,
        default=DATA_DIR / "2026_DelDOT_Standard_Specifications.pdf",
    )
    args = parser.parse_args()
    path = download(args.url, args.out)
    print(f"Downloaded {path.stat().st_size:,} bytes → {path}")


if __name__ == "__main__":
    main()

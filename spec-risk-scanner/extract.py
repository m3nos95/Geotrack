#!/usr/bin/env python3
"""Extract text from DelDOT Standard Specs PDF and split into sections."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from pypdf import PdfReader

DATA_DIR = Path(__file__).resolve().parent / "data"

# Matches lines like "101.3 Definitions." or "SECTION 105 — ..." or "DIVISION 100 — ..."
SECTION_HEADER_RE = re.compile(
    r"(?m)^(?P<header>"
    r"(?:DIVISION\s+\d+\s*[—\-–].*)|"
    r"(?:SECTION\s+\d+\s*[—\-–].*)|"
    r"(?:\d{3}(?:\.\d+){1,3}\s+[A-Z0-9].*)"
    r")$"
)
PAGE_MARK_RE = re.compile(r"\n===== PAGE (\d+) =====\n")


def extract_pages(pdf_path: Path) -> list[dict]:
    reader = PdfReader(str(pdf_path))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append({"page": i + 1, "text": text})
    return pages


def pages_to_full_text(pages: list[dict]) -> str:
    parts = []
    for p in pages:
        parts.append(f"\n\n===== PAGE {p['page']} =====\n\n{p['text']}")
    return "".join(parts)


def page_at_offset(full_text: str, offset: int) -> int:
    page = 1
    for m in PAGE_MARK_RE.finditer(full_text):
        if m.start() > offset:
            break
        page = int(m.group(1))
    return page


def parse_sections(full_text: str) -> list[dict]:
    """Split full document text into numbered / titled sections."""
    matches = list(SECTION_HEADER_RE.finditer(full_text))
    sections: list[dict] = []

    # Skip TOC-like dense header dumps early in the book by requiring
    # that the following body is not mostly dotted leaders.
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        body = full_text[m.end() : end]
        header = m.group("header").strip()
        # TOC lines usually contain long runs of dots
        if body.count(".") > 80 and "....." in body[:400]:
            continue
        if re.fullmatch(r".*\.{5,}.*", header):
            continue

        # Normalize id
        id_m = re.match(
            r"(?:DIVISION\s+(\d+)|SECTION\s+(\d+)|(\d{3}(?:\.\d+){0,3}))",
            header,
            re.I,
        )
        if id_m:
            sec_id = next(g for g in id_m.groups() if g)
            if id_m.group(1):
                sec_id = f"DIV{id_m.group(1)}"
            elif id_m.group(2):
                sec_id = f"SEC{id_m.group(2)}"
        else:
            sec_id = f"UNK-{i}"

        title = header
        # Clean trailing page numbers sometimes glued on
        title = re.sub(r"\s+\d+\s*$", "", title).strip()

        sections.append(
            {
                "id": sec_id,
                "header": title,
                "page_start": page_at_offset(full_text, start),
                "char_start": start,
                "char_end": end,
                "text": (header + "\n" + body).strip(),
            }
        )
    return sections


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--pdf",
        type=Path,
        default=DATA_DIR / "2026_DelDOT_Standard_Specifications.pdf",
    )
    parser.add_argument("--out-dir", type=Path, default=DATA_DIR)
    args = parser.parse_args()

    if not args.pdf.exists():
        raise SystemExit(f"PDF not found: {args.pdf}\nRun download_specs.py first.")

    pages = extract_pages(args.pdf)
    full = pages_to_full_text(pages)
    sections = parse_sections(full)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "standard_specs_2026.txt").write_text(full, encoding="utf-8")
    (args.out_dir / "pages.jsonl").write_text(
        "\n".join(json.dumps(p, ensure_ascii=False) for p in pages), encoding="utf-8"
    )
    (args.out_dir / "sections.jsonl").write_text(
        "\n".join(
            json.dumps(
                {
                    **{k: v for k, v in s.items() if k != "text"},
                    "text": s["text"][:20000],
                },
                ensure_ascii=False,
            )
            for s in sections
        ),
        encoding="utf-8",
    )
    # Also store a compact index without full body for UI/search
    index = [
        {
            "id": s["id"],
            "header": s["header"],
            "page_start": s["page_start"],
            "chars": len(s["text"]),
        }
        for s in sections
    ]
    (args.out_dir / "section_index.json").write_text(
        json.dumps(index, indent=2), encoding="utf-8"
    )

    print(f"Pages: {len(pages)}")
    print(f"Sections parsed: {len(sections)}")
    print(f"Wrote text + section index under {args.out_dir}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Bulk-download DelDOT public Publications PDFs into a local archive.

Reads catalog.json (live crawl + Wayback inventory). Tries the live URL first,
then Wayback if needed. Skips files already present with non-trivial size.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CATALOG = ROOT / "catalog.json"
OUT = ROOT / "files"
MANIFEST = ROOT / "download_manifest.jsonl"
UA = "DelDOT-PublicationsMirror/0.1 (internal archive; +https://github.com/m3nos95/Geotrack)"


def safe_path(url: str) -> Path:
    parsed = urllib.parse.urlparse(url)
    host = parsed.netloc.replace("www.", "")
    path = urllib.parse.unquote(parsed.path)
    path = path.lstrip("/")
    # collapse bad chars
    path = re.sub(r"[^\w\-./ ()\[\]]+", "_", path)
    if not path.lower().endswith(".pdf"):
        path = path.rstrip("/") + ".pdf"
    return OUT / host / path


def is_pdf(data: bytes) -> bool:
    return data[:5] == b"%PDF-"


def fetch_bytes(url: str, timeout: int = 120) -> bytes:
    # Quote path segments with spaces for live requests
    parsed = urllib.parse.urlsplit(url)
    path = urllib.parse.quote(parsed.path, safe="/:@")
    final = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ""))
    req = urllib.request.Request(final, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def archive_url(url: str, ts: str | None) -> str:
    # Prefer a recent known timestamp when available
    stamp = ts or "2025"
    # Wayback id_ mode needs a fully encoded original URL (spaces etc.)
    quoted = urllib.parse.quote(url, safe=":/?&=%#")
    return f"https://web.archive.org/web/{stamp}id_/{quoted}"


def resolve_mediawiki_file_url(url: str) -> str | None:
    """Turn /index.php/File:Foo.pdf into the direct /images/.../Foo.pdf link."""
    if "index.php/File:" not in url and "title=File:" not in url:
        return None
    try:
        html = fetch_bytes(url).decode("utf-8", "ignore")
    except Exception:
        return None
    m = re.search(r'href="(/images/[^"]+\.pdf)"', html, re.I)
    if not m:
        return None
    return urllib.parse.urljoin(url, m.group(1))


def download_one(item: dict, force: bool = False) -> dict:
    url = item["url"]
    # Prefer direct binary URL when given a MediaWiki File: page
    resolved = resolve_mediawiki_file_url(url)
    fetch_url = resolved or url
    dest = safe_path(fetch_url if resolved else url)
    result = {
        "url": url,
        "resolved_url": resolved,
        "path": str(dest.relative_to(ROOT)),
        "status": None,
        "bytes": 0,
        "via": None,
        "error": None,
    }
    if dest.exists() and dest.stat().st_size > 1000 and not force:
        result["status"] = "skipped_exists"
        result["bytes"] = dest.stat().st_size
        return result

    dest.parent.mkdir(parents=True, exist_ok=True)
    attempts = [("live", fetch_url)]
    attempts.append(("wayback", archive_url(fetch_url, item.get("archive_ts"))))
    if resolved and resolved != url:
        attempts.append(("wayback_original", archive_url(url, item.get("archive_ts"))))

    last_err = None
    for via, attempt_url in attempts:
        try:
            data = fetch_bytes(attempt_url)
            if not is_pdf(data):
                last_err = f"not PDF via {via} ({len(data)} bytes)"
                continue
            dest.write_bytes(data)
            result["status"] = "ok"
            result["bytes"] = len(data)
            result["via"] = via
            return result
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
            time.sleep(0.2)
            continue

    result["status"] = "failed"
    result["error"] = last_err
    return result


def load_catalog(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["items"] if isinstance(data, dict) else data


def prioritize(items: list[dict]) -> list[dict]:
    """Specs / materials / manuals first, then everything else."""

    def score(it: dict) -> tuple:
        u = it["url"].lower()
        if "mat_research" in u:
            return (0, u)
        if "standard_spec" in u or "engineeringsupport" in u:
            return (1, u)
        if "/manuals/" in u:
            return (2, u)
        if "/reports/" in u:
            return (3, u)
        return (4, u)

    return sorted(items, key=score)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=CATALOG)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--limit", type=int, default=0, help="0 = all")
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--only",
        default="",
        help="Substring filter on URL (e.g. mat_research)",
    )
    args = parser.parse_args()

    items = load_catalog(args.catalog)
    if args.only:
        items = [i for i in items if args.only.lower() in i["url"].lower()]
    items = prioritize(items)
    if args.limit:
        items = items[: args.limit]

    print(f"Downloading {len(items)} PDFs → {OUT} ({args.workers} workers)")
    ok = fail = skip = 0
    bytes_ok = 0
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    with open(MANIFEST, "a", encoding="utf-8") as mf, ThreadPoolExecutor(
        max_workers=args.workers
    ) as pool:
        futs = {pool.submit(download_one, it, args.force): it for it in items}
        done = 0
        for fut in as_completed(futs):
            done += 1
            r = fut.result()
            mf.write(json.dumps(r) + "\n")
            mf.flush()
            if r["status"] == "ok":
                ok += 1
                bytes_ok += r["bytes"]
            elif r["status"] == "skipped_exists":
                skip += 1
            else:
                fail += 1
            if done % 25 == 0 or done == len(items):
                print(
                    f"[{done}/{len(items)}] ok={ok} skip={skip} fail={fail} "
                    f"downloaded={bytes_ok/1e6:.1f} MB"
                )
                if r["status"] == "failed":
                    print(f"  fail: {r['url']} :: {r['error']}")

    print(f"Done. ok={ok} skip={skip} fail={fail} new_bytes={bytes_ok/1e6:.1f} MB")


if __name__ == "__main__":
    main()

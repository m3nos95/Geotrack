#!/usr/bin/env python3
"""
Download DGS lithologic boring-log PDFs linked from refs/dgir_wells.json.

Typical links are DelDOT M&R boring sheets on Google Cloud Storage (~3k+ files).
Use --parse to text-extract DelDOT-style logs into refs/dgir_lith_parsed.json.

Usage (from GeoTrak / Ultimate Geo Program folder):
  python download-dgir-lith-pdfs.py
  python download-dgir-lith-pdfs.py --limit 20          # smoke test
  python download-dgir-lith-pdfs.py --parse            # download + parse
  python download-dgir-lith-pdfs.py --parse-only         # parse existing PDFs

Requires: Python 3.8+  (pip install pypdf pyproj for --parse)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = "DelDOT-GeoTrak-dgir-lith/0.41 (+https://github.com/m3nos95/Geotrack)"
DEFAULT_WELLS = Path("refs/dgir_wells.json")
DEFAULT_PDF_DIR = Path("dgir-lith-pdfs")
DEFAULT_MANIFEST = Path("refs/dgir_lith_download_manifest.json")
DEFAULT_PARSED = Path("refs/dgir_lith_parsed.json")


def load_wells(path: Path) -> list[dict]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing {path} — run download-dgir-wells.bat first.")
    obj = json.loads(path.read_text(encoding="utf-8"))
    wells = obj.get("wells") if isinstance(obj, dict) else None
    if not isinstance(wells, list):
        raise ValueError(f"{path} is not a dgir_wells.json (expected wells[]).")
    return wells


def safe_filename(dgsid: str) -> str:
    s = re.sub(r"[^\w.\-]+", "_", str(dgsid).strip())
    return s or "unknown"


def fetch_pdf(url: str, dest: Path, retries: int = 4) -> tuple[int, str | None]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    last_err: str | None = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            if len(data) < 200 or not data.startswith(b"%PDF"):
                return 0, f"not a PDF ({len(data)} bytes)"
            tmp.write_bytes(data)
            tmp.replace(dest)
            return len(data), None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = str(e)
            time.sleep(1.5 * (i + 1))
    if tmp.exists():
        try:
            tmp.unlink()
        except OSError:
            pass
    return 0, last_err


def download_all(
    wells: list[dict],
    pdf_dir: Path,
    manifest_path: Path,
    *,
    limit: int | None,
    skip_existing: bool,
    delay_s: float,
) -> dict:
    manifest: dict = {}
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = {}

    targets = [w for w in wells if w.get("has_lith") and w.get("lith_pdf")]
    if limit is not None:
        targets = targets[: max(0, int(limit))]

    ok = skip = fail = 0
    total_bytes = 0
    t0 = time.time()

    for i, w in enumerate(targets, 1):
        wid = str(w.get("id") or "")
        url = str(w.get("lith_pdf") or "")
        fname = safe_filename(wid) + ".pdf"
        dest = pdf_dir / fname

        if skip_existing and dest.is_file() and dest.stat().st_size > 500:
            skip += 1
            manifest[wid] = {
                "id": wid,
                "url": url,
                "file": str(dest.as_posix()),
                "bytes": dest.stat().st_size,
                "status": "skipped_existing",
            }
            if i % 100 == 0 or i == len(targets):
                print(f"  [{i}/{len(targets)}] skip existing …", flush=True)
            continue

        nbytes, err = fetch_pdf(url, dest)
        if err:
            fail += 1
            manifest[wid] = {"id": wid, "url": url, "status": "error", "error": err}
            print(f"  FAIL {wid}: {err}", flush=True)
        else:
            ok += 1
            total_bytes += nbytes
            manifest[wid] = {
                "id": wid,
                "url": url,
                "file": str(dest.as_posix()),
                "bytes": nbytes,
                "status": "ok",
            }
            if i % 25 == 0 or i == len(targets):
                mb = total_bytes / (1024 * 1024)
                print(
                    f"  [{i}/{len(targets)}] downloaded {ok} ok, {skip} skip, {fail} fail · {mb:.1f} MB",
                    flush=True,
                )

        if delay_s > 0:
            time.sleep(delay_s)

        if i % 50 == 0:
            manifest_path.parent.mkdir(parents=True, exist_ok=True)
            manifest_path.write_text(
                json.dumps(
                    {
                        "updated": datetime.now(timezone.utc).isoformat(),
                        "pdf_dir": str(pdf_dir),
                        "entries": manifest,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

    elapsed = time.time() - t0
    summary = {
        "targets": len(targets),
        "downloaded": ok,
        "skipped": skip,
        "failed": fail,
        "bytes": total_bytes,
        "elapsed_s": round(elapsed, 1),
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(
            {
                "updated": datetime.now(timezone.utc).isoformat(),
                "pdf_dir": str(pdf_dir),
                "summary": summary,
                "entries": manifest,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return summary


# ---------- optional parse (DelDOT M&R boring sheet text) ----------

def _num(s: str | None) -> float | None:
    if not s:
        return None
    m = re.search(r"[-+]?\d+(?:\.\d+)?", str(s).replace(",", ""))
    return float(m.group(0)) if m else None


def parse_deldot_log_text(text: str, source_file: str, dgsid: str | None) -> dict | None:
    if not text or len(text.strip()) < 80:
        return None
    if "MATERIALS AND RESEARCH" not in text.upper() and "DEPARTMENT OF TRANSPORTATION" not in text.upper():
        return None

    boring_m = re.search(r"BORING\s+([A-Za-z0-9\-]+)", text, re.I)
    ne_m = re.search(
        r"Northing:\s*([\d.]+)\s*Easting:\s*([\d.]+)|Easting:\s*([\d.]+)\s*Northing:\s*([\d.]+)",
        text,
        re.I,
    )
    contract_m = re.search(r"State Contract #:\s*(\S+)", text, re.I)
    project_m = re.search(r"Project Name:\s*(.+?)(?:\n|Location:|State Contract)", text, re.I | re.S)
    loc_m = re.search(r"Location:\s*(.+?)(?:\n|Federal|State Contract|Station)", text, re.I | re.S)

    northing = easting = None
    if ne_m:
        if ne_m.group(1):
            northing, easting = _num(ne_m.group(1)), _num(ne_m.group(2))
        else:
            easting, northing = _num(ne_m.group(3)), _num(ne_m.group(4))

    lat = lon = None
    if northing is not None and easting is not None:
        try:
            from pyproj import CRS, Transformer

            sp = CRS.from_proj4(
                "+proj=tmerc +lat_0=38 +lon_0=-75.41666666666667 +k=0.999995 "
                "+x_0=200000.0001016002 +y_0=0 +ellps=GRS80 +towgs84=0,0,0 +units=us-ft +no_defs"
            )
            tr = Transformer.from_crs(sp, "EPSG:4326", always_xy=True)
            lon, lat = tr.transform(easting, northing)
            lat, lon = round(lat, 6), round(lon, 6)
        except Exception:
            pass

    intervals: list[dict] = []
    aashto_hits = re.findall(r"\b(A-\d(?:-\d)?(?:-\d)?(?:\([0-9]+\))?)\b", text)
    desc_blocks = re.split(r'\d+"\s*RECOVERY', text, flags=re.I)
    for block in desc_blocks:
        block = block.strip()
        if len(block) < 15 or "RECOVERY" in block[:20]:
            continue
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if not lines:
            continue
        desc = " ".join(lines[-3:]) if len(lines) > 3 else " ".join(lines)
        if len(desc) < 12:
            continue
        a_in = re.search(r"\b(A-\d(?:-\d)?(?:-\d)?(?:\([0-9]+\))?)\b", block)
        intervals.append(
            {
                "description": desc[:500],
                "aashto": a_in.group(1) if a_in else None,
            }
        )

    if not boring_m and not contract_m and not intervals and not aashto_hits:
        return None

    return {
        "dgsid": dgsid,
        "boring": boring_m.group(1) if boring_m else None,
        "contract": contract_m.group(1) if contract_m else None,
        "project": (project_m.group(1).strip() if project_m else None),
        "location": (loc_m.group(1).strip() if loc_m else None),
        "northing": northing,
        "easting": easting,
        "lat": lat,
        "lon": lon,
        "aashto_all": list(dict.fromkeys(aashto_hits))[:20],
        "intervals": intervals[:40],
        "source_pdf": source_file,
        "parse": "deldot_mnr_text_v1",
    }


def parse_pdfs(
    wells: list[dict],
    pdf_dir: Path,
    out_path: Path,
    *,
    limit: int | None,
) -> dict:
    try:
        from pypdf import PdfReader
    except ImportError:
        print("Missing pypdf. Run:  pip install pypdf", file=sys.stderr)
        raise SystemExit(1)

    by_id = {str(w.get("id")): w for w in wells if w.get("id")}
    pdfs = sorted(pdf_dir.glob("*.pdf"))
    if limit is not None:
        pdfs = pdfs[: max(0, int(limit))]

    logs: list[dict] = []
    scanned = 0
    for i, pdf in enumerate(pdfs, 1):
        dgsid = pdf.stem
        well = by_id.get(dgsid) or {}
        try:
            reader = PdfReader(str(pdf))
            text = "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception as e:
            print(f"  read fail {pdf.name}: {e}", flush=True)
            continue
        if len(text.strip()) < 50:
            scanned += 1
            continue
        rec = parse_deldot_log_text(text, pdf.name, dgsid)
        if rec:
            rec["lith_pdf"] = well.get("lith_pdf")
            rec["depth_ft"] = well.get("depth_ft")
            rec["drill_date"] = well.get("drill_date")
            logs.append(rec)
        if i % 100 == 0:
            print(f"  parsed {i}/{len(pdfs)} · {len(logs)} DelDOT logs …", flush=True)

    payload = {
        "type": "dgs_dgir_lith_parsed",
        "version": 1,
        "generated": datetime.now(timezone.utc).isoformat(),
        "pdf_dir": str(pdf_dir),
        "n_pdfs": len(pdfs),
        "n_parsed": len(logs),
        "n_likely_scanned_no_text": scanned,
        "note": (
            "Heuristic text parse of DelDOT M&R boring sheets linked from dgir_wells.json. "
            "Screening / archive only — not a substitute for db.json GEO imports or PE review."
        ),
        "logs": logs,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return {"n_pdfs": len(pdfs), "n_parsed": len(logs), "n_scanned": scanned, "out": str(out_path)}


def main() -> int:
    ap = argparse.ArgumentParser(description="Download / parse DGS lithologic boring PDFs")
    ap.add_argument("--wells", default=str(DEFAULT_WELLS), help="Input dgir_wells.json")
    ap.add_argument("--pdf-dir", default=str(DEFAULT_PDF_DIR), help="Folder for PDF files")
    ap.add_argument("--manifest", default=str(DEFAULT_MANIFEST), help="Download manifest JSON")
    ap.add_argument("--out", default=str(DEFAULT_PARSED), help="Parsed logs JSON (--parse)")
    ap.add_argument("--limit", type=int, default=None, help="Max wells/PDFs (testing)")
    ap.add_argument("--no-skip-existing", action="store_true", help="Re-download even if PDF exists")
    ap.add_argument("--delay", type=float, default=0.15, help="Seconds between downloads (default 0.15)")
    ap.add_argument("--parse", action="store_true", help="After download, parse PDFs to JSON")
    ap.add_argument("--parse-only", action="store_true", help="Skip download; parse PDFs only")
    ap.add_argument("--download-only", action="store_true", help="Download only (default)")
    args = ap.parse_args()

    wells_path = Path(args.wells)
    pdf_dir = Path(args.pdf_dir)
    wells = load_wells(wells_path)
    n_lith = sum(1 for w in wells if w.get("has_lith") and w.get("lith_pdf"))
    print(f"Loaded {len(wells)} wells from {wells_path.name} ({n_lith} with lith_pdf)", flush=True)

    if not args.parse_only:
        est_gb = n_lith * 0.6 / 1024  # ~600 KB avg rough
        print(
            f"Downloading lith PDFs → {pdf_dir}/  (~{n_lith} files, expect ~{est_gb:.1f} GB, resume-safe)",
            flush=True,
        )
        summary = download_all(
            wells,
            pdf_dir,
            Path(args.manifest),
            limit=args.limit,
            skip_existing=not args.no_skip_existing,
            delay_s=max(0.0, float(args.delay)),
        )
        print(
            f"Download done: {summary['downloaded']} new, {summary['skipped']} skipped, "
            f"{summary['failed']} failed · {summary['bytes']/(1024*1024):.1f} MB in {summary['elapsed_s']}s",
            flush=True,
        )
        print(f"Manifest: {args.manifest}", flush=True)
        if summary["failed"] and not summary["downloaded"]:
            return 1

    if args.parse or args.parse_only:
        print(f"Parsing PDFs in {pdf_dir} …", flush=True)
        ps = parse_pdfs(wells, pdf_dir, Path(args.out), limit=args.limit)
        print(
            f"Wrote {ps['out']} — {ps['n_parsed']} DelDOT-style logs from {ps['n_pdfs']} PDFs "
            f"({ps['n_scanned']} likely scanned/no text)",
            flush=True,
        )

    if not args.parse and not args.parse_only:
        print("Tip: re-run with --parse to build refs/dgir_lith_parsed.json", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

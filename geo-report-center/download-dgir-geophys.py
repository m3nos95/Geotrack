#!/usr/bin/env python3
"""
Download DGS geophysical CSVs linked from refs/dgir_wells.json and build
refs/dgir_geophys_zones.json — coarse / mixed / fine zones for screening.

Most DGS CSVs are gamma-only; some include induction (COND/RES). Classification
uses gamma first, then resistivity when present. Screening only — not lithology
or DNREC design rates.

Usage (from GeoTrak / Ultimate Geo Program folder):
  python download-dgir-geophys.py
  python download-dgir-geophys.py --limit 25          # smoke test
  python download-dgir-geophys.py --zones-only        # reuse downloaded CSVs
  python download-dgir-geophys.py --download-only

Requires: Python 3.8+ (stdlib only)
"""
from __future__ import annotations

import argparse
import csv
import http.client
import io
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

UA = "DelDOT-GeoTrak-dgir-geophys/0.42 (+https://github.com/m3nos95/Geotrack)"
NULL = -999.25
DEFAULT_WELLS = Path("refs/dgir_wells.json")
DEFAULT_CSV_DIR = Path("dgir-geophys-csv")
DEFAULT_MANIFEST = Path("refs/dgir_geophys_download_manifest.json")
DEFAULT_ZONES = Path("refs/dgir_geophys_zones.json")

# Delaware Coastal Plain screening thresholds (gamma API-GR, resistivity ohm-m).
# Relative within-well percentiles backstop tool/calibration drift.
GAMMA_COARSE = 40.0
GAMMA_FINE = 70.0
RES_COARSE = 60.0
RES_FINE = 20.0
MIN_ZONE_FT = 2.0
SMOOTH_FT = 1.0
INFIL_WINDOWS = (10.0, 20.0, 30.0)


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


def _encode_url(url: str) -> str:
    """Percent-encode path so spaces / odd chars do not crash http.client."""
    parts = urllib.parse.urlsplit(url.strip())
    path = urllib.parse.quote(parts.path, safe="/:@!$&'()*+,;=-._~")
    query = urllib.parse.quote(parts.query, safe="=&%")
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, query, parts.fragment))


def candidate_urls(url: str) -> list[str]:
    """Build fetch candidates for messy DGS GCS links (spaces in well ids)."""
    raw = (url or "").strip()
    if not raw:
        return []
    out: list[str] = []
    # 1) as-published, properly encoded
    out.append(_encode_url(raw))
    # 2) strip all whitespace from path (Id32-56 /Id32-56 _GAM → Id32-56/Id32-56_GAM)
    parts = urllib.parse.urlsplit(raw)
    nospace_path = re.sub(r"\s+", "", parts.path)
    if nospace_path != parts.path:
        out.append(
            _encode_url(
                urllib.parse.urlunsplit(
                    (parts.scheme, parts.netloc, nospace_path, parts.query, parts.fragment)
                )
            )
        )
    # 3) collapse "Id32-56 /" → "Id32-56/" style typos
    fixed = re.sub(r"(\w)\s+/", r"\1/", raw)
    fixed = re.sub(r"/\s+", "/", fixed)
    fixed = re.sub(r"\s+_", "_", fixed)
    if fixed != raw:
        out.append(_encode_url(fixed))
    # de-dupe preserve order
    seen: set[str] = set()
    uniq: list[str] = []
    for u in out:
        if u and u not in seen:
            seen.add(u)
            uniq.append(u)
    return uniq


def fetch_bytes(url: str, retries: int = 4) -> tuple[bytes | None, str | None]:
    last_err: str | None = None
    for cand in candidate_urls(url):
        for i in range(retries):
            try:
                req = urllib.request.Request(cand, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=90) as resp:
                    data = resp.read()
                if len(data) < 20:
                    last_err = f"too small ({len(data)} bytes)"
                    break  # try next candidate
                return data, None
            except urllib.error.HTTPError as e:
                last_err = f"HTTP {e.code}"
                if e.code in (404, 403, 410):
                    break  # try next candidate
                time.sleep(1.2 * (i + 1))
            except (urllib.error.URLError, TimeoutError, OSError, ValueError, http.client.InvalidURL) as e:
                last_err = str(e)
                time.sleep(1.5 * (i + 1))
            except Exception as e:  # never crash the batch on one URL
                last_err = f"{type(e).__name__}: {e}"
                break
    return None, last_err or "fetch failed"


def download_all(
    wells: list[dict],
    csv_dir: Path,
    manifest_path: Path,
    *,
    limit: int | None,
    skip_existing: bool,
    delay_s: float,
) -> dict:
    manifest: dict = {}
    if manifest_path.is_file():
        try:
            prev = json.loads(manifest_path.read_text(encoding="utf-8"))
            if isinstance(prev.get("entries"), dict):
                manifest = prev["entries"]
        except json.JSONDecodeError:
            manifest = {}

    targets = [w for w in wells if w.get("geophys_csv") or w.get("geophys_las")]
    # Prefer CSV; still list wells that only have LAS (skip until we add LAS parser)
    targets = [w for w in targets if w.get("geophys_csv")]
    if limit is not None:
        targets = targets[: max(0, int(limit))]

    ok = skip = fail = 0
    total_bytes = 0
    t0 = time.time()
    csv_dir.mkdir(parents=True, exist_ok=True)

    for i, w in enumerate(targets, 1):
        wid = str(w.get("id") or "")
        url = str(w.get("geophys_csv") or "")
        dest = csv_dir / (safe_filename(wid) + ".csv")

        if skip_existing and dest.is_file() and dest.stat().st_size > 40:
            skip += 1
            manifest[wid] = {
                "id": wid,
                "url": url,
                "file": str(dest.as_posix()),
                "bytes": dest.stat().st_size,
                "status": "skipped_existing",
            }
            if i % 200 == 0 or i == len(targets):
                print(f"  [{i}/{len(targets)}] skip existing …", flush=True)
            continue

        try:
            data, err = fetch_bytes(url)
        except Exception as e:
            fail += 1
            manifest[wid] = {
                "id": wid,
                "url": url,
                "status": "error",
                "error": f"{type(e).__name__}: {e}",
            }
            print(f"  FAIL {wid}: {type(e).__name__}: {e}", flush=True)
            if delay_s > 0:
                time.sleep(delay_s)
            continue

        if err or data is None:
            fail += 1
            manifest[wid] = {"id": wid, "url": url, "status": "error", "error": err}
            if fail <= 20 or fail % 50 == 0:
                print(f"  FAIL {wid}: {err}", flush=True)
        else:
            # Basic sanity: should look like CSV with DEPT
            head = data[:200].decode("utf-8", "replace").upper()
            if "DEPT" not in head and "DEPTH" not in head:
                fail += 1
                manifest[wid] = {
                    "id": wid,
                    "url": url,
                    "status": "error",
                    "error": "not a DEPT CSV",
                }
                print(f"  FAIL {wid}: not a DEPT CSV", flush=True)
            else:
                dest.write_bytes(data)
                ok += 1
                total_bytes += len(data)
                manifest[wid] = {
                    "id": wid,
                    "url": url,
                    "file": str(dest.as_posix()),
                    "bytes": len(data),
                    "status": "ok",
                }
                if i % 50 == 0 or i == len(targets):
                    mb = total_bytes / (1024 * 1024)
                    print(
                        f"  [{i}/{len(targets)}] {ok} ok, {skip} skip, {fail} fail · {mb:.1f} MB",
                        flush=True,
                    )

        if delay_s > 0:
            time.sleep(delay_s)

        if i % 100 == 0:
            _write_manifest(manifest_path, csv_dir, manifest, None)

    summary = {
        "targets": len(targets),
        "downloaded": ok,
        "skipped": skip,
        "failed": fail,
        "bytes": total_bytes,
        "elapsed_s": round(time.time() - t0, 1),
    }
    _write_manifest(manifest_path, csv_dir, manifest, summary)
    return summary


def _write_manifest(path: Path, csv_dir: Path, entries: dict, summary: dict | None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updated": datetime.now(timezone.utc).isoformat(),
        "csv_dir": str(csv_dir),
        "entries": entries,
    }
    if summary is not None:
        payload["summary"] = summary
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _f(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    if x != x or x == NULL or abs(x - NULL) < 0.01:
        return None
    return x


def _norm_header(h: str) -> str:
    s = re.sub(r"[^A-Z0-9]+", "", (h or "").upper())
    return s


def _pick_col(fieldnames: list[str], *aliases: str) -> str | None:
    norms = {_norm_header(f): f for f in fieldnames if f}
    for a in aliases:
        if a in norms:
            return norms[a]
    return None


def _unique_headers(raw: list[str | None]) -> list[str]:
    """Make CSV headers unique so DictReader does not collapse duplicates."""
    seen: dict[str, int] = {}
    out: list[str] = []
    for h in raw:
        base = (h or "").strip() or "COL"
        n = seen.get(base, 0)
        seen[base] = n + 1
        out.append(base if n == 0 else f"{base}__{n}")
    return out


def read_curve_csv(path: Path) -> dict | None:
    """Return {dept, gamma, res, cond, columns} or None.

    Accepts gamma-only, resistivity-only, or combined induction CSVs.
    """
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    if text.startswith("\ufeff"):
        text = text[1:]
    # First line = header
    lines = text.splitlines()
    if not lines:
        return None
    raw_headers = next(csv.reader([lines[0]]))
    headers = _unique_headers(raw_headers)
    body = "\n".join(lines[1:])
    reader = csv.DictReader(io.StringIO(body), fieldnames=headers)
    dept_c = _pick_col(headers, "DEPT", "DEPTH", "DEPTHFT")
    gamma_c = _pick_col(headers, "GAMMA", "GR", "GAM", "APIGR")
    # Prefer bulk RES / single-point; fall back to 16N/64N aliases
    res_c = _pick_col(
        headers,
        "RES",
        "RESISTIVITY",
        "SINGLEPOINTRES",
        "RES16N",
        "RES64N",
        "LATERAL",
    )
    cond_c = _pick_col(headers, "COND", "APCOND", "CONDUCTIVITY")
    if not dept_c or (not gamma_c and not res_c):
        return None

    dept: list[float] = []
    gamma: list[float | None] = []
    res: list[float | None] = []
    cond: list[float | None] = []
    for row in reader:
        d = _f(row.get(dept_c))
        if d is None:
            continue
        dept.append(d)
        gamma.append(_f(row.get(gamma_c)) if gamma_c else None)
        res.append(_f(row.get(res_c)) if res_c else None)
        cond.append(_f(row.get(cond_c)) if cond_c else None)

    if len(dept) < 5:
        return None
    if not any(v is not None for v in gamma) and not any(v is not None for v in res):
        return None
    return {
        "dept": dept,
        "gamma": gamma,
        "res": res,
        "cond": cond,
        "has_gamma": any(v is not None for v in gamma),
        "has_res": any(v is not None for v in res),
        "has_cond": any(v is not None for v in cond),
        "columns": headers,
    }


def _percentile(sorted_vals: list[float], p: float) -> float | None:
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * p
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


def _bin_curve(curve: dict, bin_ft: float = SMOOTH_FT) -> list[dict]:
    """Average samples into depth bins (median gamma / res)."""
    buckets: dict[int, dict] = {}
    for i, d in enumerate(curve["dept"]):
        if d < 0:
            continue
        key = int(math.floor(d / bin_ft))
        b = buckets.setdefault(key, {"g": [], "r": []})
        g = curve["gamma"][i]
        r = curve["res"][i]
        if g is not None:
            b["g"].append(g)
        if r is not None:
            b["r"].append(r)
    out: list[dict] = []
    for key in sorted(buckets):
        b = buckets[key]
        if not b["g"] and not b["r"]:
            continue
        top = key * bin_ft
        out.append(
            {
                "top_ft": top,
                "bot_ft": top + bin_ft,
                "gamma": median(b["g"]) if b["g"] else None,
                "res": median(b["r"]) if b["r"] else None,
            }
        )
    return out


def _classify_point(
    g: float | None,
    r: float | None,
    g_p25: float | None,
    g_p75: float | None,
) -> str:
    score = 0
    if g is not None:
        if g >= GAMMA_FINE:
            score += 1
        elif g <= GAMMA_COARSE:
            score -= 1
        elif g_p75 is not None and g_p25 is not None and (g_p75 - g_p25) >= 15:
            if g >= g_p75:
                score += 1
            elif g <= g_p25:
                score -= 1
    if r is not None:
        if r <= RES_FINE:
            score += 1
        elif r >= RES_COARSE:
            score -= 1
    if score >= 1:
        return "fine"
    if score <= -1:
        return "coarse"
    return "mixed"


def _merge_zones(bins: list[dict]) -> list[dict]:
    if not bins:
        return []
    raw: list[dict] = []
    start = 0
    for i in range(1, len(bins) + 1):
        if i < len(bins) and bins[i]["class"] == bins[start]["class"]:
            continue
        chunk = bins[start:i]
        gs = [b["gamma"] for b in chunk if b["gamma"] is not None]
        rs = [b["res"] for b in chunk if b["res"] is not None]
        raw.append(
            {
                "top_ft": round(chunk[0]["top_ft"], 2),
                "bot_ft": round(chunk[-1]["bot_ft"], 2),
                "class": chunk[0]["class"],
                "gamma_med": round(median(gs), 1) if gs else None,
                "res_med": round(median(rs), 1) if rs else None,
            }
        )
        start = i

    merged: list[dict] = []
    for z in raw:
        thick = z["bot_ft"] - z["top_ft"]
        if merged and (z["class"] == merged[-1]["class"] or thick < MIN_ZONE_FT):
            prev = merged[-1]
            if thick < MIN_ZONE_FT and z["class"] != prev["class"]:
                prev_thick = prev["bot_ft"] - prev["top_ft"]
                if thick > prev_thick:
                    prev["class"] = z["class"]
            prev["bot_ft"] = z["bot_ft"]
            if z.get("gamma_med") is not None:
                if prev.get("gamma_med") is not None:
                    prev["gamma_med"] = round((prev["gamma_med"] + z["gamma_med"]) / 2.0, 1)
                else:
                    prev["gamma_med"] = z["gamma_med"]
            if z.get("res_med") is not None:
                if prev.get("res_med") is not None:
                    prev["res_med"] = round((prev["res_med"] + z["res_med"]) / 2.0, 1)
                else:
                    prev["res_med"] = z["res_med"]
        else:
            merged.append(dict(z))

    for z in merged:
        z["thick_ft"] = round(z["bot_ft"] - z["top_ft"], 2)
    return merged


def _interval_class(samples: list[str]) -> str | None:
    if not samples:
        return None
    n = len(samples)
    fine = sum(1 for c in samples if c == "fine") / n
    coarse = sum(1 for c in samples if c == "coarse") / n
    if fine >= 0.40:
        return "fine"
    if coarse >= 0.55:
        return "coarse"
    if fine >= 0.25:
        return "mixed_fines"
    return "mixed"


def build_well_zones(curve: dict) -> dict:
    bins = _bin_curve(curve, SMOOTH_FT)
    g_valid = sorted(b["gamma"] for b in bins if b["gamma"] is not None)
    g_p25 = _percentile(g_valid, 0.25)
    g_p75 = _percentile(g_valid, 0.75)

    for b in bins:
        b["class"] = _classify_point(b["gamma"], b["res"], g_p25, g_p75)

    zones = _merge_zones(bins)

    shallowest_fine = None
    for z in zones:
        if z["class"] == "fine":
            shallowest_fine = z["top_ft"]
            break

    infil: dict = {}
    for win in INFIL_WINDOWS:
        samples = [b["class"] for b in bins if b["bot_ft"] > 0 and b["top_ft"] < win]
        fine_frac = (
            round(sum(1 for c in samples if c == "fine") / len(samples), 3)
            if samples
            else None
        )
        infil[f"0_{int(win)}ft"] = {
            "class": _interval_class(samples),
            "fines_fraction": fine_frac,
            "n": len(samples),
        }

    return {
        "zones": zones,
        "infil_risk": {
            **{f"class_0_{int(w)}ft": infil[f"0_{int(w)}ft"]["class"] for w in INFIL_WINDOWS},
            **{
                f"fines_fraction_0_{int(w)}ft": infil[f"0_{int(w)}ft"]["fines_fraction"]
                for w in INFIL_WINDOWS
            },
            "shallowest_fine_top_ft": shallowest_fine,
            "windows": infil,
        },
        "gamma_p25": round(g_p25, 1) if g_p25 is not None else None,
        "gamma_p75": round(g_p75, 1) if g_p75 is not None else None,
        "has_gamma": bool(curve.get("has_gamma")),
        "has_res": bool(curve.get("has_res")),
        "n_samples": len(curve["dept"]),
        "log_top_ft": round(curve["dept"][0], 2),
        "log_bot_ft": round(curve["dept"][-1], 2),
    }


def build_zones(
    wells: list[dict],
    csv_dir: Path,
    out_path: Path,
    *,
    limit: int | None,
) -> dict:
    by_id = {str(w.get("id")): w for w in wells if w.get("id")}
    files = sorted(csv_dir.glob("*.csv"))
    if limit is not None:
        files = files[: max(0, int(limit))]

    logs: list[dict] = []
    skipped = 0
    for i, path in enumerate(files, 1):
        wid = path.stem
        well = by_id.get(wid) or {}
        curve = read_curve_csv(path)
        if not curve:
            skipped += 1
            continue
        z = build_well_zones(curve)
        logs.append(
            {
                "id": wid,
                "lat": well.get("lat"),
                "lon": well.get("lon"),
                "alt_ft": well.get("alt_ft"),
                "depth_ft": well.get("depth_ft"),
                "drill_date": well.get("drill_date"),
                "geophys_csv": well.get("geophys_csv"),
                "geophys_pdf": well.get("geophys_pdf"),
                "geophys_las": well.get("geophys_las"),
                "source_csv": path.name,
                **z,
            }
        )
        if i % 200 == 0 or i == len(files):
            print(f"  zoned {i}/{len(files)} · {len(logs)} ok, {skipped} skip …", flush=True)

    # statewide shallow fines stats
    n20 = sum(
        1
        for L in logs
        if (L.get("infil_risk") or {}).get("class_0_20ft") in ("fine", "mixed_fines")
    )

    payload = {
        "type": "dgs_dgir_geophys_zones",
        "version": 1,
        "generated": datetime.now(timezone.utc).isoformat(),
        "csv_dir": str(csv_dir),
        "classifier": {
            "gamma_coarse_api": GAMMA_COARSE,
            "gamma_fine_api": GAMMA_FINE,
            "res_coarse_ohm_m": RES_COARSE,
            "res_fine_ohm_m": RES_FINE,
            "min_zone_ft": MIN_ZONE_FT,
            "smooth_ft": SMOOTH_FT,
            "note": (
                "Screening coarse/mixed/fine from DGS gamma (± induction). "
                "Not AASHTO, not lab %fines, not DNREC design rates."
            ),
        },
        "n_csv": len(files),
        "n_wells": len(logs),
        "n_skipped_unreadable": skipped,
        "n_shallow_fines_risk_0_20ft": n20,
        "wells": logs,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return {
        "n_csv": len(files),
        "n_wells": len(logs),
        "n_skipped": skipped,
        "n_shallow_fines": n20,
        "out": str(out_path),
        "bytes": out_path.stat().st_size,
    }


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Download DGS geophys CSVs and build coarse/fine zone JSON"
    )
    ap.add_argument("--wells", default=str(DEFAULT_WELLS))
    ap.add_argument("--csv-dir", default=str(DEFAULT_CSV_DIR))
    ap.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    ap.add_argument("--out", default=str(DEFAULT_ZONES))
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--no-skip-existing", action="store_true")
    ap.add_argument("--delay", type=float, default=0.08)
    ap.add_argument("--download-only", action="store_true")
    ap.add_argument("--zones-only", action="store_true", help="Skip download; zone existing CSVs")
    args = ap.parse_args()

    wells = load_wells(Path(args.wells))
    n_csv = sum(1 for w in wells if w.get("geophys_csv"))
    print(f"Loaded {len(wells)} wells ({n_csv} with geophys_csv)", flush=True)

    csv_dir = Path(args.csv_dir)

    if not args.zones_only:
        print(
            f"Downloading geophys CSVs → {csv_dir}/  (~{n_csv} files, resume-safe)",
            flush=True,
        )
        summary = download_all(
            wells,
            csv_dir,
            Path(args.manifest),
            limit=args.limit,
            skip_existing=not args.no_skip_existing,
            delay_s=max(0.0, float(args.delay)),
        )
        print(
            f"Download done: {summary['downloaded']} new, {summary['skipped']} skipped, "
            f"{summary['failed']} failed · {summary['bytes']/(1024*1024):.1f} MB "
            f"in {summary['elapsed_s']}s",
            flush=True,
        )
        print(f"Manifest: {args.manifest}", flush=True)
        if summary["failed"] and not summary["downloaded"] and not summary["skipped"]:
            return 1

    if args.download_only:
        print("Tip: re-run without --download-only (or with --zones-only) to build zones JSON", flush=True)
        return 0

    print(f"Building zones → {args.out} …", flush=True)
    zs = build_zones(wells, csv_dir, Path(args.out), limit=args.limit)
    mb = zs["bytes"] / (1024 * 1024)
    print(
        f"Wrote {zs['out']} ({mb:.2f} MB) — {zs['n_wells']} wells from {zs['n_csv']} CSVs "
        f"({zs['n_skipped']} unreadable); {zs['n_shallow_fines']} with fines risk in 0–20 ft",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Bulk-import GEOSYSTEM *.GEO.zip archives into DelDOT GeoTrak db.json

Usage (Windows / Mac / Linux):
  python import-geo-zips.py "C:\\path\\to\\folder\\with\\zips" "C:\\Ultimate Geo Program\\db.json"
  python import-geo-zips.py ./geo-zips ./db.json --merge

Drop every T#########.GEO.zip into one folder and run once.
Requires: Python 3.8+ and pyproj (pip install pyproj)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from pathlib import Path

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


def sp_to_ll(e: float, n: float) -> tuple[float, float]:
    lon, lat = _TO_WGS84.transform(e, n)
    return round(lat, 7), round(lon, 7)


def parse_indexed_parts(raw_parts: list[bytes]) -> dict[str, list]:
    parts = [p.decode("latin-1", "replace") for p in raw_parts if p]
    fields: dict[str, list] = {}
    field_re = re.compile(r"^[A-Z][A-Z0-9_]*$")
    i = 0
    while i < len(parts):
        name = parts[i].strip()
        if not field_re.match(name):
            i += 1
            continue
        vals: list = []
        j = i + 1
        while j < len(raw_parts):
            chunk = raw_parts[j]
            nxt = parts[j].strip() if j < len(parts) else ""
            if field_re.match(nxt) and nxt != name:
                break
            if len(chunk) == 1 and chunk[0] < 32:
                vals.append(chunk)  # index marker byte
            elif nxt:
                vals.append(nxt)
            j += 1
        fields[name] = vals
        i = j
    return fields


def indexed_dict(vals: list) -> dict[int, str]:
    out: dict[int, str] = {}
    i = 0
    while i < len(vals):
        v = vals[i]
        if i + 1 < len(vals) and isinstance(vals[i + 1], bytes) and len(vals[i + 1]) == 1:
            out[vals[i + 1][0]] = str(v).strip()
            i += 2
        else:
            i += 1
    return out


def num(v) -> float | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.upper() in ("NV", "NP", "NR", "—", "-"):
        return None
    try:
        return round(float(s), 1)
    except ValueError:
        return None


def sample_label(v, fallback_idx: int):
    """Preserve non-numeric IDs (R-1 rock core, U-1 Shelby tube); fall back to slot index."""
    if v is None or str(v).strip() == "":
        return fallback_idx
    s = str(v).strip()
    try:
        return int(s)
    except ValueError:
        return s


def lab_lookup_key(label) -> int | None:
    """Map sample label to LIMCOMB/GSCOMB numeric sample # when possible."""
    if label is None:
        return None
    if isinstance(label, int):
        return label
    s = str(label).strip()
    try:
        return int(s)
    except ValueError:
        # R-# rock cores / U-# Shelby tubes usually have no LIM/GS index rows
        return None


def sample_kind(label) -> str:
    """Classify GEOSYSTEM sample ID for reports / UI (SPT, Shelby, rock core)."""
    s = str(label).strip().upper()
    if re.match(r"^R[\-_ ]?\d+", s):
        return "rock_core"
    if re.match(r"^U[\-_ ]?\d+", s):
        return "shelby"
    try:
        int(s)
        return "split_spoon"
    except ValueError:
        return "other"


def parse_lim(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return {}
    out: dict = {}
    nwc = root.find(".//NATURAL_WATER_CONTENT")
    if nwc is not None and nwc.text and nwc.text.strip():
        out["nm"] = num(nwc.text.strip())
    ll = root.find(".//LIQUID_LIMIT")
    if ll is not None and ll.text and ll.text.strip() not in ("NP", ""):
        out["ll"] = ll.text.strip()
    pl = root.find(".//PLASTIC_LIMIT")
    if pl is not None and pl.text and pl.text.strip() not in ("NP", ""):
        out["pi"] = pl.text.strip()
    return out


def parse_gs(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return {}
    # Cumulative % passing from sieve weights (approximate — full calc needs total sample wt)
    test = root.find(".//SieveTest")
    if test is None:
        return {}
    total = 0.0
    points = []
    for tp in test.findall("TestPoint"):
        sieve = tp.find("Sieve")
        if sieve is None:
            continue
        wt = float(sieve.get("wtretained") or 0)
        label = tp.find("Sieve/OpeningSize")
        if label is None:
            label = tp.find("OpeningSize")
        sz = label.get("readable_size", "") if label is not None else ""
        total += wt
        points.append((sz, wt))
    if total <= 0:
        return {}
    out: dict = {}
    cum = 0.0
    for sz, wt in points:
        cum += wt
        passing = round(100 - 100 * cum / total, 1)
        if sz in ('#10', '1"', '3/8"'):
            out.setdefault("p10", passing)
        if sz == "#200":
            out["p200"] = passing
    return out


def parse_mdt(path: Path) -> dict[str, list[dict]]:
    """Parse LIMCOMB.MDT / GSCOMB.MDT: file_id,boring, sample# (depth'/…).

    Older or incomplete GEOSYSTEM exports sometimes have only 2 comma fields
    (or no depth). Skip those lines instead of failing the whole job.
    """
    by_boring: dict[str, list[dict]] = {}
    if not path.exists():
        return by_boring
    for line in path.read_text(errors="replace").splitlines():
        line = line.strip()
        if not line or line == "-1":
            continue
        parts = line.split(",", 2)
        if len(parts) < 3:
            # e.g. "0,BO-1" without sample/depth — cannot link a LIM/GS file
            continue
        fid, boring, rest = parts
        if not boring.strip():
            continue
        fid = fid.zfill(8)
        m = re.match(r"\s*(\d+)\s*\(([\d.]+)", rest)
        if not m:
            continue
        rec = {
            "fid": fid,
            "num": int(m.group(1)),
            "d": float(m.group(2)),
        }
        by_boring.setdefault(boring.strip(), []).append(rec)
    for b in by_boring:
        by_boring[b].sort(key=lambda r: r["num"])
    return by_boring


def parse_pfile(path: Path) -> dict:
    raw = path.read_bytes()
    parts = [p for p in re.split(b"\x00+", raw) if p]
    return parse_indexed_parts(parts)


def parse_geo_folder(root: Path, job: str) -> list[dict]:
    borings: list[dict] = []
    lim_by = parse_mdt(root / "LIMCOMB.MDT")
    gs_by = parse_mdt(root / "GSCOMB.MDT")

    pfiles = sorted(
        [p for p in root.glob("*.$P$") if not p.name.startswith("9999")],
        key=lambda p: int(p.name.split(".")[0]) if p.name.split(".")[0].isdigit() else 999,
    )

    for pf in pfiles:
        f = parse_pfile(pf)
        boring = f.get("BORING", [None])
        if isinstance(boring, list):
            boring = boring[0] if boring else None
        if not boring:
            continue

        east = f.get("EAST")
        north = f.get("NORTH")
        if not east or not north:
            print(f"  skip {boring}: missing EAST/NORTH", file=sys.stderr)
            continue
        try:
            e = float(east[0] if isinstance(east, list) else east)
            n = float(north[0] if isinstance(north, list) else north)
        except (TypeError, ValueError) as ex:
            print(f"  skip {boring}: bad coordinates ({ex})", file=sys.stderr)
            continue
        lat, lon = sp_to_ll(e, n)

        bb = f.get("BBOTTOM")
        eob = None
        if bb:
            try:
                eob = float(bb[0] if isinstance(bb, list) else bb)
            except (TypeError, ValueError):
                eob = None

        depth_m = indexed_dict(f.get("DEPTH", []))
        sn_m = indexed_dict(f.get("SAMP_NUM", []))
        desc_m = indexed_dict(f.get("DESCRIPTION", []))
        aashto_m = indexed_dict(f.get("AASHTO", []))
        uscs_m = indexed_dict(f.get("USCS", []))
        p10_m = indexed_dict(f.get("PER10", []))
        p200_m = indexed_dict(f.get("PER200", []))
        b1_m = indexed_dict(f.get("BLOWS1", []))
        b2_m = indexed_dict(f.get("BLOWS2", []))
        b3_m = indexed_dict(f.get("BLOWS3", []))
        b4_m = indexed_dict(f.get("BLOWS4", []))

        # sample indices present in SAMP_NUM (skip 0 = end boring marker sometimes)
        indices = sorted(i for i in sn_m if i > 0)
        if not indices:
            indices = sorted(i for i in depth_m if i > 0)

        lim_samples = {r["num"]: r for r in lim_by.get(boring, [])}
        gs_samples = {r["num"]: r for r in gs_by.get(boring, [])}

        samples = []
        for idx in indices:
            if idx == 0:
                continue
            desc = desc_m.get(idx, "")
            if desc.lower().startswith("end boring"):
                # use end-boring depth as EOB when BBOTTOM missing
                if eob is None:
                    try:
                        eob = float(depth_m.get(idx)) if depth_m.get(idx) is not None else None
                    except (TypeError, ValueError):
                        pass
                continue

            blows = [b1_m.get(idx), b2_m.get(idx), b3_m.get(idx), b4_m.get(idx)]
            n_val = None
            try:
                if blows[1] is not None and blows[2] is not None:
                    n_val = int(blows[1]) + int(blows[2])
            except (TypeError, ValueError):
                n_val = None

            label = sample_label(sn_m.get(idx), idx)
            sn_key = lab_lookup_key(label)
            lim_rec = lim_samples.get(sn_key) if sn_key is not None else None
            gs_rec = gs_samples.get(sn_key) if sn_key is not None else None
            lab_lim = parse_lim(root / f"{lim_rec['fid']}.LIM") if lim_rec else {}
            lab_gs = parse_gs(root / f"{gs_rec['fid']}.GS") if gs_rec else {}

            d = depth_m.get(idx)
            try:
                depth = float(d) if d is not None else (lim_rec["d"] if lim_rec else None)
            except (TypeError, ValueError):
                depth = lim_rec["d"] if lim_rec else None

            samples.append(
                {
                    "num": label,
                    "kind": sample_kind(label),
                    "d": depth,
                    "desc": desc,
                    "ll": lab_lim.get("ll"),
                    "pi": lab_lim.get("pi"),
                    "nm": lab_lim.get("nm"),
                    "uscs": uscs_m.get(idx),
                    "aashto": aashto_m.get(idx),
                    "p10": num(p10_m.get(idx)) or lab_gs.get("p10"),
                    "p200": num(p200_m.get(idx)) or lab_gs.get("p200"),
                    "blows": blows,
                    "n": n_val,
                }
            )

        samples.sort(key=lambda s: (s["d"] is None, s["d"] or 0))
        if eob is None and samples:
            # deepest sample / rock run as fallback EOB
            depths = [s["d"] for s in samples if s["d"] is not None]
            if depths:
                eob = max(depths)

        borings.append(
            {
                "job": job,
                "b": boring,
                "lat": lat,
                "lon": lon,
                "e": round(e, 2),
                "n": round(n, 2),
                "eob": eob,
                "s": samples,
            }
        )

    return borings


def job_from_zip(name: str) -> str:
    base = Path(name).name
    # Normal: T202101501B.GEO.zip
    m = re.match(r"(.+?)\.GEO\.zip$", base, re.I)
    if m:
        return m.group(1)
    # Uploaded / renamed: T202101501B.GEO_xxxx.zip or T202101501B.GEO.zip.bak
    m = re.match(r"(.+?)\.GEO(?:[._].*)?\.zip$", base, re.I)
    if m:
        return m.group(1)
    return Path(base).stem.replace(".GEO", "")


def import_zip(zip_path: Path) -> tuple[str, list[dict]]:
    job = job_from_zip(zip_path.name)
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(tmp)
        root = Path(tmp)
        # find *.GEO folder inside
        geo_dirs = list(root.rglob("*.GEO"))
        geo_dirs = [p for p in geo_dirs if p.is_dir()]
        if not geo_dirs:
            raise ValueError(f"No .GEO folder inside {zip_path.name}")
        geo_dir = geo_dirs[0]
        # Prefer folder name when zip was renamed (e.g. upload suffixes)
        folder_job = geo_dir.name
        if folder_job.upper().endswith(".GEO"):
            folder_job = folder_job[:-4]
        if folder_job and (job.startswith(folder_job) or len(job) > len(folder_job) + 5):
            job = folder_job
        elif re.match(r"^T\d+", folder_job, re.I):
            job = folder_job
        return job, parse_geo_folder(geo_dir, job)


def load_db(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"borings": [], "cores": [], "jobs": {}}


def main():
    ap = argparse.ArgumentParser(description="Import GEOSYSTEM .GEO.zip files into db.json")
    ap.add_argument("zip_folder", help="Folder containing *.GEO.zip files")
    ap.add_argument("db_path", help="Output db.json path (e.g. Ultimate Geo Program/db.json)")
    ap.add_argument("--merge", action="store_true", help="Merge with existing db.json (default: replace jobs with same id)")
    ap.add_argument("--replace-all", action="store_true", help="Replace entire database")
    args = ap.parse_args()

    zip_dir = Path(args.zip_folder)
    db_path = Path(args.db_path)
    zips = sorted(set(
        list(zip_dir.glob("*.GEO.zip"))
        + list(zip_dir.glob("*.geo.zip"))
        + list(zip_dir.glob("*.GEO*.zip"))
    ))
    if not zips:
        print(f"No *.GEO.zip files in {zip_dir}", file=sys.stderr)
        sys.exit(1)

    db = {"borings": [], "cores": [], "jobs": {}} if args.replace_all else load_db(db_path)
    db.setdefault("borings", [])
    db.setdefault("cores", [])
    db.setdefault("jobs", {})

    total_b = 0
    total_s = 0
    errors = []

    for zp in zips:
        try:
            job, borings = import_zip(zp)
            if args.merge or not args.replace_all:
                db["borings"] = [r for r in db["borings"] if r.get("job") != job]
            db["borings"].extend(borings)
            db["jobs"][job] = {
                "contract": job,
                "imported": date.today().isoformat(),
                "source": zp.name,
            }
            ns = sum(len(b["s"]) for b in borings)
            total_b += len(borings)
            total_s += ns
            print(f"OK  {zp.name}: {len(borings)} borings, {ns} samples")
        except Exception as e:
            errors.append((zp.name, str(e)))
            print(f"ERR {zp.name}: {e}", file=sys.stderr)

    db_path.parent.mkdir(parents=True, exist_ok=True)
    # Compact + strict JSON — never emit NaN/Infinity (browsers reject those)
    def _clean(o):
        if isinstance(o, float):
            if o != o or o in (float("inf"), float("-inf")):  # NaN / Inf
                return None
            return o
        if isinstance(o, list):
            return [_clean(x) for x in o]
        if isinstance(o, dict):
            return {k: _clean(v) for k, v in o.items()}
        return o

    payload = json.dumps(_clean(db), separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    db_path.write_text(payload, encoding="utf-8")
    mb = len(payload.encode("utf-8")) / (1024 * 1024)
    print(f"\nWrote {db_path} ({mb:.1f} MB compact)")
    print(f"Total this run: {total_b} borings, {total_s} samples across {len(zips) - len(errors)} projects")
    print(f"Database now: {len(db['borings'])} borings")
    if mb > 40:
        print(
            "NOTE: Large db.json — use the latest Geo_Report_Center.html (canvas markers). "
            "If the map stays empty, re-open the project folder and wait for the load toast.",
            file=sys.stderr,
        )
    if errors:
        print(f"Errors: {len(errors)}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()

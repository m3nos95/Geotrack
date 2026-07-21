#!/usr/bin/env python3
"""
Zip GEOSYSTEM project folders in geo-zips/ and optionally remove the folder.

GEOSYSTEM expects archives like T202101501B.GEO.zip containing T202101501B.GEO/...

Usage:
  python zip-geo-folders.py                    # zip folders in ./geo-zips, delete after OK
  python zip-geo-folders.py "C:\\Ultimate Geo Program\\geo-zips"
  python zip-geo-folders.py ./geo-zips --keep  # zip only, leave folders

Drop unpacked *.GEO folders into geo-zips, double-click zip-geo-folders.bat, then import-geo-zips.bat.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import zipfile
from pathlib import Path


def zip_name_for(folder: Path) -> str:
    """T202101501B.GEO -> T202101501B.GEO.zip ; MyJob -> MyJob.GEO.zip"""
    name = folder.name
    if name.upper().endswith(".GEO"):
        return f"{name}.zip"
    return f"{name}.GEO.zip"


def looks_like_geo_project(folder: Path) -> bool:
    if not folder.is_dir():
        return False
    markers = ("LIMCOMB.MDT", "GSCOMB.MDT", "CommonSettings.xml")
    if any((folder / m).exists() for m in markers):
        return True
    if list(folder.glob("*.$P$")) or list(folder.glob("*.NDX")):
        return True
    return True  # any subfolder in geo-zips is treated as a project folder


def zip_folder(folder: Path, zip_path: Path) -> None:
    """Write zip with one top-level folder (matches GEOSYSTEM export layout)."""
    root_name = folder.name
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED) as zf:
        for f in sorted(folder.rglob("*")):
            if not f.is_file():
                continue
            arc = f"{root_name}/{f.relative_to(folder).as_posix()}"
            zf.write(f, arc)


def main() -> int:
    ap = argparse.ArgumentParser(description="Zip GEOSYSTEM folders in geo-zips/")
    ap.add_argument(
        "folder",
        nargs="?",
        default="geo-zips",
        help="Folder containing unpacked *.GEO project dirs (default: ./geo-zips)",
    )
    ap.add_argument(
        "--keep",
        action="store_true",
        help="Keep original folders after zipping",
    )
    ap.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing .zip files",
    )
    args = ap.parse_args()

    base = Path(args.folder).expanduser().resolve()
    if not base.is_dir():
        print(f"Not a folder: {base}", file=sys.stderr)
        return 1

    subdirs = sorted(p for p in base.iterdir() if p.is_dir() and looks_like_geo_project(p))
    if not subdirs:
        print(f"No project folders in {base}")
        print("Drop unpacked folders like T202101501B.GEO here, then run again.")
        return 0

    ok = skip = err = 0
    for folder in subdirs:
        zip_path = base / zip_name_for(folder)
        if zip_path.exists() and not args.force:
            print(f"SKIP {folder.name} — {zip_path.name} already exists (use --force to replace)")
            skip += 1
            continue
        try:
            print(f"ZIP  {folder.name} -> {zip_path.name} ...", end=" ", flush=True)
            zip_folder(folder, zip_path)
            print("OK")
            ok += 1
            if not args.keep:
                shutil.rmtree(folder)
                print(f"     removed folder {folder.name}")
        except OSError as ex:
            print(f"FAIL ({ex})", file=sys.stderr)
            err += 1

    print(f"\nDone: {ok} zipped, {skip} skipped, {err} failed")
    if ok and not args.keep:
        print("Next: run import-geo-zips.bat to merge into db.json")
    return 1 if err else 0


if __name__ == "__main__":
    sys.exit(main())

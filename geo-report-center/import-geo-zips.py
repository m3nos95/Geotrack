#!/usr/bin/env python3
"""Build a GeoTrak db.json from a GeoSystem .GEO folder or GEO.zip.

The archive stays where it is. This writes only db.json, beside the
archive unless --out says otherwise. It will not write that file inside
the Geotrack git checkout, and it never edits LabTrak.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

MAX_MEMBER = 20 * 1024 * 1024
TEXT_EXT = {".mdt", ".gs", ".lim", ".ndx", ".pdt"}


def is_text_member(name: str) -> bool:
    base = name.replace("\\", "/").rsplit("/", 1)[-1].lower()
    if base.endswith(".$p$"):
        return True
    dot = base.rfind(".")
    return dot >= 0 and base[dot:] in TEXT_EXT


def project_key(name: str) -> str:
    parts = [p for p in name.replace("\\", "/").split("/") if p]
    for i, part in enumerate(parts):
        if part.lower().endswith(".geo"):
            return "/".join(parts[: i + 1])
    if len(parts) <= 1:
        return "."
    return "/".join(parts[:-1])


def git_root(start: Path):
    for parent in [start, *start.parents]:
        if (parent / ".git").exists():
            return parent
    return None


class MemberSource:
    def __init__(self, src: Path):
        self.src = src
        self.zip = None

    def __enter__(self):
        if self.src.is_file():
            if not zipfile.is_zipfile(self.src):
                raise SystemExit(f"Not a zip or a folder: {self.src}")
            self.zip = zipfile.ZipFile(self.src)
        elif not self.src.is_dir():
            raise SystemExit(f"Not a zip or a folder: {self.src}")
        return self

    def __exit__(self, *args):
        if self.zip:
            self.zip.close()

    def names(self):
        if self.zip:
            out = []
            for info in self.zip.infolist():
                if info.is_dir() or not is_text_member(info.filename):
                    continue
                if info.file_size > MAX_MEMBER:
                    print(f"skip {info.filename} ({info.file_size} bytes)", file=sys.stderr)
                    continue
                out.append(info.filename.replace("\\", "/"))
            return out
        out = []
        for dirpath, _, filenames in os.walk(self.src):
            for fn in filenames:
                full = Path(dirpath) / fn
                rel = f"{self.src.name}/{full.relative_to(self.src).as_posix()}"
                if not is_text_member(rel):
                    continue
                size = full.stat().st_size
                if size > MAX_MEMBER:
                    print(f"skip {rel} ({size} bytes)", file=sys.stderr)
                    continue
                out.append(rel)
        return out

    def read(self, name: str) -> bytes:
        if self.zip:
            with self.zip.open(name) as fh:
                return fh.read()
        rel = name
        prefix = self.src.name + "/"
        if rel.startswith(prefix):
            rel = rel[len(prefix):]
        return (self.src / rel).read_bytes()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Build a GeoTrak db.json from a .GEO folder or GEO.zip")
    parser.add_argument("source", help=".GEO folder or GEO.zip")
    parser.add_argument("--out", help="db.json path (default: beside the source)")
    parser.add_argument("--allow-in-repo", action="store_true", help="allow db.json inside the git checkout")
    args = parser.parse_args(argv)

    src = Path(args.source).expanduser().resolve()
    if not src.exists():
        print(f"Not found: {src}", file=sys.stderr)
        return 1
    if args.out:
        out = Path(args.out).expanduser().resolve()
    elif src.is_file():
        out = src.with_name("db.json")
    else:
        out = (src / "db.json").resolve()
    if out.name.lower() == "deldot-sampletrack.html":
        print("Refusing to write into LabTrak.", file=sys.stderr)
        return 1

    repo = git_root(Path(__file__).resolve())
    out_repo = git_root(out.parent if out.suffix else out)
    if out_repo and repo and out_repo == repo and not args.allow_in_repo:
        print(
            "Refusing to write db.json inside the Geotrack git repo.\n"
            "Run this beside the GEO.zip so db.json is written next to the archive,\n"
            "or pass --out with a path outside the checkout.",
            file=sys.stderr,
        )
        return 1
    if shutil.which("node") is None:
        print("Node.js is required to read the .GEO files. Install Node, then run this again.", file=sys.stderr)
        return 1

    node_script = Path(__file__).resolve().parent / "import-geo.js"
    with MemberSource(src) as source:
        names = source.names()
        if not names:
            print("No GeoSystem project files found (.$P$, .MDT, .GS, .LIM).", file=sys.stderr)
            return 1
        groups = {}
        order = []
        for name in names:
            key = project_key(name)
            if key not in groups:
                groups[key] = []
                order.append(key)
            groups[key].append(name)

        proc = subprocess.Popen(
            ["node", str(node_script), "--stdin", "--out", str(out)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        assert proc.stdin is not None
        for key in order:
            files = []
            for name in groups[key]:
                data = source.read(name)
                base = name.replace("\\", "/").rsplit("/", 1)[-1]
                files.append({"name": base, "path": name, "text": data.decode("latin-1")})
            proc.stdin.write(json.dumps({"files": files}, ensure_ascii=True) + "\n")
            del files
        stdout, stderr = proc.communicate()
    if proc.returncode != 0:
        print(stderr or stdout or "import failed", file=sys.stderr)
        return proc.returncode or 1
    print(stdout.strip())
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

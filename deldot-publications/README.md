# DelDOT Publications local mirror

Bulk archive of public DelDOT Publications PDFs for offline review / spec-risk scanning.

## Contents
- `catalog.json` — ~4,300 unique PDF URLs (live crawl + Wayback inventory)
- `download_all.py` — resume-friendly downloader (live first, Wayback fallback)
- `files/` — downloaded PDFs mirrored by host/path (gitignored; large)
- `download_manifest.jsonl` — per-file ok/skip/fail log

## Download

```bash
cd deldot-publications
# Priority subsets first (recommended):
python download_all.py --only mat_research --workers 6
python download_all.py --only standard_spec --workers 6
python download_all.py --only /manuals/ --workers 8

# Everything in the catalog:
python download_all.py --workers 8
```

Re-running skips files already on disk.

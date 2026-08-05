# DelDOT Publications local mirror

Bulk archive of public DelDOT Publications PDFs for offline review / spec-risk scanning.

**Current mirror:** **3,691 PDFs · 7.37 GB** under `files/` (see `SUMMARY.md`).

## Contents
- `catalog.json` — ~4,300 unique PDF URLs (live crawl + Wayback inventory)
- `download_all.py` — resume-friendly downloader (live first, Wayback fallback)
- `files/` — downloaded PDFs mirrored by host/path (gitignored; large)
- `SUMMARY.md` — counts by section
- `download_manifest.jsonl` — per-file ok/skip/fail log (local)

## Download / refresh

```bash
cd deldot-publications
# Priority subsets:
python download_all.py --only mat_research --workers 6
python download_all.py --only standard_spec --workers 6
python download_all.py --only /manuals/ --workers 8

# Everything in the catalog (skips files already present):
python download_all.py --workers 8
```

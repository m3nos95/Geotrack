# r18 reference (screenshots + BoreLog)

Reference screenshots and the standalone BoreLog app used with LabTrak.

## Adding screenshots

GitHub can reject or warn on uploads when files are too large or the repo gets heavy. To avoid **storage / upload errors**:

1. **Resize before upload** — max **1600 px** on the long edge is enough for bug reports (full phone resolution is unnecessary).
2. **Target file size** — aim for **under 800 KB** per JPG.
3. **Prefer JPG** over PNG for phone screenshots (PNG is often 2–3× larger).
4. **Upload one or two at a time** on github.com if the web UI fails on a batch.
5. **Naming** — `Screenshot_YYYYMMDD_HHMMSS_topic.jpg` or `YYYYMMDD_HHMMSS.jpg`.

### Quick compress (Windows / Mac / Linux)

- Phone: share screenshot → “Resize” or use Photos “Export small” before uploading.
- Online: any “compress JPG” tool, width 1600 px.
- This repo (if you clone locally):

```bash
python3 - <<'PY'
from PIL import Image
from pathlib import Path
p = Path("docs/r18-reference/YOUR_FILE.jpg")
im = Image.open(p)
im.thumbnail((1600, 1600))
im.save(p, optimize=True, quality=82)
PY
```

## What’s in this folder

| File | Purpose |
|------|---------|
| `deldot-borelog.html` | BoreLog app (opened from LabTrak) |
| `Screenshot_*.jpg` | LabTrak / BoreLog / map reference captures |
| `*.png`, `*.webp` | Icons |

Screenshots here are **for development reference only** — they are not loaded by the live app.

## If you see “storage” errors in the **browser app**

That is usually **browser localStorage quota** (too much BoreLog data on one device), not GitHub:

- Export or sync important projects, then clear site data for `m3nos95.github.io/geotrack` in Chrome settings.
- Or use ☁ SYNC NOW in BoreLog so data lives in Supabase instead of only locally.

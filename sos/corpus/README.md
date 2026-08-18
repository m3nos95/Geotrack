# SOS example corpus

Dump **contractor Source of Supply spreadsheets** next to the **issued M&R letters**. This GitHub repo is public, so those files stay on this machine (gitignored) and are not committed.

## Easiest: one folder, matching names

Put every pair in `sos/corpus/drop/`. The spreadsheet and PDF just need the **same name** (any extension):

```
sos/corpus/drop/
  Frey Entrance.xls
  Frey Entrance.pdf
  Lightkeepers.xls
  Lightkeepers.pdf
  Wincheslea Phase 5.xls
  Wincheslea Phase 5.pdf
```

A later revision can keep that name plus `-rev1` (or `_rev2`):

```
  Frey Entrance-rev1.pdf
```

You do **not** need a subfolder per job if the names match.

If the contractor form and the issued letter have totally different filenames (`DEL DOT - SOS - ….xls` vs `0000016055_….pdf`), either rename them to match or use a subfolder.

## Optional: one subfolder per job

Use this when names do not match, or you want to keep original filenames:

```
sos/corpus/cases/
  frey-entrance/
    contractor.xls
    issued.pdf
    issued-rev1.pdf
```

## How we use it

After the files are in, say so in chat (or run it yourself):

```bash
node sos/corpus-learn.js
```

That diffs what the engine would issue against SECTION / SOURCE / ACTION on the real PDF.

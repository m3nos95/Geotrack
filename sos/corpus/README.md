# SOS example corpus

The program learns from **three files per job**, kept on this machine (gitignored — this GitHub repo is public):

| File | What it is |
|---|---|
| `submittal.xls` / `.xlsx` / `.pdf` | Contractor Source of Supply form |
| `program-output.html` / `.txt` | What this tool produced (typed edits included) |
| `issued.pdf` | The SOS letter that was actually sent |

## Train from jobs you already issued

Drop the contractor form, let the program write a letter, then click **Save training pack**:

1. Click **Save training pack** next to Print / PDF.
2. If `start-sos.bat` is running, that writes `Desktop\SOS Program\jobs\<date>_<contract>\` (a Windows-safe name from today’s date and the application/contract number — not the project title).
3. If not, Chrome downloads a zip. Unzip it into `SOS Program\jobs\`.
4. Copy the SOS PDF you **already issued** into that folder as **`issued.pdf`**. Nothing is emailed or sent.

Do not rename `program-output` files to look like issued letters. Harvest reads wording from `issued.pdf` only.

## Weekly: run the learner

1. Double-click **`learn-sos.bat`**.
2. Drop **`SOS-language.json`** on **APL / Chart**, **`SOS-cc.json`** on **CC**, and **`SOS-libraries.json`** on **Source Library** (or Spec Library — one file fills both).

The current Approved Source List and APL still decide approved vs must-be-tested / not approved. Harvested wording fills unknown items and matches issued phrasing when the decision is the same. The report (`SOS-learn-report.md`) diffs the contractor form against the engine, and **program output against the sent letter** — that second diff is what still needs a rule change.

The first run over a large folder takes a while (each PDF is opened once). After the APL snapshot line you should see `Listed N PDFs` then `Reading PDFs 25/3000 …`. Leave the window open until it says Press any key.

## Issued letters only (no spreadsheet)

If you have thousands of issued letters and do not want to dig through email for the contractor `.xls`:

1. Copy the letter PDFs into `Desktop\SOS Program` (subfolders are OK).
2. Double-click **`learn-sos.bat`**.
3. Drop the three JSON files as above.

## Optional: matching contractor forms by filename

If you also have the contractor Source of Supply spreadsheet (or a PDF printout of the form), put it next to the issued letter. Same basename is enough (`Frey Entrance.xls` + `Frey Entrance.pdf`). That lets the report diff what the engine would write against what was issued.

```
sos/corpus/drop/
  Frey Entrance.xls
  Frey Entrance.pdf
```

Contractor SOS forms that were **printed or saved as PDF** (not `.xls`) are OK when paired with the issued letter.

## Windows batch

On your PC:

`C:\Users\Aaron.Wieczorek\OneDrive - STATE OF DELAWARE\Desktop\SOS Program`

Double-click **`learn-sos.bat`** at the repo root (or `sos\learn-sos.bat`). It writes `SOS-learn-report.md`, `SOS-cc.json`, `SOS-language.json`, and `SOS-libraries.json` next to the files. Do not commit those — they are built from contractor letters.

Needs Node.js and Python 3 (the bat will pip-install `xlrd` and `pypdf` if missing). Drag a different folder onto the bat to scan that instead.

```
node sos/corpus-learn.js --dir-only --dir "C:\Users\Aaron.Wieczorek\OneDrive - STATE OF DELAWARE\Desktop\SOS Program"
```

## Optional: one subfolder per job

Use this when names do not match, or you want to keep original filenames. **Save training pack** builds this layout for you:

```
SOS Program/jobs/2026-08-28_623641525/
  submittal.xls
  program-output.html
  program-output.txt
  items.json
  issued.pdf
```

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

That reads issued letters even without a contractor spreadsheet, writes `SOS-language.json` / `cc-harvest.json`, diffs form+letter pairs when both exist, and diffs **program output vs issued** when a training pack is present.

# SOS example corpus

Dump **contractor Source of Supply spreadsheets** next to the **issued M&R letters** here. The public GitHub repo does **not** store these files (contractor names, addresses, job numbers). They stay on this machine (or in a Cloud Agent workspace) and are gitignored.

## What to drop

For each job, one folder:

```
sos/corpus/cases/
  frey-entrance/
    contractor.xls          # or .xlsx — the form they submitted
    issued.pdf              # the letter M&R sent
    issued-rev1.pdf         # optional later revision (tack change, etc.)
  lightkeepers-village/
    contractor.xls
    issued.pdf
```

Folder name can be anything you recognize (`mumford-n-state`, `wincheslea-ph5`). Put **every PDF for that job in the same folder**, including revisions.

If you already have a pile of files and do not want to sort them, dump the whole pile into `sos/corpus/drop/` — the learner will try to group them. Folders are more reliable when two jobs have similar names.

## How we use it

After you add files, say so in chat (or run it yourself):

```bash
node sos/corpus-learn.js
```

That prints a case-by-case diff: what the engine would issue vs SECTION / SOURCE / ACTION on the real PDF. Then we tighten rules from the mismatches (grouping, APL, “already tested”, borrow Type C, etc.).

**Do not drip-feed examples in chat.** One batch of folders is faster and we can re-run the whole set after each rule change.

## Already useful without the .xls

An issued PDF alone still teaches letter language. The learner will mark those as “PDF only — waiting on contractor spreadsheet.”

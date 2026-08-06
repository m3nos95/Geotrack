# Lesson learned — unrealistic testing frequencies (RT 301 / Tutor Perini)

## What happened (corrected)
On **US 301**, the failure mode was **not** Proctor / one-point Proctor.

The lab **could not keep up with required liquid limit and plastic limit testing**
(**AASHTO T89 / T90**, Atterberg limits) at the rates earthwork was placed.
That shortfall — missed classification tests the Department’s own manuals
promised — was later used against DelDOT in proceedings involving **Tutor Perini**.

Table B-1 still pairs those Atterberg methods with every earthwork/borrow
frequency slot (typically `T88, T89, T90, T99 (Method C), T310`). So each
“1 per N yd³” sample is not just a density check; it is a **full classification
+ moisture-density package** the central lab has to finish.

## Where the language lives
- Index: https://deldot.gov/Publications/manuals/mat_research/index.shtml
- Part B: `4b_min_test_and_cert_req.pdf` (Engineer may *increase* sampling rates)
- **Table B-1**: `5-part_b_b-2-min_test_cert-quantities_list.pdf`

| Item | Description | Frequency | Lab-heavy procedures |
|------|-------------|-----------|----------------------|
| 202000 | Excavation and Embankment | 1 / 1000 yd³ | **T89, T90** (+ T88, T99, T310) |
| — | Trenches | 1 / 300 yd³ | **T89, T90** (+ …) |
| 209002 | Borrow, Type B | 1 / 500 yd³ | **T89, T90** (+ T88, T99) |
| 209003 | Borrow, Type C | 1 / 300 yd³ | **T89, T90** (+ …) |

## Why it is exploitable
1. Manual states a **measurable QA obligation** (Atterbergs @ stated rate).
2. Large earthwork pace outruns **lab Atterberg throughput**.
3. Missed LL/PL → contractor uses the Department’s non-performance of its own
   testing schedule in claims / acceptance disputes.

Proctor (T99) volume is a related capacity risk on the same rows, but **RT 301’s
actual bite was liquid and plastic limits**.

## What the scanner should flag
- Table B-1 rows requiring **T89 and/or T90** at per-quantity frequencies
- Aggressive rates (e.g. 1/300 yd³) on borrow/trench items
- Part B language allowing the Engineer to **increase** sampling with no
  lab-capacity backstop
- Companion T88/T99 packages that multiply lab load per sample event

## Hardening pattern (Specs / M&R)
1. Separate **acceptance density** frequency from **full Atterberg / classification**
   frequency — do not require LL/PL on every density sample by default.
2. Allow Atterbergs on **material/source change**, visual change, or dispute;
   use prior results for continuous placement of the same material.
3. Tie “Engineer may increase sampling” to **documented lab capacity** or pause
   placement when the lab cannot keep up — do not silently accumulate a claims stack.
4. Staff/schedule lab Atterberg capacity against plan quantities *before* award
   on large earthwork jobs.

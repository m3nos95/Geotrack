# Lesson learned — unrealistic testing frequencies (RT 301 / Tutor Perini)

## What happened
On **US 301**, DelDOT materials documents effectively committed the Department to
**full AASHTO T99 (Method C)** moisture-density curves at Table B-1 rates, rather
than allowing a **one-point / family-of-curves (T272)** production path.

Field and lab technicians **could not physically perform** the required volume of
full Proctors (plus companion classification tests) at the rate earthwork was
placed. That testing shortfall was later used against the Department in legal
proceedings involving **Tutor Perini**.

## Where the language lives
Primary source (still live under Materials & Research manuals):

- Index: https://deldot.gov/Publications/manuals/mat_research/index.shtml
- Part B narrative: `4b_min_test_and_cert_req.pdf` (Engineer may *increase* rates)
- **Table B-1 quantities list**: `5-part_b_b-2-min_test_cert-quantities_list.pdf`

Examples from Table B-1 (english units):

| Item | Description | Frequency | Procedures |
|------|-------------|-----------|------------|
| 202000 | Excavation and Embankment | 1 / 1000 yd³ | T88, T89, T90, **T99 (Method C)**, T310 |
| — | Trenches | 1 / 300 yd³ | T88, T89, T90, **T99 (Method C)**, T310 |
| 209002 | Borrow, Type B | 1 / 500 yd³ | T88, T89, T90, **T99 (Method C)** |
| 209003 | Borrow, Type C | 1 / 300 yd³ | T88, T89, T90, **T99 (Method C)**, T310 |
| 301000 | Select Borrow Base Course | 1 / 500 yd³ | T88, T89, T90, **T99 (Method C)**, T310 |

Contrast: some **GABC Type B** rows list **T99 and T272** together — i.e. a
family-of-curves / one-point path is acknowledged for bases, but **not** for
many earthwork/borrow rows.

2026 Standard Specs often say only “compact to X% of maximum density” and defer
detail to the **Materials Manual**, with **no** “one-point” / T272 language in
the earthwork acceptance path — so Table B-1’s full T99 wording controls unless
Special Provisions fix it.

## Why it is exploitable
1. Contract / manual states a **measurable testing obligation** (full T99 @ rate).
2. Production pace on a large embankment makes compliance **operationally impossible**.
3. Missed tests → contractor argues acceptance/payment/claim theories from the
   Department’s own non-performance of QA.

## What the scanner flags
- Table B-1 rows with **T99 and no T272/one-point alternative**
- Spec/manual phrases: full T99/T180, “increase the sampling rates”, “double the
  testing frequency”, bare “maximum density”, Materials Manual deferrals
- Rough **lab-hour scenarios** (e.g. 200k yd³ × 1/1000 ≈ 200 full T99s)

## Hardening pattern (for Specs / M&R rewrite)
Prefer language that:
1. Allows **one-point / T272** for production control once a full curve exists for
   that material family/source;
2. Requires full T99 on **material change / source approval / dispute**, not every
   frequency slot;
3. Ties any “Engineer may increase sampling” to **documented capacity** or
   suspends placement when testing cannot keep up — rather than silently
   accumulating a claims stack.

# Roundabout & traffic calming screening — how GeoTrak decides

This note explains how **GeoTrak** arrives at traffic-calming bands, statewide risk ranks, potential-roundabout flags, and **Analyze sized ICD** pass/warn/fail checks.

**Bottom line:** everything here is a **screening aid**. It is **not** a DelDOT warrant, ICE decision, capacity proof, ROW determination, or device approval.

---

## 1. Traffic calming screen (TCDM context filter)

**Source of truth in product:** Delaware *Traffic Calming Design Manual* (2025) — used as a **context filter**, not a full eligibility engine.

**Code:** `classifyCalmingSegment()` in `geo-report-center/Geo_Report_Center.html`.

### Inputs (FirstMap)

| Input | Role |
|--------|------|
| **Posted speed** | Primary speed gate |
| **Functional class** | Local/collector vs arterial vs freeway |
| **AADT** | Notes / measure-family hints (not the band alone) |

**Always missing:** measured **85th-percentile speed** (TCDM often needs 85th ≥ posted + 5 mph outside subdivisions for many vertical/horizontal measures). GeoTrak never invents that.

### Band logic (order matters)

1. **Out** — functional class looks like interstate / freeway / expressway → calming not appropriate.
2. **Study** — posted **> 35 mph**.
3. **Study** — principal / major arterial (even if posted ≤ 35).
4. **Study** — minor arterial with posted ≤ 35 (may still be discussable; not an automatic candidate). Notes call out AADT ≤ / > 20k for road-diet context.
5. **Candidate** — local / collector / subdivision-like class **and** posted ≤ 35 (or posted unknown, with a confirm-in-field note).
6. **Study** — class missing but speed present → verify class before treating as candidate.
7. **Unknown** — cannot map class/speed to a clear band.

### What the band means

| Band | Meaning |
|------|---------|
| **Candidate** | Looks like places the manual usually discusses for calming (local/collector · ≤35 mph). Screening only. |
| **Study** | Arterial, posted >35, or incomplete data — engineering/planning review before treating as a calming candidate. |
| **Out** | Freeway/interstate — not applicable. |
| **Unknown** | Attributes incomplete or unmapped — field verify. |

Map-click calming paints nearby FirstMap count segments with these bands. Statewide mode scores **all** traffic-count segments the same way, then ranks them (below).

---

## 2. Statewide calming ranking (risk score)

After each segment gets a TCDM band, statewide mode adds a **relative risk score** for sorting the list (higher = higher on the ranked screen). This is **not** a crash prediction model.

### Crash / school terms

Public FirstMap overlays (injury/fatal & ped/bike since ~2021; DE public/private schools — **not** childcare):

```
riskScore =
  crashFatal × 8
+ crashInj   × 2
+ pedBike    × 6
+ schoolN    × 5
```

Points near the segment geometry (sampled along the line) are counted once within search radii.

### Potential-roundabout boost (optional flag)

If the segment is **candidate or study** and a nearby control/geometry flag fires (see §3), a boost is added:

```
+ (hitCount × 4)                 # all-way stop hits weighted higher than FM ix-only
+ (4+ legs → 6; 3 legs → 3)
+ (band === candidate → 2)
```

List sort: **riskScore ↓**, then AADT ↓.

---

## 3. Potential roundabout flag (statewide / calming)

**Not a roundabout warrant.** Flag = “worth opening the RA screen / field-checking.”

A segment is marked **potential roundabout** when:

1. Its calming band is **candidate** or **study**, **and**
2. Nearby there is either:
   - an **OSM all-way stop**, or
   - a **FirstMap 3+ leg intersection**,
3. **excluding** sites with an active FirstMap **signal** or an **existing FirstMap roundabout** in the exclusion buffers.

OSM coverage is incomplete — verify control in the field. Public link: [de.gov/roundabouts](https://de.gov/roundabouts).

---

## 4. Roundabout ICD screen (RA screen tool)

**User flow:** click map → optional snap to FirstMap intersection → size/rotate to-scale ICD overlay → **Analyze sized ICD**.

### Guidance sources

| Source | How it’s used |
|--------|----------------|
| **NCHRP Guide for Roundabouts (Report 1043)** | Descriptive ICD category ranges (Ex. 2.9 / 10.3), ≤30 mph traversable mini/compact context, soft planning volume envelopes, ~20–35 ft planning buffer idea (Ch. 6) |
| **DelDOT DGM 1-26** | Still governs final design vehicle / ICD selection — not replaced by this screen |
| **FirstMap / Microsoft buildings / OSM** | Live site context (roads, signals, existing RAs, all-way stops, footprints) |

### Descriptive ICD ranges (not design targets)

| Category | Common ICD (ft) |
|----------|------------------|
| Mini | 45–90 |
| Compact | 65–120 |
| Single-lane | 90–180 |
| Multilane (typical) | ~135–200 |

Ranges **overlap**. Diameter alone does **not** set the category (Guide Ex. 2.9 / 10.3).

### Traffic bias → “typical” size (`raTrafficIcdAdvice`)

Uses governing **max AADT** and **max posted speed** near the click:

- **≤30 mph** → mini/compact more plausible (traversable types typically this band unless approach speed reduction is provided).
- **>30–35+ mph** → mini penalized; lean compact/single; call out approach speed management.
- **Low AADT** → smaller ICD more discussable; **high AADT** → mini unlikely; **≳20k** → multilane may be in play (ops study required).

Output is a preferred family/ring for comparison only — **not** capacity or a warrant.

### Analyze sized ICD checks (`analyzeRaSizedCompliance`)

Each check is **PASS / WARN / FAIL / INFO**. Verdict:

| Verdict | Rule |
|---------|------|
| **Unlikely as sized** | Any **FAIL** |
| **Needs study / caution** | No fail, but ≥1 **WARN** |
| **Looks discussable as sized** | Passes with no fails/warns |

#### Checks (what we use)

1. **Size vs speed / AADT** — sized ICD family vs traffic bias; mini too small for high speed/AADT; soft multilane caution if AADT high and ICD &lt; ~135 ft.
2. **Planning volume** — soft AADT envelopes (≤15k / ≤25k / ≤45k). High volume alone is **WARN / escalate**, not an automatic FAIL.
3. **NCHRP ICD category** — whether sized feet fall in descriptive Exhibit ranges (overlap called out).
4. **Posted speed** — ≤30 mph pass for mini/compact context; &gt;30 with mini → WARN; &gt;35 → WARN (speed management / study).
5. **Buildings / space** — Microsoft / OSM footprints vs sized ICD (+ nick tolerance). 0 hits PASS; 1 WARN; 2+ FAIL. Not ROW.
6. **Planning buffer** — footprints in ~**25 ft** outside the ICD (Guide-style curb/landscape/ped ring) → WARN even if ICD itself is clear.
7. **Constrained retrofit** — INFO when mini clears buildings but a ~130 ft single-lane ICD would not.
8. **Traffic signal** — active FirstMap only (OFFLINE/retired ignored). Very close → FAIL; nearby → WARN (mixed signal/RA corridors need judgment).
9. **All-way stop** — OSM all-way nearby → PASS (common stop→RA conversion context); else INFO.
10. **Existing roundabout** — FirstMap RA too close → FAIL; else PASS/INFO.
11. **Approaches** — ≥3 legs PASS; 2 WARN; unclear INFO (rotate amber handles).

### Overlay looks

Ring / Built / Grass / Detailed / Diagram change **preview graphics only**. They do **not** change Analyze math.

---

## 5. What we deliberately do **not** claim

- Not a **MUTCD warrant** or DelDOT **approval**
- Not **HCM / SIDRA capacity** certainty (no peak enter+conflict TM in the map screen)
- Not **ROW / fee ownership** or utility clearance
- Not **design vehicle / fastest-path** compliance (DGM 1-26 / TORUS territory)
- Not proof that **speeding** is occurring (no 85th %ile)
- ICD Exhibit numbers are **descriptive**, not design targets

---

## 6. Where to click in the app

| Goal | Control |
|------|---------|
| Calming context on map click | **Traffic calming** (header) or Layers → calming screen |
| Ranked statewide list | Calming screen → **Run statewide screen** |
| Size & analyze a roundabout footprint | **RA screen** → size/rotate → **Analyze sized ICD** |

Manuals / portals:

- [Delaware Traffic Calming Design Manual (PDF)](https://deldot.gov/Publications/manuals/traffic_calming/pdfs/Delaware_TrafficCalmingDesignManual.pdf)
- [de.gov/roundabouts](https://de.gov/roundabouts)
- NCHRP *Guide for Roundabouts* (Report **1043**) — local research copies under `docs/fhwa-roundabout/` (gitignored; not shipped in the repo)

---

*Document version tracks GeoTrak screening behavior as of **v0.99.44**.*

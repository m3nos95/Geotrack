# DelDOT LabTrak — Technical White Sheet

**Product:** DelDOT LabTrak (Materials & Research Lab)  
**Repository:** [m3nos95/Geotrack](https://github.com/m3nos95/Geotrack)  
**Live app:** [https://m3nos95.github.io/geotrack/](https://m3nos95.github.io/geotrack/)  
**Document purpose:** Explain every major feature, process, UI surface, backend service, and why each piece of the stack exists.

---

## 1. Executive summary

LabTrak is a **field + lab operations web application** for DelDOT Materials & Research. It covers:

- Field density / compaction (LB-68, nuclear DMF-68C)
- Field lab samples and lab arrival
- Soil & aggregate laboratory testing and report approval
- Concrete cylinder sets (intake → break → PDF → email)
- Pavement core drills
- Proctor curves and Family of Curves
- Geotechnical BoreLog (2D/3D) with GPS mapping
- Approved sources / stockpile tracking
- Projects & statewide map
- AASHTO R-18 lab quality-system compliance

The product is implemented as a **single-page application in one HTML file**, deployed as a **static site on GitHub Pages**, with **Supabase** as the database, authentication, and serverless email backend. Field work is designed to survive **poor connectivity** via local caches and offline write queues.

---

## 2. Why this architecture

| Layer | Choice | Why it is needed |
|-------|--------|------------------|
| **UI** | Single file `deldot-sampletrack.html` | One deployable artifact techs can open on phone/tablet; no Node build step for day-to-day work; all modules stay versioned together |
| **Hosting** | GitHub Pages | Free HTTPS static hosting tied to the same GitHub repo; every merge to `main` republishes; `.nojekyll` keeps paths intact |
| **Source control** | GitHub | Branch → PR → merge workflow; CI deploy; audit history of every feature change |
| **Database / Auth** | Supabase (Postgres + Auth) | Shared multi-user data; role-based access (RLS); email/password sign-in; SQL migrations; edge functions for email |
| **Email** | Supabase Edge Function + Gmail SMTP | Lab reports must leave the browser as real PDF emails without running a custom mail server |
| **Maps** | Mapbox GL + browser Geolocation | Project pins, cores, samples, concrete GPS, admin lab map |
| **BoreLog companion** | Separate HTML + IndexedDB + sync tables | Heavy 3D/geo tooling kept out of the main SPA while still syncing to the same Supabase project |
| **Offline** | `localStorage` / IndexedDB queues | Field techs often lose signal; work must not be lost |

---

## 3. Repository layout

```
geotrack/
├── index.html                    # Redirect stub → deldot-sampletrack.html
├── deldot-sampletrack.html       # Full LabTrak SPA (~31k lines)
├── .nojekyll                     # GitHub Pages: do not process as Jekyll
├── .github/workflows/
│   └── deploy-pages.yml          # Publish whole repo to GitHub Pages on main
├── docs/
│   ├── LABTRAK_TECHNICAL_WHITE_SHEET.md   # This document
│   └── r18-reference/
│       ├── deldot-borelog.html   # BoreLog companion app
│       └── … screenshots / icons
└── supabase/
    ├── schema.sql                # Canonical schema
    ├── migrations/               # Incremental SQL migrations
    ├── functions/send-report-email/  # Deno edge function
    ├── docs/production-rls-rollout.md
    └── scripts/bootstrap-production.mjs
```

There is **no root `package.json` bundler** for the main app. The browser loads the HTML file and CDN libraries (Supabase JS, Mapbox, QR, html2pdf, fonts).

---

## 4. Runtime stack (how a session boots)

1. User opens `https://m3nos95.github.io/geotrack/` → `index.html` redirects to `deldot-sampletrack.html`.
2. Page loads CSS design system + JS globals (`APP_BUILD`, Supabase client helpers).
3. `checkAppBuildUpdate()` compares `APP_BUILD` to `localStorage.st_app_build`. On mismatch it force-reloads with `?_b=<build>` so techs do not stay on a stale cached shell.
4. An optional **service worker** caches CDN script assets under `labtrak-v1` so libraries still load offline.
5. Supabase URL + anon key are read from Settings / `localStorage` (with HTML defaults).
6. Auth restores session (or shows sign-in). Role determines home hub and rail items.
7. Online: pull projects/samples/etc. Offline: serve caches; queue writes until connectivity returns.

---

## 5. User interface system

### 5.1 Design system

CSS custom properties on `:root` define colors (`--bg`, `--surface`, `--accent`, status greens/reds), typography (`--mono`, `--sans`, `--display`), and radii/shadows.

**Skins** (`st_app_skin`): `deldot` (default), `light`, `midnight`, `slate`, plus a hidden Konami `retro` skin.

**Comfort mode** (`labtrak_comfort_mode`): larger type and calmer motion for readability in the lab/truck.

### 5.2 Navigation model

The left **rail** shows role-appropriate modules. `switchView(name)` shows `#name-view`.

| View name | Purpose |
|-----------|---------|
| `home` | Admin / section-admin dashboard and module cards |
| `fieldhub` | Field technician home |
| `labhub` | Lab technician home |
| `conchub` | Concrete technician home |
| `fieldcontrol` | Field event entry (density / lab / core / proctor / FOC) |
| `soillab` | Soil & aggregate lab queue and test entry |
| `concrete` | Concrete cylinder workflow |
| `labarrival` | Bag arrival / receive-by-QR |
| `scan` | Standalone QR scanner |
| `projects` | Contracts / projects |
| `dashboard` | Sample list + calendar notes |
| `appsources` | Approved sources chart |
| `labmap` | Admin statewide map |
| `report` | Report preview / approve surface |
| `r18` | AASHTO R-18 compliance submodule |
| `hotmix` / `precast` / `chemlab` | Planned stubs (“coming soon”) |

Mobile nav mirrors the rail for phone use.

### 5.3 Guided Mode (accessibility for less tech-savvy users)

Optional coaches (off by default):

- **Concrete Guided Mode** — step dock, pulse highlight, Next/Back/Turn off
- **Field Control Guided Mode** — same pattern for field events, proctor, FOC, etc.

**Voice-to-text (Guided Mode only):** tap a field → **Speak** → say the value (e.g. “four” for slump). Uses the browser Web Speech API (Chrome / Edge / Safari + mic permission).

---

## 6. Roles and authentication

### 6.1 Roles

| Role | Typical home | Access focus |
|------|--------------|--------------|
| `admin` | `home` | Everything, including Lab Map, projects, user provision |
| `section_admin` | `home` | Scoped by `restricted_hubs` |
| `field` | `fieldhub` | Field Control, arrival, scan, projects, R-18 |
| `lab` | `labhub` | Soil lab, arrival, dashboard, projects, R-18 |
| `concrete` | `conchub` | Concrete module, projects, R-18 |

Profile flags include `can_approve_reports` and optional `assigned_tech_ids` for approver scoping. Custom teams can extend hub access.

### 6.2 Sign-in modes (`labtrak_auth_mode`)

| Mode | Behavior |
|------|----------|
| **Required** | Supabase Auth email/password (production default) |
| **Auto** | PIN/legacy until anon RLS probe fails, then Auth |
| **Legacy** | PIN tiles (development; being phased out) |

Optional second factor: PIN on linked `st_users` after Auth login.

### 6.3 Why Supabase Auth is needed

- Shared identity across devices (not just a local PIN list)
- Server-side **Row Level Security** can key off `auth.uid()`
- Admin can **Provision sign-in** and link Auth users to LabTrak profiles (`st_user_profiles`)
- Production rollout documented in `supabase/docs/production-rls-rollout.md`

---

## 7. Backend: Supabase

### 7.1 What Supabase provides

| Service | Used for |
|---------|----------|
| **Postgres** | Projects, samples, field tests, cores, concrete sets, sources, BoreLog, R-18, history |
| **Auth** | Email/password users + sessions |
| **RLS policies** | Role-scoped read/write; soft-delete; append-only history in production |
| **Edge Functions** | `send-report-email` (Gmail SMTP + PDF attachment) |
| **Migrations** | Versioned schema evolution in `supabase/migrations/` |

**Not used today:** Supabase Realtime channels, Supabase Storage buckets (core photos are JSONB on `core_drills`).

### 7.2 Core operational tables

| Table | Purpose |
|-------|---------|
| `projects` | Contracts / jobs (distribution lists, metadata) |
| `samples` | Central lab/field sample records + `lab_data` / `nuclear_data` / `density_data` JSON |
| `field_tests` | Density-centric field sessions (intent, workflow) |
| `core_drills` | Pavement cores (GPS, thickness, photos) |
| `concrete_sets` | Concrete pours / cylinder sets |
| `approved_sources` | Stockpile / approved source chart |
| `sample_history` | Audit trail of sample changes |
| `st_users` / `st_user_profiles` | App users + Auth linkage |
| `st_cal_notes` / `st_hub_notes` | Calendar / hub notes |
| `lab_spec_config` | Lab sieve/spec configuration |

### 7.3 BoreLog tables

`borelog_projects`, `borelog_borings`, `borelog_samples` — synced from the companion BoreLog app.

### 7.4 R-18 tables

`r18_labs`, `r18_sections`, `r18_revisions`, `r18_equipment`, `r18_reports`, `r18_users`, `r18_trainings`, `r18_procedures`, `r18_procedure_records`.

### 7.5 Edge function: `send-report-email`

1. LabTrak generates a PDF in-browser (`html2pdf`).
2. Client calls `db.functions.invoke('send-report-email', { body })` with PDF base64 + metadata.
3. Deno function sends via Gmail SMTP (`GMAIL_USER` / `GMAIL_APP_PASSWORD` secrets, or credentials passed from Settings).

**Why:** Browsers cannot reliably send authenticated SMTP mail alone; the edge function is the outbound mail gateway.

### 7.6 Credentials in the browser

| Config | Storage |
|--------|---------|
| Supabase URL | `labtrak_sb_url` |
| Anon key | `labtrak_sb_anon_key` |
| Auth mode | `labtrak_auth_mode` |
| Gmail (optional client-side) | `sl_gmail_from`, `sl_gmail_app_password` |

Defaults can ship in the HTML Settings form; production should use project-specific keys and dashboard secrets for the edge function. The **anon key is public by design**; security relies on **RLS**, not hiding the anon key.

---

## 8. Deployment: GitHub → GitHub Pages

### 8.1 Pipeline

Workflow: `.github/workflows/deploy-pages.yml`

1. **Trigger:** push to `main` or manual `workflow_dispatch`
2. **Build:** `rsync` repo into `_site` (excludes `.git`, `node_modules`, `.github`)
3. **Deploy:** `actions/upload-pages-artifact` → `actions/deploy-pages`
4. **Result:** site at `https://m3nos95.github.io/geotrack/`

### 8.2 Why GitHub is needed

- Source of truth for every feature PR
- Reviewable history (who changed Proctor, FOC, auth, etc.)
- Automated publish — no separate FTP/server deploy step
- Issues/PRs as the change-management surface for LabTrak

### 8.3 Cache busting

`APP_BUILD` (e.g. `2026.07.17-guided-voice`) is bumped when behavior changes. Clients that still have an old shell are prompted to reload so field tablets do not run mixed old/new JS against new expectations.

---

## 9. Offline and sync

Field work cannot depend on continuous LTE.

| Mechanism | Behavior |
|-----------|----------|
| CDN service worker | Keeps library scripts available offline |
| Cached samples/projects | `labtrak_cached_samples`, `labtrak_cached_projects` |
| Generic write queue | `labtrak_offline_queue` via `dbWrite()` when offline/fail |
| History queue | `labtrak_history_queue` → `sample_history` |
| Concrete queue | `st_concrete_sync_queue` + local `deldot_concrete_sets` |
| BoreLog | IndexedDB `deldot_borelog` + sync queue / tombstones |
| Sync chip | Shows connected / offline / pending; click flushes queues |

When the browser fires `online`, LabTrak attempts automatic sync. Soft-deleted or temporary `OFFLINE_*` ids are cleaned before replay.

---

## 10. Feature encyclopedia (processes)

### 10.1 Projects

**Who:** admin / section_admin  
**Process:** Create/edit contracts; soft-delete with `deleted_at`. Projects anchor distribution lists for report email and organize map pins.

### 10.2 Field Hub

Field home: KPIs, recent samples, calendar/hub notes, shortcuts.

**Top actions (current):** New Test, Lab Arrival, Proctor, Family of Curves, Guided Mode.  
(Core Drill / Scan / LB-68 / Nuclear hub shortcuts were removed to reduce clutter; those flows remain inside Field Control.)

### 10.3 Field Control — Field Event

**Intent picker**

| Intent | Creates | Tabs shown |
|--------|---------|------------|
| Density | `field_tests` density session | LB-68, Nuclear |
| Lab Sample | `samples` lab bag only | Lab Sample |
| Both | Linked field test + sample | LB-68, Nuclear, Lab Sample |

**Header:** Soil vs Aggregate, test number (shared counters), contract, location, material, tech, road, date → **Start Field Event**.

**LB-68 process**

1. Open LB-68 form from the session tab.
2. Enter one-point / density summary data (T-272 family support via curve picker).
3. Save into session `density_data` JSON.

**Nuclear (DMF-68C) process**

1. Open Nuclear tab / form.
2. Enter gauge shots and derived fields → `nuclear_data`.
3. Optional Chart/Auto Family of Curves pick for one-point moisture window (80–100% of OMC “spine”).
4. Lab sample toggle if a bag was pulled.

**Lab sample process**

1. Fill bag metadata + GPS as needed.
2. Submit → QR label for the bag.
3. Later: Lab Arrival receives; Soil Lab tests; approval/email.

**Session management:** Open sessions list, resume by test number, End Session on banner. Closed density tests list supports filter/refresh.

### 10.4 Core Drill

Separate from density/lab intent cards.

1. Enter core number + header → **Start Core Drill Session**.
2. Log each core: layer, thickness, GPS, photo.
3. Persists to `core_drills` (and related field workflow flags).
4. Cores appear on maps when GPS present.

### 10.5 Proctor module

Full compaction worksheet (not just a chart picker):

1. Metadata: name, contract, material, curve #, AASHTO T-99/T-180 method, Gs, ZAV Gs.
2. Sieve % oversize / #200; bulk SG for oversize correction (AASHTO T 224 style).
3. Six-point grid: mold + soil, mold, volume → **wet density**; moisture cans → **moisture %** and **corrected dry density**.
4. Peak via 3-point parabola; chart via **cubic spline** (report-style curve + OMC/MDD callout).
5. Save Draft / Mark Complete.
6. On complete → prompt to add to a Family of Curves.
7. Stored locally: `labtrak_proctors_v1`.

### 10.6 Family of Curves (user library)

1. Create a family or add from the complete-proctor prompt (appends to existing family; does not silently spawn duplicates).
2. Add/remove completed proctors as curves.
3. Chart shows only the **80–100% OMC spine** of each curve (smooth sampler).
4. Stored locally: `labtrak_curve_families_v1`.
5. Built-in T-99 FOC picker remains available for classic one-point field densification work.

### 10.7 Lab Arrival

1. Scan QR or type test number.
2. Mark bag received (`date_received` / arrival metadata).
3. Feeds the soil lab queue so received samples are ready for testing.

### 10.8 QR Scan

Standalone and in-module **QR** scanning via `html5-qrcode` (not OCR). Used to jump to the correct sample/test without typing long numbers.

### 10.9 Soil Lab

**Queue:** Filter by status (`pending` / `approval` / `archive`), category (soil/agg), scope (all/mine).

**Typical lab process**

1. Open sample from queue.
2. Enter applicable tests (Atterberg LL/PL, organics, sieve nests, aggregate gradation, etc.).
3. Specs/sieves driven by `lab_spec_config` / local `labtrak_lab_specs`.
4. Generate PDF report.
5. Send to approval (`dist_status` workflow).
6. Approver with `can_approve_reports` approves or rejects.
7. On approve: optional email PDF to project distribution; may sync material into Approved Sources.

### 10.10 Concrete

**Hub:** due pours / schedule shortcuts.

**Process**

1. **Intake** — job, GPS, fresh properties (slump, air, unit weight, temps), materials, cylinder ages.
2. **Cylinder log** — track specimens.
3. **Break schedule** — ages due (7/14/28/56/custom).
4. **Break entry** — record strengths.
5. **Report** — PDF export / distribution path.

Data: local `deldot_concrete_sets` with cloud upsert to `concrete_sets` and offline queue `st_concrete_sync_queue`.  
Guided Mode + Speak available for intake fields.

### 10.11 Approved Sources

Stockpile / source chart for materials. Can be maintained manually or synced from approved lab samples. Materials list cached in `src_materials`.

### 10.12 Dashboard & calendar

Cross-cutting sample list and calendar/hub notes (`st_cal_notes` / `st_hub_notes`) for scheduling and reminders.

### 10.13 Lab Map (admin)

Mapbox map of cores, samples, concrete GPS, boreholes. Style toggle (streets/satellite/dark). Used for spatial oversight, not day-to-day bag entry.

### 10.14 BoreLog (companion)

Opened from Lab Hub via `openBoreLog()` with context in `sessionStorage`.

- Standalone `docs/r18-reference/deldot-borelog.html`
- Local-first IndexedDB store + sync/tombstone queues
- Cloud sync to `borelog_*` tables
- **3D site view:** Three.js columns, DEM/imagery layers, geospatial helpers
- Map pins / GPS alignment for borings

**Why separate file:** BoreLog’s 3D/geo stack is heavy; isolating it keeps the main LabTrak SPA lighter while sharing Supabase.

### 10.15 R-18 Compliance

In-app QMS submodule aligned with AASHTO R-18:

- Lab setup / quality manual sections
- Equipment inventory & calibration due tracking
- Procedures and procedure records
- Training / evaluations
- Reports export

Backed by `r18_*` tables through an `R18SupabaseRepository` pattern in the SPA.

### 10.16 Reports, approval, email

1. Lab completes data → PDF generated client-side.
2. Status moves toward approval queue.
3. Approver reviews on report/approval UI.
4. Email edge function delivers PDF to project contacts.
5. `sample_history` / audit tables record meaningful changes when online (queued when offline).

### 10.17 Settings

- Supabase URL / anon key / Auth mode
- User provision (admin)
- Gmail auto-email credentials
- Guided Mode toggles
- Skins, comfort mode
- Data maintenance / sync tools

### 10.18 Planned modules

Hot Mix, Pre-Cast, Chem Lab — rail placeholders only; not implemented workflows yet.

---

## 11. Data flow diagrams (conceptual)

### 11.1 Field sample → lab → email

```
Field Control (lab or both)
    → samples (+ optional field_tests)
    → QR on bag
Lab Arrival (scan / test no)
    → date_received
Soil Lab queue
    → lab_data tests + PDF
Approval (can_approve_reports)
    → dist_status approved
Edge Function send-report-email
    → Gmail → project distribution list
```

### 11.2 Density-only field event

```
Field Control intent = density
    → field_tests row
LB-68 and/or Nuclear forms
    → density_data / nuclear_data JSON
Optional FOC picker (T-99 library)
End session → closed density list
```

### 11.3 Proctor → Family of Curves

```
Proctor worksheet (local)
    → Mark Complete
Prompt: add to existing/new family
Family of Curves screen
    → multi-curve 80–100% spine chart
```

### 11.4 Offline write

```
UI save
    → dbWrite()
    → network fail / offline?
         yes → labtrak_offline_queue
         no  → Supabase table
Later online → offlineSync() replay
```

---

## 12. Security model (production intent)

1. **Browser holds anon key** — expected for Supabase SPAs.
2. **RLS** blocks anonymous abuse; authenticated role policies govern reads/writes.
3. Soft-delete preferred over hard delete for samples/projects.
4. `sample_history` treated as append-only under production policies.
5. Gmail app passwords prefer **Edge Function secrets**; client Settings storage is a convenience fallback.
6. Rollout steps: create Auth users → link `st_user_profiles` → set Auth mode Required → apply `20260617_production_rls.sql` → verify by role.

See `supabase/docs/production-rls-rollout.md` and `supabase/scripts/bootstrap-production.mjs`.

---

## 13. External dependencies (CDN)

| Library | Role |
|---------|------|
| `@supabase/supabase-js` | DB + Auth client |
| Mapbox GL JS | Maps |
| html5-qrcode | QR scanning |
| html2pdf.js | Client PDF generation |
| Google Fonts | Typography |
| Tailwind CDN (partial) | Utility assist in some screens |
| Three.js (BoreLog) | 3D site view |

---

## 14. Local persistence keys (quick reference)

| Key | Purpose |
|-----|---------|
| `labtrak_sb_url` / `labtrak_sb_anon_key` | Connection |
| `labtrak_auth_mode` | Sign-in mode |
| `st_app_build` | Cache-bust stamp |
| `st_app_skin` / `labtrak_comfort_mode` | UI preferences |
| `labtrak_cached_samples` / `labtrak_cached_projects` | Offline reads |
| `labtrak_offline_queue` | Pending DB writes |
| `labtrak_history_queue` | Pending history rows |
| `deldot_concrete_sets` / `st_concrete_sync_queue` | Concrete |
| `labtrak_proctors_v1` / `labtrak_curve_families_v1` | Proctor / FOC |
| `labtrak_lab_specs` | Lab specs cache |
| `labtrak_field_guided` / `labtrak_concrete_guided` | Guided Mode flags |
| `sl_gmail_*` | Optional client email creds |
| IndexedDB `deldot_borelog` | BoreLog store |

---

## 15. Operational checklist for a new environment

1. Create a Supabase project; run `schema.sql` + needed migrations.
2. Deploy / configure Edge Function `send-report-email` + Gmail secrets.
3. Create Auth users; link `st_user_profiles` (or run bootstrap script).
4. Apply production RLS when ready.
5. Point LabTrak Settings at the project URL + anon key; set Auth mode **Required**.
6. Ensure GitHub Pages is enabled; merge to `main` to publish.
7. Smoke-test by role: field session, lab arrival, soil lab save, concrete intake, report email, BoreLog open/sync, R-18 load.

---

## 16. Glossary

| Term | Meaning |
|------|---------|
| **LB-68** | DelDOT field density summary / one-point compaction worksheet |
| **DMF-68C** | Nuclear density worksheet |
| **FOC** | Family of Curves (compaction curve family; spine = 80–100% OMC) |
| **OMC / MDD** | Optimum moisture content / maximum dry density |
| **RLS** | Postgres Row Level Security |
| **SPA** | Single-page application |
| **APP_BUILD** | Client build stamp for forced refresh |

---

## 17. Document control

| Item | Value |
|------|-------|
| Scope | LabTrak / Geotrack as of merge containing Guided Mode voice (`APP_BUILD` guided-voice era) |
| Source of truth | GitHub `main` + Supabase migrations |
| Not in scope | Unimplemented Hot Mix / Pre-Cast / Chem Lab workflows; OCR (QR only) |

For schema details, read `supabase/schema.sql` and `supabase/migrations/`.  
For auth lockdown, read `supabase/docs/production-rls-rollout.md`.

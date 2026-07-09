# AGENTS.md

## Cursor Cloud specific instructions

### What this project is
DelDOT LabTrak is a Laboratory Information Management System (LIMS). The entire
frontend is a single self-contained static file, `deldot-sampletrack.html`
(~22k lines, vanilla JS, no build step). The backend is Supabase
(Postgres + Auth + Edge Functions). There is no test suite, no bundler, and no
root `package.json`. The only npm package is `supabase/scripts/` (an admin
provisioning script).

### Services and how to run them
- **Local Supabase stack** (Docker-based, started via the Supabase CLI). The
  Docker engine and the `supabase`/`supabase-go` binaries are pre-installed in
  the VM snapshot. They are NOT installed by the update script.
  - Start the Docker daemon if it is not running: `sudo dockerd` (run it in a
    tmux/background session; it must stay running). Confirm with `docker info`.
    If you get a socket permission error, `sudo chmod 666 /var/run/docker.sock`.
  - Start Supabase: `supabase start` (from repo root). First run pulls images.
    It prints the local `API_URL` (http://127.0.0.1:54321), `ANON_KEY`,
    Studio URL (http://127.0.0.1:54323), and DB connection info.
- **Static web server** for the HTML app, e.g.
  `python3 -m http.server 8080` from the repo root, then open
  `http://127.0.0.1:8080/deldot-sampletrack.html`.

### Database setup (non-obvious — required for the app to work locally)
- `supabase/config.toml` sets `[db.migrations] enabled = false` on purpose. The
  repo `supabase/migrations/` contain the PRODUCTION RLS lockdown which requires
  Supabase Auth and blocks anonymous access. The dev workflow instead uses
  `supabase/schema.sql`, which creates the tables with OPEN dev RLS policies.
- After `supabase start`, load the dev schema:
  `docker exec -i supabase_db_workspace psql -U postgres -d postgres < supabase/schema.sql`
- `schema.sql` enables RLS with open `USING (true)` policies but does NOT grant
  table privileges to the `anon`/`authenticated` roles (hosted Supabase grants
  these via default privileges; a fresh local DB does not). Grant them once:
  ```sql
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
  ```
- To test PRODUCTION RLS instead, set `[db.migrations] enabled = true`, run
  `supabase db reset`, and provision Supabase Auth users
  (`supabase/scripts/bootstrap-production.mjs`).

### Connecting the app to local Supabase
On the setup overlay (first load), set Project URL to `http://127.0.0.1:54321`,
paste the local `ANON_KEY` from `supabase start`, set Sign-in mode to
**Legacy — PIN tiles only (development)**, then Connect. On first connect the
app auto-seeds a `default-admin` user with an empty PIN, so you can enter
straight away. Credentials are stored in browser localStorage only.

### Known schema drift (gotcha)
The app's New Project form (`saveProject`) writes columns `project_manager`,
`email_distribution`, and `track_sources` that are NOT in the committed
`supabase/schema.sql` or any committed migration. So creating a project via the
UI fails against a DB built from `schema.sql` ("Could not find the ... column").
Creating a **Sample** (Soil & Agg lab -> "+ NEW SAMPLE") works cleanly with the
committed schema and is a good smoke-test of the full stack. Do not "fix" this
by editing committed SQL unless that is the actual task.

### Optional services (not needed to run/test the core app)
- `labtrak-ai` Edge Function (AI form reading) needs `ANTHROPIC_API_KEY`.
- Report emailing needs a separately-deployed `send-report-email` function with
  Gmail credentials (not in this repo).
- `supabase/scripts/bootstrap-production.mjs` is admin provisioning only.

### Notes
- The frontend loads `supabase-js`, `qrcode`, `html5-qrcode`, and `html2pdf`
  from CDNs at runtime, so the browser needs internet access. The optional libs
  degrade gracefully offline, but supabase-js is required for DB connectivity.
- Editing `deldot-sampletrack.html` requires only a browser refresh (no build).

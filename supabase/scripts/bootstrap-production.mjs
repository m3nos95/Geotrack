#!/usr/bin/env node
/**
 * LabTrak production Auth + RLS bootstrap
 *
 * Requires (from Supabase Dashboard → Project Settings → API / Database):
 *   SUPABASE_URL                  https://xxxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY     service_role secret (never commit)
 *   SUPABASE_DB_URL               postgresql://postgres.[ref]:[password]@...  (for SQL migrations)
 *
 * Optional:
 *   LABTRAK_AUTH_EMAIL_DOMAIN     default: delaware.gov
 *   LABTRAK_TEMP_PASSWORD         default: generated per user, printed to stdout
 *   APPLY_RLS                     set to 1 to run 20260617_production_rls.sql after profiles
 *   DRY_RUN                       set to 1 to print planned actions only
 *
 * Usage:
 *   cd supabase/scripts && npm install
 *   SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_DB_URL=... node bootstrap-production.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qlwaqdlldldyoshyglmu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;
const EMAIL_DOMAIN = process.env.LABTRAK_AUTH_EMAIL_DOMAIN || 'delaware.gov';
const SHARED_PASSWORD = process.env.LABTRAK_TEMP_PASSWORD;
const DRY_RUN = process.env.DRY_RUN === '1';
const APPLY_RLS = process.env.APPLY_RLS === '1';

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Supabase Dashboard → Project Settings → API → service_role (secret)');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function slugEmail(name, id) {
  if (id === 'default-admin') return `labtrak.admin@${EMAIL_DOMAIN}`;
  const parts = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}.${parts[parts.length - 1]}@${EMAIL_DOMAIN}`;
  return `${parts[0] || 'user'}.${id.slice(-6)}@${EMAIL_DOMAIN}`;
}

function tempPassword(id) {
  if (SHARED_PASSWORD) return SHARED_PASSWORD;
  const tail = id.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'LabTrak';
  return `Lt-${tail}-2026!`;
}

async function ensureProfilesTable() {
  if (!DB_URL) {
    console.warn('No SUPABASE_DB_URL — skipping SQL. Run supabase/schema.sql (st_user_profiles section) in SQL Editor first.');
    return;
  }
  const sql = readFileSync(join(ROOT, 'migrations', '20260617_prep_profiles_table.sql'), 'utf8');
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('✓ st_user_profiles table ready');
  } finally {
    await client.end();
  }
}

async function applyRlsMigration() {
  if (!APPLY_RLS) {
    console.log('Skipping RLS migration (set APPLY_RLS=1 to apply).');
    return;
  }
  if (!DB_URL) {
    console.error('APPLY_RLS=1 requires SUPABASE_DB_URL.');
    process.exit(1);
  }
  const sql = readFileSync(join(ROOT, 'migrations', '20260617_production_rls.sql'), 'utf8');
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('✓ Production RLS migration applied');
  } finally {
    await client.end();
  }
}

async function listExistingAuthByEmail() {
  const map = new Map();
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email) map.set(u.email.toLowerCase(), u.id);
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return map;
}

async function main() {
  console.log('LabTrak production bootstrap');
  console.log('Project:', SUPABASE_URL);
  if (DRY_RUN) console.log('DRY RUN — no writes\n');

  const { data: stUsers, error: usersErr } = await admin.from('st_users').select('id,name,role,can_approve_reports').order('created_at');
  if (usersErr) throw usersErr;
  console.log(`Found ${stUsers.length} st_users rows\n`);

  if (!DRY_RUN) await ensureProfilesTable();

  const authByEmail = DRY_RUN ? new Map() : await listExistingAuthByEmail();
  const credentials = [];

  for (const u of stUsers) {
    const email = slugEmail(u.name, u.id);
    const password = tempPassword(u.id);
    const canApprove = !!(u.can_approve_reports || u.role === 'admin');

    let authUserId = authByEmail.get(email.toLowerCase());

    if (!authUserId) {
      console.log(`+ Auth user: ${email} (${u.name}, ${u.role})`);
      if (!DRY_RUN) {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { labtrak_app_user_id: u.id, display_name: u.name },
        });
        if (error) {
          console.error(`  ✗ ${email}: ${error.message}`);
          continue;
        }
        authUserId = data.user.id;
        authByEmail.set(email.toLowerCase(), authUserId);
      }
    } else {
      console.log(`= Auth exists: ${email}`);
    }

    if (!DRY_RUN && authUserId) {
      const { error: pErr } = await admin.from('st_user_profiles').upsert({
        auth_user_id: authUserId,
        app_user_id: u.id,
        display_name: u.name,
        role: u.role,
        can_approve_reports: canApprove,
        active: true,
      }, { onConflict: 'auth_user_id' });
      if (pErr) {
        console.error(`  ✗ profile ${u.name}: ${pErr.message}`);
        continue;
      }
      console.log(`  ✓ profile linked`);
    }

    credentials.push({ name: u.name, email, password, role: u.role, app_user_id: u.id });
  }

  if (!DRY_RUN) await applyRlsMigration();

  console.log('\n── Sign-in credentials (distribute securely, users should change passwords) ──');
  console.log('Email domain:', EMAIL_DOMAIN);
  for (const c of credentials) {
    console.log(`${c.name}\t${c.email}\t${c.password}\t${c.role}`);
  }
  console.log('\nApp: Settings → Supabase Auth → set mode to Required (or redeploy with default required).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

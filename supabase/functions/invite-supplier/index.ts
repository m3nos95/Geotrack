import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FALLBACK_REDIRECT =
  "https://m3nos95.github.io/Geotrack/deldot-sampletrack.html";

const ROLE_SQL =
  "Run supabase/migrations/20261102_supplier_role.sql once in the Supabase SQL editor, then send the invite again.";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 200) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) return null;
  if (/[\u0000-\u001f]/.test(name)) return null;
  return name;
}

function initialsFor(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function safeRedirect(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return FALLBACK_REDIRECT;
  try {
    const url = new URL(raw.trim());
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const httpsPage = url.protocol === "https:" &&
      url.hostname === "m3nos95.github.io";
    const httpLocal = url.protocol === "http:" && local;
    if (!httpsPage && !httpLocal) return FALLBACK_REDIRECT;
    if (url.username || url.password) return FALLBACK_REDIRECT;
    return url.origin + url.pathname;
  } catch {
    return FALLBACK_REDIRECT;
  }
}

function appUserId(): string {
  return "sup_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

type AdminClient = ReturnType<typeof createClient>;

async function findUserByEmail(admin: AdminClient, email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const found = data.users.find((user) =>
      (user.email || "").toLowerCase() === email
    );
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

function alreadyRegistered(message: string): boolean {
  return /already registered|already exists|already been registered/i.test(
    message,
  );
}

function roleConstraint(message: string): boolean {
  return /st_user_profiles_role_check|check constraint/i.test(message);
}

async function upsertLabUser(
  admin: AdminClient,
  row: Record<string, unknown>,
) {
  let result = await admin.from("st_users").upsert(row, { onConflict: "id" });
  if (result.error && /assigned_tech_ids/i.test(result.error.message || "")) {
    const { assigned_tech_ids: _ignored, ...rest } = row;
    result = await admin.from("st_users").upsert(rest, { onConflict: "id" });
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST only" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({
      error: "Invite service is missing its Supabase credentials.",
    }, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Sign in with your admin email first." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const caller = userData?.user;
    if (userErr || !caller) {
      return jsonResponse({ error: "Sign in with your admin email first." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerProfile, error: callerErr } = await admin
      .from("st_user_profiles")
      .select("role, active")
      .eq("auth_user_id", caller.id)
      .maybeSingle();
    if (callerErr) {
      return jsonResponse({ error: callerErr.message }, 500);
    }
    if (!callerProfile || callerProfile.active === false ||
      callerProfile.role !== "admin") {
      return jsonResponse({ error: "Only an administrator can invite a supplier." }, 403);
    }

    const payload = await req.json().catch(() => null);
    const name = cleanName(payload?.name);
    const email = cleanEmail(payload?.email);
    if (!name || !email) {
      return jsonResponse({
        error: "Enter a plant name (at least 2 characters) and a valid email.",
      }, 400);
    }
    const redirectTo = safeRedirect(payload?.redirectTo);

    let authUser = await findUserByEmail(admin, email);
    let createdAuth = false;
    let resent = false;

    if (!authUser) {
      const invited = await admin.auth.admin.inviteUserByEmail(email, {
        data: { labtrak_role: "supplier", plant_name: name },
        redirectTo,
      });
      if (invited.error) {
        if (!alreadyRegistered(invited.error.message || "")) {
          const raw = invited.error.message || "Invite email failed.";
          const message = /rate limit/i.test(raw)
            ? "Supabase paused invite email for a little while. Wait and try again, or add custom SMTP under Authentication → Emails."
            : /redirect/i.test(raw)
            ? "Add https://m3nos95.github.io/Geotrack/** under Supabase Authentication → URL Configuration → Redirect URLs, then try again."
            : raw;
          return jsonResponse({ error: message }, 502);
        }
        authUser = await findUserByEmail(admin, email);
        if (!authUser) {
          return jsonResponse({
            error: invited.error.message || "That email is already registered.",
          }, 409);
        }
      } else {
        authUser = invited.data.user;
        createdAuth = true;
      }
    }

    if (!authUser) {
      return jsonResponse({ error: "Invite did not return a user." }, 502);
    }

    const { data: existingProfile, error: profileReadErr } = await admin
      .from("st_user_profiles")
      .select("role, app_user_id, active")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();
    if (profileReadErr) {
      if (createdAuth) await admin.auth.admin.deleteUser(authUser.id);
      return jsonResponse({ error: profileReadErr.message }, 500);
    }
    if (existingProfile && existingProfile.role &&
      existingProfile.role !== "supplier") {
      return jsonResponse({
        error: "That email already belongs to a LabTrak account (" +
          existingProfile.role + "). Use a different address for the plant.",
      }, 409);
    }

    let labUserId = existingProfile?.app_user_id || appUserId();
    const { data: existingLab, error: labReadErr } = await admin
      .from("st_users")
      .select("id, role, created_at, pin_hash, recovery, initials, color")
      .eq("id", labUserId)
      .maybeSingle();
    if (labReadErr) {
      if (createdAuth) await admin.auth.admin.deleteUser(authUser.id);
      return jsonResponse({ error: labReadErr.message }, 500);
    }
    if (existingLab && existingLab.role && existingLab.role !== "supplier") {
      labUserId = appUserId();
    }
    const labRow = existingLab && existingLab.role === "supplier" ? existingLab : null;

    const now = new Date().toISOString();
    const userRow = {
      id: labUserId,
      name,
      role: "supplier",
      pin_hash: labRow?.pin_hash ?? null,
      recovery: labRow?.recovery ?? "",
      initials: labRow?.initials || initialsFor(name),
      color: labRow?.color || "#d4a017",
      can_approve_reports: false,
      restricted_hubs: null,
      assigned_tech_ids: [],
      created_at: labRow?.created_at || now,
      updated_at: now,
    };
    const savedUser = await upsertLabUser(admin, userRow);
    if (savedUser.error) {
      if (createdAuth) await admin.auth.admin.deleteUser(authUser.id);
      return jsonResponse({ error: savedUser.error.message }, 500);
    }

    const profileRow = {
      auth_user_id: authUser.id,
      app_user_id: labUserId,
      display_name: name,
      role: "supplier",
      can_approve_reports: false,
      active: true,
    };
    const savedProfile = await admin
      .from("st_user_profiles")
      .upsert(profileRow, { onConflict: "auth_user_id" });
    if (savedProfile.error) {
      if (createdAuth) await admin.auth.admin.deleteUser(authUser.id);
      const message = roleConstraint(savedProfile.error.message || "")
        ? ROLE_SQL
        : savedProfile.error.message;
      return jsonResponse({ error: message }, 500);
    }

    if (!createdAuth) {
      const link = await admin.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      });
      if (link.error) {
        return jsonResponse({
          error: "The supplier account is saved, but the sign-in email failed: " +
            (link.error.message || "unknown error"),
          appUserId: labUserId,
        }, 502);
      }
      resent = true;
    }

    return jsonResponse({
      ok: true,
      email,
      name,
      appUserId: labUserId,
      authUserId: authUser.id,
      alreadyExisted: resent,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("invite-supplier error:", message);
    return jsonResponse({ error: message }, 500);
  }
});

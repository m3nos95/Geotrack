import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  subject: string;
  filename?: string;
  /** LabTrak PDF (legacy name). Prefer attachmentBase64 for non-PDF. */
  pdfBase64?: string;
  attachmentBase64?: string;
  contentType?: string;
  /** When set, used as the plain-text email body instead of the LabTrak template. */
  textBody?: string;
  gmailUser?: string;
  gmailAppPassword?: string;
  reportType?: string;
  contract?: string;
  testNo?: string;
  material?: string;
  location?: string;
  dateSampled?: string;
  dateTested?: string;
  result?: string;
  reportedBy?: string;
  road?: string;
  contractor?: string;
  projectManager?: string | null;
  sourceApp?: string;
}

function buildBody(data: EmailRequest): string {
  const lines = [
    `A ${data.reportType || "Lab Report"} has been completed in DelDOT LabTrak.`,
    "",
    `Contract:        ${data.contract || "—"}`,
    `Road / Project:  ${data.road || "—"}`,
    `Contractor:      ${data.contractor || "—"}`,
  ];
  if (data.projectManager) {
    lines.push(`Project Manager: ${data.projectManager}`);
  }
  lines.push(
    "",
    `Test No:      ${data.testNo || "—"}`,
    `Date Sampled: ${data.dateSampled || "—"}`,
    `Date Tested:  ${data.dateTested || "—"}`,
    `Material:     ${data.material || "—"}`,
    `Location:     ${data.location || "—"}`,
    "",
    `Result: ${data.result || "—"}`,
    "",
    `Reported by:  ${data.reportedBy || "—"}`,
    "",
    "─────────────────────────────────────────",
    "Automated notification from DelDOT LabTrak.",
    "The full report is attached as a PDF.",
  );
  return lines.join("\n");
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeGmailPass(pass: string): string {
  return pass.replace(/\s+/g, "");
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: EmailRequest = await req.json();
    const bodyUser = payload.gmailUser?.trim() || "";
    const bodyPass = normalizeGmailPass(payload.gmailAppPassword || "");
    const envUser = (Deno.env.get("GMAIL_USER") || "").trim();
    const envPass = normalizeGmailPass(Deno.env.get("GMAIL_APP_PASSWORD") || "");
    // Supabase secrets (original working setup) take priority; client fills gaps
    const gmailUser = envUser || bodyUser;
    const gmailPass = envPass || bodyPass;
    if (!gmailUser || !gmailPass) {
      return jsonResponse({
        error:
          "Gmail not configured. Add your Gmail address and app password in LabTrak Settings → Auto-Email (or GeoTrak Submit request), or set GMAIL_USER and GMAIL_APP_PASSWORD in Supabase Edge Function secrets.",
      }, 500);
    }

    const { to, subject, filename } = payload;
    const attachmentB64 = (payload.attachmentBase64 || payload.pdfBase64 || "")
      .trim();
    if (!to?.trim() || !subject?.trim() || !attachmentB64) {
      return jsonResponse({
        error:
          "Missing required fields: to, subject, and attachmentBase64 (or pdfBase64)",
      }, 400);
    }

    const recipients = to.split(",").map((e) => e.trim()).filter(Boolean);
    if (!recipients.length) {
      return jsonResponse({ error: "No valid recipient addresses in to" }, 400);
    }

    const fileBytes = decodeBase64(attachmentB64);
    const contentType = (payload.contentType || "application/pdf").trim() ||
      "application/pdf";
    const defaultName = contentType.includes("sheet") ||
        contentType.includes("excel") || /\.xlsx$/i.test(filename || "")
      ? "attachment.xlsx"
      : contentType.includes("csv")
      ? "attachment.csv"
      : "report.pdf";
    const emailContent = (payload.textBody && payload.textBody.trim())
      ? payload.textBody.trim()
      : buildBody(payload);

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: gmailUser,
          password: gmailPass,
        },
      },
    });

    await client.send({
      from: gmailUser,
      to: recipients,
      subject,
      content: emailContent,
      attachments: [
        {
          filename: filename || defaultName,
          content: fileBytes,
          encoding: "binary",
          contentType,
        },
      ],
    });

    await client.close();

    return jsonResponse({
      ok: true,
      sent: recipients.length,
      sourceApp: payload.sourceApp || null,
    });
  } catch (e) {
    console.error("send-report-email error:", e);
    let message = e instanceof Error ? e.message : String(e);
    if (/535|badcredentials|username and password not accepted/i.test(message)) {
      message =
        "Gmail rejected the app password. Generate a new App Password at myaccount.google.com → Security → App Passwords (not your normal Gmail password), then save it in LabTrak Settings → Auto-Email or GeoTrak Submit request.";
    }
    return jsonResponse({ error: message }, 500);
  }
});

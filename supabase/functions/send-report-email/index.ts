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
  pdfBase64: string;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const gmailUser = Deno.env.get("GMAIL_USER");
    const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD");
    if (!gmailUser || !gmailPass) {
      return jsonResponse({
        error:
          "Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in Supabase Edge Function secrets.",
      }, 500);
    }

    const payload: EmailRequest = await req.json();
    const { to, subject, filename, pdfBase64 } = payload;
    if (!to?.trim() || !subject?.trim() || !pdfBase64?.trim()) {
      return jsonResponse({
        error: "Missing required fields: to, subject, pdfBase64",
      }, 400);
    }

    const recipients = to.split(",").map((e) => e.trim()).filter(Boolean);
    if (!recipients.length) {
      return jsonResponse({ error: "No valid recipient addresses in to" }, 400);
    }

    const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));

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
      content: buildBody(payload),
      attachments: [
        {
          filename: filename || "report.pdf",
          content: pdfBytes,
          encoding: "binary",
          contentType: "application/pdf",
        },
      ],
    });

    await client.close();

    return jsonResponse({ ok: true, sent: recipients.length });
  } catch (e) {
    console.error("send-report-email error:", e);
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: message }, 500);
  }
});

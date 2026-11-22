import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BodySchema = z.object({
  scan_token: z.string().min(1).max(128),
  channel: z.enum(["whatsapp", "sms"]).default("sms"),
  phone: z.string().trim().min(6).max(40).optional(),
});

function hashCode(code: string, salt: string): string {
  return crypto.createHmac("sha256", salt).update(code).digest("hex");
}

/**
 * Normalize an Israeli phone number to E.164 (+972…). Falls back to
 * returning the raw digits with a leading "+" if it doesn't look Israeli,
 * so non-IL numbers still get delivered by Make/Twilio.
 */
function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  // Already in +972 form (e.g. 972542341099)
  if (d.startsWith("972")) return `+${d}`;
  // Local Israeli format: 05XXXXXXXX → +9725XXXXXXXX
  if (d.startsWith("0")) {
    d = d.slice(1);
    return `+972${d}`;
  }
  // Bare 9-digit mobile (5XXXXXXXX) → assume IL
  if (/^5\d{8}$/.test(d)) return `+972${d}`;
  return `+${d}`;
}

/**
 * Returns true for phone numbers that should NEVER trigger a real SMS —
 * developer/test numbers. These accept the fixed test code "1234" so the
 * team can run end-to-end onboarding against real merchant websites
 * without accidentally spamming the actual business owner.
 *
 * Configure additional whitelisted numbers via the comma-separated env
 * var `TEST_PHONES` (digits only, any format).
 */
function isTestPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const d = phone.replace(/\D/g, "");
  if (!d) return false;
  // Built-in sentinels: all-zero suffix numbers used in seed/demo data.
  if (/^0?5\d0{7}$/.test(d)) return true; // e.g. 0500000000
  if (/^0+$/.test(d)) return true;
  const env = process.env.TEST_PHONES;
  if (env) {
    const list = env.split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean);
    if (list.includes(d)) return true;
    // Also match by last-9 to be format-agnostic (+972 vs 0…).
    const tail = d.slice(-9);
    if (list.some((p) => p.slice(-9) === tail)) return true;
  }
  return false;
}

export const Route = createFileRoute("/api/public/send-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response("invalid_json", { status: 400 });
        }
        const parsed = BodySchema.safeParse(payload);
        if (!parsed.success) {
          return Response.json({ error: "invalid_input" }, { status: 400 });
        }

        const { scan_token, channel } = parsed.data;

        const { data: row, error: fetchErr } = await supabaseAdmin
          .from("lead_scans")
          .select("id, otp_expires_at, requested_phone, discovered_phone")
          .eq("scan_token", scan_token)
          .maybeSingle();
        if (fetchErr) {
          console.error("send-otp: fetch failed", fetchErr);
          return Response.json({ error: "db_error" }, { status: 500 });
        }
        if (!row) {
          return Response.json({ error: "scan_not_found" }, { status: 404 });
        }

        // Rate-limit: don't resend faster than every 30s.
        if (row.otp_expires_at) {
          const ageMs =
            5 * 60_000 - (new Date(row.otp_expires_at).getTime() - Date.now());
          if (ageMs >= 0 && ageMs < 30_000) {
            return Response.json({ error: "rate_limited" }, { status: 429 });
          }
        }

        const code = String(Math.floor(1000 + Math.random() * 9000));
        const salt = process.env.MAKE_INBOUND_SECRET || "fallback-otp-salt";
        const phone =
          parsed.data.phone ?? row.requested_phone ?? row.discovered_phone ?? null;
        const testMode = isTestPhone(phone);
        // In test mode, lock the accepted code to "1234" (never dispatched).
        const effectiveCode = testMode ? "1234" : code;
        const otp_code_hash = hashCode(effectiveCode, salt);
        const otp_expires_at = new Date(Date.now() + 10 * 60_000).toISOString();

        const { error: upErr } = await supabaseAdmin
          .from("lead_scans")
          .update({ otp_code_hash, otp_expires_at })
          .eq("scan_token", scan_token);
        if (upErr) {
          console.error("send-otp: update failed", upErr);
          return Response.json({ error: "db_error" }, { status: 500 });
        }

        const otpWebhook = process.env.MAKE_OTP_WEBHOOK_URL;
        if (testMode) {
          console.warn("send-otp: test phone detected — bypassing SMS dispatch", { phone });
          return Response.json({ ok: true, test_mode: true, expires_at: otp_expires_at });
        }
        const phoneE164 = toE164(phone);
        let dispatch: { ok: boolean; status?: number; body?: string; error?: string } = { ok: false };
        if (otpWebhook && phoneE164) {
          try {
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
            };
            const tok = process.env.MAKE_OUTBOUND_TOKEN;
            if (tok) headers.Authorization = `Bearer ${tok}`;
            const res = await fetch(otpWebhook, {
              method: "POST",
              headers,
              body: JSON.stringify({
                scan_token,
                phone: phoneE164,
                phone_raw: phone,
                code,
                channel,
              }),
            });
            const text = await res.text().catch(() => "");
            dispatch = { ok: res.ok, status: res.status, body: text.slice(0, 300) };
            console.log("send-otp: dispatch", {
              status: res.status,
              ok: res.ok,
              phone: phoneE164,
              channel,
              body: text.slice(0, 200),
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            dispatch = { ok: false, error: message };
            console.error("send-otp: dispatch failed", message);
          }
        } else {
          console.warn(
            "send-otp: MAKE_OTP_WEBHOOK_URL not configured or phone missing; OTP stored but not dispatched",
            { hasWebhook: Boolean(otpWebhook), phone, phoneE164 },
          );
        }

        return Response.json({
          ok: true,
          expires_at: otp_expires_at,
          dispatch,
        });
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BodySchema = z.object({
  scan_token: z.string().min(1).max(128),
  code: z.string().regex(/^\d{4,6}$/),
});

function hashCode(code: string, salt: string): string {
  return crypto.createHmac("sha256", salt).update(code).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length === 0 || ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/verify-otp")({
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

        const { scan_token, code } = parsed.data;

        const { data: row, error } = await supabaseAdmin
          .from("lead_scans")
          .select("id, otp_code_hash, otp_expires_at")
          .eq("scan_token", scan_token)
          .maybeSingle();
        if (error) {
          console.error("verify-otp: fetch failed", error);
          return Response.json({ error: "db_error" }, { status: 500 });
        }
        if (!row || !row.otp_code_hash || !row.otp_expires_at) {
          return Response.json({ error: "no_code" }, { status: 400 });
        }
        if (new Date(row.otp_expires_at).getTime() < Date.now()) {
          return Response.json({ error: "code_expired" }, { status: 400 });
        }

        const salt = process.env.MAKE_INBOUND_SECRET || "fallback-otp-salt";
        const provided = hashCode(code, salt);
        if (!safeEqual(provided, row.otp_code_hash)) {
          return Response.json({ error: "invalid_code" }, { status: 400 });
        }

        const { error: upErr } = await supabaseAdmin
          .from("lead_scans")
          .update({
            verified_at: new Date().toISOString(),
            otp_code_hash: null,
          })
          .eq("scan_token", scan_token);
        if (upErr) {
          console.error("verify-otp: update failed", upErr);
          return Response.json({ error: "db_error" }, { status: 500 });
        }

        return Response.json({ ok: true });
      },
    },
  },
});

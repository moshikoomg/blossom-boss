import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BodySchema = z.object({
  source_url: z.string().trim().min(2).max(500).optional(),
  business_name: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  mode: z.enum(["search", "url"]).optional(),
}).refine(
  (v) => !!v.source_url || !!v.business_name,
  { message: "source_url or business_name required" },
);

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    // Hostname must look like a real domain: contains a dot and a TLD of
    // 2+ letters. Rejects bare Hebrew words, IPs without TLDs, "localhost",
    // and similar non-website inputs that should never hit Firecrawl.
    if (!u.hostname.includes(".")) return null;
    if (!/\.[a-z]{2,24}$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/start-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const parsed = BodySchema.safeParse(payload);
        if (!parsed.success) {
          return Response.json({ error: "invalid_input" }, { status: 400 });
        }

        const scan_token = crypto.randomUUID();
        const normalizedUrl = parsed.data.source_url
          ? normalizeUrl(parsed.data.source_url)
          : null;
        // Hard-fail invalid URLs BEFORE inserting a scan row, so the DB stays
        // clean of garbage like "פרחי הגולן" and the wizard can show a clear
        // toast instead of silently falling back to the platform template.
        if (parsed.data.source_url && !normalizedUrl) {
          return Response.json(
            { error: "url_required", message: "נדרשת כתובת אתר תקינה כדי לבצע סריקה" },
            { status: 400 },
          );
        }
        if (!normalizedUrl) {
          return Response.json(
            { error: "url_required", message: "נדרשת כתובת אתר תקינה כדי לבצע סריקה" },
            { status: 400 },
          );
        }
        const sourceUrl = normalizedUrl ?? parsed.data.business_name ?? "";

        const { error: insertErr } = await supabaseAdmin
          .from("lead_scans")
          .insert({
            scan_token,
            source_url: sourceUrl,
            business_name: parsed.data.business_name ?? null,
            requested_phone: parsed.data.phone ?? null,
            status: "scanning",
          });
        if (insertErr) {
          console.error("start-scan: insert failed", insertErr);
          return Response.json({ error: "db_insert_failed" }, { status: 500 });
        }

        // Return the scan token immediately. The heavy scrape+AI work runs
        // via a separate /api/public/run-scrape call the client fires
        // without awaiting, so the OTP screen can appear instantly while
        // Firecrawl + Gemini work happen in parallel with the user typing.
        return Response.json({ scan_token, ready: false });
      },
    },
  },
});

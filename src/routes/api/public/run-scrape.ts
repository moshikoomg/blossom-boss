import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BodySchema = z.object({
  scan_token: z.string().min(1).max(128),
  source_url: z.string().trim().min(2).max(500),
});

/**
 * Long-running scrape endpoint. The client fires this WITHOUT awaiting it
 * (the wizard switches to the OTP screen immediately) so Firecrawl + Gemini
 * extraction run in parallel with the user reading their SMS and typing the
 * 4-digit code. The wizard polls `lead_scans.status` after OTP verification
 * and waits up to ~20s before finalizing the store.
 */
export const Route = createFileRoute("/api/public/run-scrape")({
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
        const { scan_token, source_url } = parsed.data;

        try {
          const { scrapeAndExtract } = await import("@/lib/scrape.server");
          const result = await scrapeAndExtract(source_url);
          await supabaseAdmin
            .from("lead_scans")
            .update({
              status: "ready",
              discovered_business_name: result.business_name,
              discovered_logo_url: result.logo_url,
              discovered_phone: result.phone,
              discovered_palette: result.palette as never,
              discovered_products: result.products as never,
              discovered_categories: result.categories,
            })
            .eq("scan_token", scan_token);
          return Response.json({ ok: true, products_found: result.products.length });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("run-scrape: failed", message);
          await supabaseAdmin
            .from("lead_scans")
            .update({ status: "failed" })
            .eq("scan_token", scan_token);
          return Response.json({ ok: false, error: message.slice(0, 300) }, { status: 200 });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";

const PriceVariationSchema = z.object({
  label: z.string().min(1).max(120),
  price: z.union([z.number(), z.string()]),
  original_price: z.union([z.number(), z.string()]).optional().nullable(),
});

const ProductAddonSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.union([z.number(), z.string()]).optional(),
  image_url: z.string().url().max(2000).optional().nullable(),
});

const ProductSchema = z.object({
  name: z.string().min(1).max(255),
  price: z.union([z.number(), z.string()]).optional(),
  image_url: z.string().url().max(2000).optional(),
  description: z.string().max(2000).optional(),
  images: z.array(z.string().url().max(2000)).max(20).optional(),
  price_variations: z.array(PriceVariationSchema).max(20).optional(),
  addons: z.array(ProductAddonSchema).max(40).optional(),
  category: z.string().max(120).optional().nullable(),
}).passthrough();

const StoreAddonSchema = ProductAddonSchema;

const WorkingHoursSchema = z.array(
  z.object({
    day: z.string().min(1).max(40),
    open: z.string().max(40).optional().nullable(),
    close: z.string().max(40).optional().nullable(),
    closed: z.boolean().optional(),
    note: z.string().max(120).optional().nullable(),
  }),
).max(14);

const PaletteSchema = z
  .object({
    primary: z.string().max(64).optional(),
    secondary: z.string().max(64).optional(),
    bg: z.string().max(64).optional(),
  })
  .passthrough();

const SiteCandidateSchema = z.object({
  title: z.string().min(1).max(255),
  url: z.string().url().max(2000),
  favicon: z.string().url().max(2000).optional().nullable(),
  snippet: z.string().max(500).optional().nullable(),
  phone_match: z.boolean().optional(),
});

const BodySchema = z.object({
  scan_token: z.string().min(1).max(128),
  discovered_phone: z.string().max(64).optional().nullable(),
  discovered_business_name: z.string().max(255).optional().nullable(),
  discovered_logo_url: z.string().url().max(2000).optional().nullable(),
  discovered_palette: PaletteSchema.optional(),
  discovered_products: z.array(ProductSchema).max(500).optional(),
  discovered_categories: z.array(z.string().min(1).max(120)).max(100).optional(),
  discovered_sites: z.array(SiteCandidateSchema).max(20).optional(),
  discovered_addons: z.array(StoreAddonSchema).max(100).optional(),
  discovered_working_hours: WorkingHoursSchema.optional(),
});

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length === 0 || ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/scan-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.MAKE_INBOUND_SECRET;
        if (!secret) {
          console.error("scan-result: missing MAKE_INBOUND_SECRET");
          return new Response("server_misconfigured", { status: 500 });
        }
        const signature = request.headers.get("x-scan-signature");
        if (!signature) {
          return new Response("missing_signature", { status: 401 });
        }

        const rawBody = await request.text();

        const expected = crypto
          .createHmac("sha256", secret)
          .update(rawBody)
          .digest("hex");
        const provided = signature.replace(/^sha256=/, "").trim().toLowerCase();
        if (!safeEqualHex(provided, expected)) {
          return new Response("invalid_signature", { status: 401 });
        }

        let json: unknown;
        try {
          json = JSON.parse(rawBody);
        } catch {
          return new Response("invalid_json", { status: 400 });
        }

        const parsed = BodySchema.safeParse(json);
        if (!parsed.success) {
          return Response.json(
            { error: "invalid_input", details: parsed.error.flatten() },
            { status: 400 },
          );
        }

        const d = parsed.data;
        const update: TablesUpdate<"lead_scans"> = { status: "ready" };
        if (d.discovered_phone !== undefined) update.discovered_phone = d.discovered_phone;
        if (d.discovered_business_name !== undefined)
          update.discovered_business_name = d.discovered_business_name;
        if (d.discovered_logo_url !== undefined)
          update.discovered_logo_url = d.discovered_logo_url;
        if (d.discovered_palette !== undefined)
          update.discovered_palette = d.discovered_palette as unknown as Json;
        if (d.discovered_products !== undefined)
          update.discovered_products = d.discovered_products as unknown as Json;
        if (d.discovered_categories !== undefined)
          update.discovered_categories = d.discovered_categories as unknown as Json;
        if (d.discovered_sites !== undefined)
          (update as Record<string, unknown>).discovered_sites =
            d.discovered_sites as unknown as Json;
        if (d.discovered_addons !== undefined)
          (update as Record<string, unknown>).discovered_addons =
            d.discovered_addons as unknown as Json;
        if (d.discovered_working_hours !== undefined)
          (update as Record<string, unknown>).discovered_working_hours =
            d.discovered_working_hours as unknown as Json;

        const token = d.scan_token.trim();
        const { data, error } = await supabaseAdmin
          .from("lead_scans")
          .update(update)
          .eq("scan_token", token)
          .select("id")
          .maybeSingle();

        if (error) {
          console.error("scan-result: update failed", error);
          return new Response("db_update_failed", { status: 500 });
        }
        if (!data) {
          return Response.json({ error: "scan_not_found" }, { status: 404 });
        }
        return Response.json({ ok: true, scan_token: token });
      },
    },
  },
});

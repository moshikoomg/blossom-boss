import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isValidSlug } from "@/lib/store-slug";

// Short public store link: /s/<slug> → the store's storefront.
// A plain 302 so it works from WhatsApp, Instagram bio, QR codes, etc.
export const Route = createFileRoute("/s/$slug")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { slug: string } }) => {
        const slug = String(params.slug || "").toLowerCase();
        if (isValidSlug(slug)) {
          const { data } = await supabaseAdmin
            .from("stores")
            .select("id")
            .eq("slug", slug)
            .eq("active", true)
            .maybeSingle();
          if (data?.id) {
            return new Response(null, {
              status: 302,
              headers: { Location: `/?store=${data.id}`, "Cache-Control": "public, max-age=60" },
            });
          }
        }
        return new Response(
          `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>החנות לא נמצאה</title><body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#fff9fb;color:#2a1721;text-align:center;padding:16px"><div><h1 style="font-size:22px">החנות לא נמצאה</h1><p>בדקו שהקישור נכון, או פנו לבעל החנות.</p></div></body></html>`,
          { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      },
    },
  },
});

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLATFORM_TEMPLATE_STORE_ID } from "./platform-template";
import { createLatinSlug } from "./store-slug";
import { toWhatsAppNumber } from "./florist";
import { getPlanSettings, trialEndsFromNow } from "./plan-settings.server";
// Strict image rule: a product/add-on is only kept active if the template's
// primary image_url is a real http(s) URL. Gallery fallbacks and placeholder
// SVGs are intentionally NOT used — invalid images cause `active=false`.

const ThemeSchema = z
  .object({
    primary: z.string().optional(),
    primary_foreground: z.string().optional(),
    secondary: z.string().optional(),
    accent: z.string().optional(),
    background: z.string().optional(),
    foreground: z.string().optional(),
  })
  .partial();

// Store links must be Latin-only (/s/<slug>): Hebrew names are transliterated.
function slugify(name: string) {
  return createLatinSlug(name);
}

export const createStoreForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().min(1).max(80),
        city: z.string().max(80).optional().default(""),
        phone: z.string().max(30).optional().default(""),
        layout: z.enum(["gallery", "shelves", "side"]).optional().default("gallery"),
        addons: z
          .object({ sales_agent: z.boolean().optional(), whatsapp: z.boolean().optional() })
          .optional()
          .default({}),
        theme: ThemeSchema.optional().default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { name, city, phone, layout, addons, theme } = data;
    const { userId, claims } = context as { userId: string; claims: { email?: string } };

    // Generate unique slug
    let slug = slugify(name);
    for (let i = 0; i < 6; i++) {
      const { data: clash } = await supabaseAdmin
        .from("stores")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!clash) break;
      slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
    }

    // Insert store
    const { data: store, error: sErr } = await supabaseAdmin
      .from("stores")
      .insert({
        slug,
        name,
        description: city ? `חנות פרחים ב${city}` : "",
        owner_user_id: userId,
        active: true,
        plan: "trial",
        theme: theme as any,
        contact_email: claims?.email ?? "",
      })
      .select("id, slug, name")
      .single();
    if (sErr || !store) throw new Error(sErr?.message || "store insert failed");

    // Owner membership
    await supabaseAdmin
      .from("store_members")
      .insert({ store_id: store.id, user_id: userId, role: "owner" })
      .select("id")
      .maybeSingle();

    // Pro trial (TRIAL_DAYS, default 20, editable in Super Admin): full Pro plan + AI,
    // but during trial the runtime quota guard caps usage at 10% of Pro
    // (so trolls can't burn $$$ of API costs before flipping to paid).
    const trialEnds = trialEndsFromNow((await getPlanSettings()).trial_days);
    await supabaseAdmin
      .from("store_subscriptions")
      .insert({
        store_id: store.id,
        plan_key: "pro",
        status: "trialing",
        provider: "manual",
        is_trial: true,
        trial_ends_at: trialEnds,
        payment_method_attached: false,
        current_period_end: trialEnds,
      })
      .select("id")
      .maybeSingle();

    // Auto-enable Pro features (AI chat, studio images, custom domain, etc.)
    // so the trial experience is the full Pro experience. The quota guard
    // still enforces the 10% trial cap on API-cost features.
    const proFeatures = [
      "ai_chat",
      "image_studio_ai",
      "custom_domain",
      "email_broadcasts",
      "whatsapp",
    ];
    await supabaseAdmin.from("store_features").upsert(
      proFeatures.map((feature_key) => ({
        store_id: store.id,
        feature_key,
        enabled: true,
        enabled_at: new Date().toISOString(),
        expires_at: trialEnds,
      })),
      { onConflict: "store_id,feature_key" },
    );

    // Deep-clone the platform template catalog into the new store. All
    // categories/products/add-ons become NEW rows owned by this store_id,
    // so future edits never leak across stores.
    // Only the structure is copied (categories, layout settings): no demo
    // products, add-ons or popups, so the florist starts with a clean store.
    await cloneTemplateCatalog(store.id, theme as any, { withProducts: false });

    // Seed minimal brand identity in site_settings so the storefront immediately
    // shows the chosen name + city instead of falling back to the template.
    await supabaseAdmin.from("site_settings").upsert(
      [
        { store_id: store.id, key: "store_name", value: name as any },
        { store_id: store.id, key: "store_tagline", value: (city ? `חנות פרחים ב${city}` : "") as any },
        { store_id: store.id, key: "store_city", value: (city || "") as any },
        { store_id: store.id, key: "storefront_layout", value: layout as any },
        { store_id: store.id, key: "addon_sales_agent", value: (addons.sales_agent ?? true) as any },
        { store_id: store.id, key: "addon_whatsapp", value: (addons.whatsapp ?? true) as any },
        ...(phone
          ? [
              { store_id: store.id, key: "store_phone", value: phone as any },
              { store_id: store.id, key: "whatsapp_business", value: (toWhatsAppNumber(phone) ?? "") as any },
            ]
          : []),
      ],
      { onConflict: "store_id,key" },
    );

    return { storeId: store.id, slug: store.slug, name: store.name };
  });

// --- Platform template deep-clone ---
// Copies every category, product and add-on from the platform template store
// into the freshly created store. Each row is a brand-new record owned by
// the new store_id, so subsequent edits stay fully isolated. Product images
// are regenerated as themed SVG placeholders using the new store's palette.

function safeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function placeholderSvg(primary: string, accent: string, label: string) {
  const initials = (label.trim()[0] || "").slice(0, 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${primary}"/><stop offset="100%" stop-color="${accent}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="300" cy="270" r="140" fill="rgba(255,255,255,0.18)"/><text x="300" y="305" text-anchor="middle" font-family="system-ui,sans-serif" font-size="160" font-weight="800" fill="#ffffff" opacity="0.95">${safeXml(initials)}</text><text x="300" y="500" text-anchor="middle" font-family="system-ui,sans-serif" font-size="32" fill="#ffffff" opacity="0.95" font-weight="700">${safeXml(label)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function cloneTemplateCatalog(
  newStoreId: string,
  theme: Record<string, string> | null,
  opts: { withProducts?: boolean } = {},
) {
  const withProducts = opts.withProducts ?? true;
  const primary = theme?.primary || "#e11d48";
  const accent = theme?.accent || theme?.secondary || "#fb7185";

  // SAFETY: never copy primary keys from the template. Every cloned row
  // must be a fresh PostgreSQL-generated UUID so deletions/edits in one
  // store can NEVER affect any other store. The select lists below
  // intentionally exclude `id` for this reason.
  if (newStoreId === PLATFORM_TEMPLATE_STORE_ID) {
    throw new Error("refusing to clone template into itself");
  }

  // Idempotent re-clone: wipe any existing catalog rows for this store so
  // retries don't stack duplicate categories/products/add-ons. Child rows
  // (product_images / product_sizes / product_categories) are cleared by
  // ON DELETE CASCADE or by the explicit deletes below.
  await supabaseAdmin.from("add_ons").delete().eq("store_id", newStoreId);
  const { data: existingProducts } = await supabaseAdmin
    .from("products").select("id").eq("store_id", newStoreId);
  const existingProductIds = (existingProducts ?? []).map((r) => r.id);
  if (existingProductIds.length) {
    await supabaseAdmin.from("product_images").delete().in("product_id", existingProductIds);
    await supabaseAdmin.from("product_sizes").delete().in("product_id", existingProductIds);
    await supabaseAdmin.from("product_categories").delete().in("product_id", existingProductIds);
  }
  await supabaseAdmin.from("products").delete().eq("store_id", newStoreId);
  await supabaseAdmin.from("categories").delete().eq("store_id", newStoreId);

  // 1) Categories
  // DEFENSE: the SELECT below intentionally fetches the template `id` ONLY so we
  // can build an old→new id map for FK rewrites (category_id on products).
  // We never spread `...cat` into the INSERT payload — each insert lists every
  // field explicitly and omits `id`, so PostgreSQL generates a fresh
  // gen_random_uuid() per cloned row. This guarantees zero id-collision across
  // stores, and a deletion in one store can never affect another.
  const { data: tplCats, error: cFetchErr } = await supabaseAdmin
    .from("categories")
    .select("id, name, display_order, active, bg_color, bg_color_to, bg_effect, bg_image_url, bg_position, bg_shape, bg_size, display_mode")
    .eq("store_id", PLATFORM_TEMPLATE_STORE_ID)
    .order("display_order");
  if (cFetchErr) throw new Error(`template categories read failed: ${cFetchErr.message}`);

  const categoryIdMap = new Map<string, string>();
  for (const cat of tplCats ?? []) {
    const { data: created, error: cErr } = await supabaseAdmin
      .from("categories")
      .insert({
        store_id: newStoreId,
        name: cat.name,
        display_order: cat.display_order ?? 0,
        active: cat.active ?? true,
        bg_color: cat.bg_color ?? "",
        bg_color_to: cat.bg_color_to ?? "",
        bg_effect: cat.bg_effect ?? "none",
        bg_image_url: cat.bg_image_url ?? "",
        bg_position: cat.bg_position ?? "center",
        bg_shape: cat.bg_shape ?? "fill",
        bg_size: cat.bg_size ?? 100,
        display_mode: cat.display_mode ?? "grid",
      })
      .select("id")
      .single();
    if (cErr || !created) throw new Error(`category clone failed: ${cErr?.message}`);
    categoryIdMap.set(cat.id, created.id);
  }

  // 2) Products
  // We DO select the template `id` here to build a productIdMap for cloning
  // child tables (product_images / product_sizes / product_categories). The
  // template id is NEVER written into the new row — each insert lists fields
  // explicitly and omits `id`, so PostgreSQL generates a fresh UUID per row.
  const { data: tplProducts, error: pFetchErr } = await supabaseAdmin
    .from("products")
    .select("id, name, description, price, original_price, image_url, badge, badge_color, active, stock, rating, display_order, category_id, highlight_size")
    .eq("store_id", PLATFORM_TEMPLATE_STORE_ID)
    .order("display_order");
  if (pFetchErr) throw new Error(`template products read failed: ${pFetchErr.message}`);

  const productIdMap = new Map<string, string>();
  if (withProducts && tplProducts && tplProducts.length) {
    const tplProductIds = tplProducts.map((p) => p.id);
    const { data: tplImgsPre } = await supabaseAdmin
      .from("product_images")
      .select("product_id, image_url, display_order")
      .in("product_id", tplProductIds)
      .order("display_order");

    // Insert one-by-one to obtain the new id per template row, so we can
    // clone child tables with FKs rewritten to the new ids.
    for (const p of tplProducts) {
      // STRICT rule: a product is only shown to customers when the template
      // already has a real http(s) primary image. No gallery fallbacks, no
      // placeholder SVGs, no letter shapes — anything else is hidden.
      const tplUrl = p.image_url;
      const hasValidImage =
        typeof tplUrl === "string" &&
        /^https?:\/\//i.test(tplUrl) &&
        !tplUrl.trim().startsWith("<svg") &&
        !tplUrl.startsWith("data:");
      const row = {
        store_id: newStoreId,
        category_id: p.category_id ? categoryIdMap.get(p.category_id) ?? null : null,
        name: p.name,
        description: p.description ?? "",
        price: p.price ?? 0,
        original_price: p.original_price ?? null,
        image_url: hasValidImage ? tplUrl : "",
        badge: p.badge ?? null,
        badge_color: p.badge_color ?? null,
        active: hasValidImage ? (p.active ?? true) : false,
        stock: p.stock ?? 50,
        rating: p.rating ?? 5,
        display_order: p.display_order ?? 0,
        highlight_size: p.highlight_size ?? 1,
      };
      if ("id" in row) throw new Error("clone safety: product row carried template id");
      if (row.store_id !== newStoreId) throw new Error("clone safety: product row store_id mismatch");
      const { data: created, error: pErr } = await supabaseAdmin
        .from("products").insert(row).select("id").single();
      if (pErr || !created) throw new Error(`product clone failed: ${pErr?.message}`);
      productIdMap.set(p.id, created.id);
    }

    // 2a) product_images — clone gallery
    const tplImgs = tplImgsPre;
    if (tplImgs && tplImgs.length) {
      const imgRows = tplImgs
        .map((r) => {
          const newPid = productIdMap.get(r.product_id);
          if (!newPid) return null;
          return {
            product_id: newPid,
            image_url: r.image_url,
            display_order: r.display_order ?? 0,
          };
        })
        .filter(Boolean) as { product_id: string; image_url: string; display_order: number }[];
      if (imgRows.length) {
        const { error: iErr } = await supabaseAdmin.from("product_images").insert(imgRows);
        if (iErr) throw new Error(`product_images clone failed: ${iErr.message}`);
      }
    }

    // 2b) product_sizes — clone size/price variants
    const { data: tplSizes } = await supabaseAdmin
      .from("product_sizes")
      .select("product_id, label, price, original_price, display_order")
      .in("product_id", tplProductIds)
      .order("display_order");
    if (tplSizes && tplSizes.length) {
      const sizeRows = tplSizes
        .map((r) => {
          const newPid = productIdMap.get(r.product_id);
          if (!newPid) return null;
          return {
            product_id: newPid,
            label: r.label,
            price: r.price ?? 0,
            original_price: r.original_price ?? null,
            display_order: r.display_order ?? 0,
          };
        })
        .filter(Boolean) as any[];
      if (sizeRows.length) {
        const { error: sErr } = await supabaseAdmin.from("product_sizes").insert(sizeRows);
        if (sErr) throw new Error(`product_sizes clone failed: ${sErr.message}`);
      }
    }

    // 2c) product_categories — clone multi-category links (rewrite FK to new category id)
    const { data: tplPCs } = await supabaseAdmin
      .from("product_categories")
      .select("product_id, category_id")
      .in("product_id", tplProductIds);
    if (tplPCs && tplPCs.length) {
      const pcRows = tplPCs
        .map((r) => {
          const newPid = productIdMap.get(r.product_id);
          const newCid = categoryIdMap.get(r.category_id);
          if (!newPid || !newCid) return null;
          return { product_id: newPid, category_id: newCid };
        })
        .filter(Boolean) as { product_id: string; category_id: string }[];
      if (pcRows.length) {
        const { error: pcErr } = await supabaseAdmin.from("product_categories").insert(pcRows);
        if (pcErr) throw new Error(`product_categories clone failed: ${pcErr.message}`);
      }
    }
  }

  // 3) Add-ons
  const { data: tplAddons, error: aFetchErr } = await supabaseAdmin
    .from("add_ons")
    .select("name, price, image_url, active, display_order")
    .eq("store_id", PLATFORM_TEMPLATE_STORE_ID)
    .order("display_order");
  if (aFetchErr) throw new Error(`template add-ons read failed: ${aFetchErr.message}`);

  if (withProducts && tplAddons && tplAddons.length) {
    const rows = tplAddons.map((a) => {
      const url = a.image_url;
      const hasValidImage =
        typeof url === "string" &&
        /^https?:\/\//i.test(url) &&
        !url.trim().startsWith("<svg") &&
        !url.startsWith("data:");
      return {
        store_id: newStoreId,
        name: a.name,
        price: a.price ?? 0,
        image_url: hasValidImage ? url : "",
        active: hasValidImage ? (a.active ?? true) : false,
        display_order: a.display_order ?? 0,
      };
    });
    for (const r of rows) {
      if ("id" in r) throw new Error("clone safety: addon row carried template id");
      if (r.store_id !== newStoreId) throw new Error("clone safety: addon row store_id mismatch");
    }
    const { error: aErr } = await supabaseAdmin.from("add_ons").insert(rows);
    if (aErr) throw new Error(`add-on clone failed: ${aErr.message}`);
  }

  // 4) Hero slides
  const { data: tplHero } = await supabaseAdmin
    .from("hero_slides")
    .select("title, subtitle, media_url, media_type, bg_color, text_color, cta_label, cta_url, coupon_code, autoplay_seconds, display_order, active")
    .eq("store_id", PLATFORM_TEMPLATE_STORE_ID)
    .order("display_order");
  if (tplHero && tplHero.length) {
    await supabaseAdmin.from("hero_slides").insert(tplHero.map((h) => ({ ...h, store_id: newStoreId })));
  }

  // 5) Site settings (key/value pairs — theme, hero copy, etc.)
  const { data: tplSettings } = await supabaseAdmin
    .from("site_settings")
    .select("key, value")
    .eq("store_id", PLATFORM_TEMPLATE_STORE_ID);
  if (tplSettings && tplSettings.length) {
    await supabaseAdmin.from("site_settings").upsert(
      tplSettings.map((s) => ({ store_id: newStoreId, key: s.key, value: s.value })),
      { onConflict: "store_id,key" }
    );
  }

  // 6) Site popups — true deep-clone (fresh UUIDs, no template ids carried over)
  const { data: tplPopups } = await supabaseAdmin
    .from("site_popups")
    .select("title, body, image_url, bg_color, text_color, cta_label, cta_url, action_type, layout, position, shape, size, animation, text_align, bg_opacity, overlay_opacity, content_padding, bg_video_url, trigger_type, trigger_value, trigger_category_ids, filter_product_ids, rotate_seconds, auto_close_seconds, starts_at, ends_at, display_order, active")
    .eq("store_id", PLATFORM_TEMPLATE_STORE_ID)
    .order("display_order");
  if (withProducts && tplPopups && tplPopups.length) {
    const rows = tplPopups.map((p) => ({ ...p, store_id: newStoreId }));
    const { error: pErr } = await supabaseAdmin.from("site_popups").insert(rows);
    if (pErr) throw new Error(`site_popups clone failed: ${pErr.message}`);
  }
}

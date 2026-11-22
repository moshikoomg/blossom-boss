import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLATFORM_TEMPLATE_STORE_ID } from "./platform-template";
import { existingStorageObjects, pickPrimaryImage } from "./image-health.server";

/**
 * Seed an already-existing store with the platform template catalog.
 * Used by the super-admin "create store" flow. The user-facing landing
 * flow uses createStoreForUser which seeds automatically.
 *
 * Skips seeding when the store already has products.
 */

function safeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function placeholderSvg(primary: string, accent: string, label: string) {
  const initials = (label.trim()[0] || "").slice(0, 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${primary}"/><stop offset="100%" stop-color="${accent}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="300" cy="270" r="140" fill="rgba(255,255,255,0.18)"/><text x="300" y="305" text-anchor="middle" font-family="system-ui,sans-serif" font-size="160" font-weight="800" fill="#ffffff" opacity="0.95">${safeXml(initials)}</text><text x="300" y="500" text-anchor="middle" font-family="system-ui,sans-serif" font-size="32" fill="#ffffff" opacity="0.95" font-weight="700">${safeXml(label)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const seedStoreCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ storeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { storeId } = data;
    const { userId } = context as { userId: string };

    // Authorize: platform admin OR store member.
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleRow;
    if (!isAdmin) {
      const { data: memberRow } = await supabaseAdmin
        .from("store_members")
        .select("id")
        .eq("store_id", storeId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!memberRow) throw new Error("forbidden");
    }

    // Skip if already populated.
    const { count } = await supabaseAdmin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId);
    if ((count ?? 0) > 0) {
      return { seeded: false, reason: "already_has_products", count };
    }

    // Pull theme to color the SVG placeholders.
    const { data: storeRow } = await supabaseAdmin
      .from("stores")
      .select("theme")
      .eq("id", storeId)
      .maybeSingle();
    const theme = (storeRow?.theme || {}) as Record<string, string>;
    const primary = theme.primary || "#e11d48";
    const accent = theme.accent || theme.secondary || "#fb7185";

    // 1) Clone categories
    const { data: tplCats } = await supabaseAdmin
      .from("categories")
      .select("id, name, display_order, active, bg_color, bg_color_to, bg_effect, bg_image_url, bg_position, bg_shape, bg_size, display_mode")
      .eq("store_id", PLATFORM_TEMPLATE_STORE_ID)
      .order("display_order");

    const catIdMap = new Map<string, string>();
    let totalCats = 0;
    for (const cat of tplCats ?? []) {
      const { data: created, error: cErr } = await supabaseAdmin
        .from("categories")
        .insert({
          store_id: storeId,
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
      catIdMap.set(cat.id, created.id);
      totalCats += 1;
    }

    // 2) Clone products
    const { data: tplProducts } = await supabaseAdmin
      .from("products")
      .select("id, name, description, price, original_price, image_url, badge, badge_color, active, stock, rating, display_order, category_id, highlight_size")
      .eq("store_id", PLATFORM_TEMPLATE_STORE_ID)
      .order("display_order");

    let totalProducts = 0;
    const productIdMap = new Map<string, string>();
    if (tplProducts && tplProducts.length) {
      const tplProductIds = tplProducts.map((p) => p.id);
      const { data: tplImgsPre } = await supabaseAdmin
        .from("product_images")
        .select("product_id, image_url, display_order")
        .in("product_id", tplProductIds)
        .order("display_order");
      const galleryByTpl = new Map<string, string[]>();
      for (const r of tplImgsPre ?? []) {
        const arr = galleryByTpl.get(r.product_id) || [];
        arr.push(r.image_url);
        galleryByTpl.set(r.product_id, arr);
      }
      const allUrls: string[] = [];
      for (const p of tplProducts) {
        if (p.image_url) allUrls.push(p.image_url);
        allUrls.push(...(galleryByTpl.get(p.id) || []));
      }
      const existing = await existingStorageObjects(allUrls);

      for (const p of tplProducts) {
        const chosen = pickPrimaryImage(p.image_url, galleryByTpl.get(p.id) || [], existing);
        const hasImage = !!chosen;
        const row = {
          store_id: storeId,
          category_id: p.category_id ? catIdMap.get(p.category_id) ?? null : null,
          name: p.name,
          description: p.description ?? "",
          price: p.price ?? 0,
          original_price: p.original_price ?? null,
          image_url: chosen ?? "",
          badge: p.badge ?? null,
          badge_color: p.badge_color ?? null,
          active: hasImage ? (p.active ?? true) : false,
          stock: p.stock ?? 50,
          rating: p.rating ?? 5,
          display_order: p.display_order ?? 0,
          highlight_size: p.highlight_size ?? 1,
        };
        const { data: created, error: pErr } = await supabaseAdmin
          .from("products").insert(row).select("id").single();
        if (pErr || !created) throw new Error(`product clone failed: ${pErr?.message}`);
        productIdMap.set(p.id, created.id);
        totalProducts += 1;
      }

      // 2a) product_images
      const tplImgs = tplImgsPre;
      if (tplImgs && tplImgs.length) {
        const imgRows = tplImgs
          .map((r) => {
            const newPid = productIdMap.get(r.product_id);
            if (!newPid) return null;
            return { product_id: newPid, image_url: r.image_url, display_order: r.display_order ?? 0 };
          })
          .filter(Boolean) as any[];
        if (imgRows.length) await supabaseAdmin.from("product_images").insert(imgRows);
      }

      // 2b) product_sizes
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
        if (sizeRows.length) await supabaseAdmin.from("product_sizes").insert(sizeRows);
      }

      // 2c) product_categories (rewrite category FK)
      const { data: tplPCs } = await supabaseAdmin
        .from("product_categories")
        .select("product_id, category_id")
        .in("product_id", tplProductIds);
      if (tplPCs && tplPCs.length) {
        const pcRows = tplPCs
          .map((r) => {
            const newPid = productIdMap.get(r.product_id);
            const newCid = catIdMap.get(r.category_id);
            if (!newPid || !newCid) return null;
            return { product_id: newPid, category_id: newCid };
          })
          .filter(Boolean) as any[];
        if (pcRows.length) await supabaseAdmin.from("product_categories").insert(pcRows);
      }
    }

    // 3) Clone add-ons
    const { data: tplAddons } = await supabaseAdmin
      .from("add_ons")
      .select("name, price, image_url, active, display_order")
      .eq("store_id", PLATFORM_TEMPLATE_STORE_ID)
      .order("display_order");

    if (tplAddons && tplAddons.length) {
      const rows = tplAddons.map((a) => ({
        store_id: storeId,
        name: a.name,
        price: a.price ?? 0,
        image_url: a.image_url || "",
        active: a.image_url ? (a.active ?? true) : false,
        display_order: a.display_order ?? 0,
      }));
      const { error: aErr } = await supabaseAdmin.from("add_ons").insert(rows);
      if (aErr) throw new Error(`add-on clone failed: ${aErr.message}`);
    }

    return { seeded: true, categories: totalCats, products: totalProducts };
  });

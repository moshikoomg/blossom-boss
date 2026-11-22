import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLATFORM_TEMPLATE_STORE_ID } from "./platform-template";
import {
  existingStorageObjects,
  extractStorageObjectName,
  verifyImageUrl,
} from "./image-health.server";

/**
 * Smart, non-destructive catalog sync.
 *
 * Pulls the platform template catalog into an existing store WITHOUT touching
 * the store owner's edits. Rules:
 *
 *  - Categories: any template category missing from the store (matched by
 *    name) is added.
 *  - Products: any template product missing from the store (matched by name)
 *    is added, including gallery, sizes and category links.
 *  - Existing products: ONLY `image_url` may be updated, and ONLY when the
 *    store's current image is empty OR points to a storage object that no
 *    longer exists / external URL that no longer responds. Price, name,
 *    description, badge, etc. are never overwritten.
 *  - Add-ons: same logic (insert missing by name, repair broken images on
 *    existing rows).
 *
 * Image validation (per requirement #3): before copying any URL from the
 * template, `verifyImageUrl` confirms the file actually exists in storage
 * (or responds 2xx for external URLs). Broken URLs become "" and the product
 * is left inactive so the storefront never renders a broken square.
 */

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("forbidden: platform admin required");
}

export const listActiveStoresForSync = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);
    const { data } = await supabaseAdmin
      .from("stores")
      .select("id, name")
      .eq("active", true)
      .neq("id", PLATFORM_TEMPLATE_STORE_ID)
      .order("created_at", { ascending: true });
    return (data ?? []) as { id: string; name: string }[];
  });

export type SyncResult = {
  storeId: string;
  categoriesAdded: number;
  productsAdded: number;
  imagesRepaired: number;
  addOnsAdded: number;
  addOnImagesRepaired: number;
};

export const syncStoreWithTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ storeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SyncResult> => {
    const { storeId } = data;
    const { userId } = context as { userId: string };
    await assertAdmin(userId);
    if (storeId === PLATFORM_TEMPLATE_STORE_ID) {
      throw new Error("refusing to sync the template store with itself");
    }

    // ---------- 1) CATEGORIES — add missing by name ----------
    const { data: tplCats } = await supabaseAdmin
      .from("categories")
      .select("id, name, display_order, active, bg_color, bg_color_to, bg_effect, bg_image_url, bg_position, bg_shape, bg_size, display_mode")
      .eq("store_id", PLATFORM_TEMPLATE_STORE_ID)
      .order("display_order");
    const { data: storeCats } = await supabaseAdmin
      .from("categories").select("id, name").eq("store_id", storeId);
    const storeCatByName = new Map<string, string>();
    for (const c of storeCats ?? []) storeCatByName.set(c.name, c.id);

    let categoriesAdded = 0;
    const tplCatToStoreCat = new Map<string, string>(); // template cat id -> store cat id
    for (const c of tplCats ?? []) {
      const existingId = storeCatByName.get(c.name);
      if (existingId) {
        tplCatToStoreCat.set(c.id, existingId);
        continue;
      }
      const { data: created, error } = await supabaseAdmin
        .from("categories")
        .insert({
          store_id: storeId,
          name: c.name,
          display_order: c.display_order ?? 0,
          active: c.active ?? true,
          bg_color: c.bg_color ?? "",
          bg_color_to: c.bg_color_to ?? "",
          bg_effect: c.bg_effect ?? "none",
          bg_image_url: c.bg_image_url ?? "",
          bg_position: c.bg_position ?? "center",
          bg_shape: c.bg_shape ?? "fill",
          bg_size: c.bg_size ?? 100,
          display_mode: c.display_mode ?? "grid",
        })
        .select("id").single();
      if (error || !created) throw new Error(`category insert failed: ${error?.message}`);
      tplCatToStoreCat.set(c.id, created.id);
      storeCatByName.set(c.name, created.id);
      categoriesAdded += 1;
    }

    // ---------- 2) PRODUCTS ----------
    const { data: tplProducts } = await supabaseAdmin
      .from("products")
      .select("id, name, description, price, original_price, image_url, badge, badge_color, active, stock, rating, display_order, category_id, highlight_size")
      .eq("store_id", PLATFORM_TEMPLATE_STORE_ID)
      .order("display_order");
    const { data: storeProducts } = await supabaseAdmin
      .from("products").select("id, name, image_url").eq("store_id", storeId);
    const storeProductByName = new Map<string, { id: string; image_url: string }>();
    for (const p of storeProducts ?? []) storeProductByName.set(p.name, { id: p.id, image_url: p.image_url });

    // Prefetch template gallery for inserts + image fallback
    const tplProductIds = (tplProducts ?? []).map((p) => p.id);
    const { data: tplImgs } = tplProductIds.length
      ? await supabaseAdmin
          .from("product_images")
          .select("product_id, image_url, display_order")
          .in("product_id", tplProductIds)
          .order("display_order")
      : { data: [] as any[] };
    const galleryByTpl = new Map<string, string[]>();
    for (const r of tplImgs ?? []) {
      const arr = galleryByTpl.get(r.product_id) || [];
      arr.push(r.image_url);
      galleryByTpl.set(r.product_id, arr);
    }
    const { data: tplSizes } = tplProductIds.length
      ? await supabaseAdmin
          .from("product_sizes")
          .select("product_id, label, price, original_price, display_order")
          .in("product_id", tplProductIds)
          .order("display_order")
      : { data: [] as any[] };
    const { data: tplPCs } = tplProductIds.length
      ? await supabaseAdmin
          .from("product_categories")
          .select("product_id, category_id")
          .in("product_id", tplProductIds)
      : { data: [] as any[] };

    // Prefetch storage existence for every URL we might copy (one shot).
    const allUrls: string[] = [];
    for (const p of tplProducts ?? []) {
      if (p.image_url) allUrls.push(p.image_url);
      allUrls.push(...(galleryByTpl.get(p.id) || []));
    }
    for (const p of storeProducts ?? []) if (p.image_url) allUrls.push(p.image_url);
    const existing = await existingStorageObjects(allUrls);

    // Helper: pick a reachable image URL for a template product (primary then gallery).
    async function reachableImageForTpl(tplUrl: string, gallery: string[]): Promise<string> {
      const candidates = [tplUrl, ...gallery].filter((u) => typeof u === "string" && u.trim() !== "");
      for (const u of candidates) {
        if (await verifyImageUrl(u, existing)) return u;
      }
      return "";
    }

    // Helper: is the store's current image broken?
    function storeImageBroken(url: string | null | undefined): boolean {
      if (!url || url.trim() === "") return true;
      const name = extractStorageObjectName(url);
      if (name) return !existing.has(name);
      // For external URLs we can't cheaply revalidate every store image without
      // hammering the network; trust them unless they're our bucket and missing.
      return false;
    }

    let productsAdded = 0;
    let imagesRepaired = 0;
    const newProductIdByTpl = new Map<string, string>();

    for (const p of tplProducts ?? []) {
      const matched = storeProductByName.get(p.name);
      if (matched) {
        // ONLY repair the primary image when broken — never touch other fields.
        if (storeImageBroken(matched.image_url)) {
          const next = await reachableImageForTpl(p.image_url, galleryByTpl.get(p.id) || []);
          if (next) {
            const { error } = await supabaseAdmin
              .from("products")
              .update({ image_url: next })
              .eq("id", matched.id)
              .eq("store_id", storeId);
            if (!error) imagesRepaired += 1;
          }
        }
        continue;
      }
      // New product — insert with reachable image (or inactive placeholder).
      const chosen = await reachableImageForTpl(p.image_url, galleryByTpl.get(p.id) || []);
      const hasImage = !!chosen;
      const row = {
        store_id: storeId,
        category_id: p.category_id ? tplCatToStoreCat.get(p.category_id) ?? null : null,
        name: p.name,
        description: p.description ?? "",
        price: p.price ?? 0,
        original_price: p.original_price ?? null,
        image_url: chosen,
        badge: p.badge ?? null,
        badge_color: p.badge_color ?? null,
        active: hasImage ? (p.active ?? true) : false,
        stock: p.stock ?? 50,
        rating: p.rating ?? 5,
        display_order: p.display_order ?? 0,
        highlight_size: p.highlight_size ?? 1,
      };
      const { data: created, error } = await supabaseAdmin
        .from("products").insert(row).select("id").single();
      if (error || !created) throw new Error(`product insert failed: ${error?.message}`);
      newProductIdByTpl.set(p.id, created.id);
      productsAdded += 1;
    }

    // Gallery, sizes, category links for the newly inserted products only.
    if (newProductIdByTpl.size) {
      const imgRows: any[] = [];
      for (const r of tplImgs ?? []) {
        const newPid = newProductIdByTpl.get(r.product_id);
        if (!newPid) continue;
        if (!(await verifyImageUrl(r.image_url, existing))) continue;
        imgRows.push({ product_id: newPid, image_url: r.image_url, display_order: r.display_order ?? 0 });
      }
      if (imgRows.length) await supabaseAdmin.from("product_images").insert(imgRows);

      const sizeRows: any[] = [];
      for (const r of tplSizes ?? []) {
        const newPid = newProductIdByTpl.get(r.product_id);
        if (!newPid) continue;
        sizeRows.push({
          product_id: newPid, label: r.label, price: r.price ?? 0,
          original_price: r.original_price ?? null, display_order: r.display_order ?? 0,
        });
      }
      if (sizeRows.length) await supabaseAdmin.from("product_sizes").insert(sizeRows);

      const pcRows: any[] = [];
      for (const r of tplPCs ?? []) {
        const newPid = newProductIdByTpl.get(r.product_id);
        const newCid = tplCatToStoreCat.get(r.category_id);
        if (!newPid || !newCid) continue;
        pcRows.push({ product_id: newPid, category_id: newCid });
      }
      if (pcRows.length) await supabaseAdmin.from("product_categories").insert(pcRows);
    }

    // ---------- 3) ADD-ONS ----------
    const { data: tplAddons } = await supabaseAdmin
      .from("add_ons")
      .select("name, price, image_url, active, display_order")
      .eq("store_id", PLATFORM_TEMPLATE_STORE_ID)
      .order("display_order");
    const { data: storeAddons } = await supabaseAdmin
      .from("add_ons").select("id, name, image_url").eq("store_id", storeId);
    const storeAddonByName = new Map<string, { id: string; image_url: string }>();
    for (const a of storeAddons ?? []) storeAddonByName.set(a.name, { id: a.id, image_url: a.image_url });

    let addOnsAdded = 0;
    let addOnImagesRepaired = 0;
    for (const a of tplAddons ?? []) {
      const existingAddon = storeAddonByName.get(a.name);
      const tplUrlOk = await verifyImageUrl(a.image_url, existing);
      if (existingAddon) {
        if (storeImageBroken(existingAddon.image_url) && tplUrlOk) {
          const { error } = await supabaseAdmin
            .from("add_ons").update({ image_url: a.image_url }).eq("id", existingAddon.id).eq("store_id", storeId);
          if (!error) addOnImagesRepaired += 1;
        }
        continue;
      }
      const { error } = await supabaseAdmin.from("add_ons").insert({
        store_id: storeId,
        name: a.name,
        price: a.price ?? 0,
        image_url: tplUrlOk ? a.image_url : "",
        active: tplUrlOk ? (a.active ?? true) : false,
        display_order: a.display_order ?? 0,
      });
      if (error) throw new Error(`add-on insert failed: ${error.message}`);
      addOnsAdded += 1;
    }

    return {
      storeId,
      categoriesAdded,
      productsAdded,
      imagesRepaired,
      addOnsAdded,
      addOnImagesRepaired,
    };
  });

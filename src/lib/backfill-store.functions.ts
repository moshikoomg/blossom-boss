import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLATFORM_TEMPLATE_STORE_ID } from "./platform-template";
import {
  existingStorageObjects,
  extractStorageObjectName,
  pickPrimaryImage,
} from "./image-health.server";

/**
 * Backfill missing template data into an existing store WITHOUT overwriting
 * any work the store owner has already done.
 *
 * Match: by product name (template product name === store product name).
 * Per matched product:
 *  - product_images: only inserts if the store product has zero gallery rows
 *  - product_sizes:  only inserts if the store product has zero size rows
 *  - product_categories: only inserts links that don't already exist
 *  - products.image_url: only overwrites if the store product image is empty
 *
 * Never touches any other store, never deletes anything.
 */
export const backfillStoreFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ storeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { storeId } = data;
    const { userId } = context as { userId: string };

    if (storeId === PLATFORM_TEMPLATE_STORE_ID) {
      throw new Error("refusing to backfill the template store into itself");
    }

    // Authorize: platform admin only (this is a privileged data operation).
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("forbidden: platform admin required");

    // 1) Pull template products + their child tables
    const { data: tplProducts } = await supabaseAdmin
      .from("products")
      .select("id, name, image_url, category_id")
      .eq("store_id", PLATFORM_TEMPLATE_STORE_ID);
    if (!tplProducts?.length) return { matched: 0, images: 0, sizes: 0, categoryLinks: 0, imagesPrimary: 0 };

    const tplIds = tplProducts.map((p) => p.id);

    // 2) Pull store products
    const { data: storeProducts } = await supabaseAdmin
      .from("products")
      .select("id, name, image_url")
      .eq("store_id", storeId);
    if (!storeProducts?.length) return { matched: 0, images: 0, sizes: 0, categoryLinks: 0, imagesPrimary: 0 };

    // Map template name -> template product
    const tplByName = new Map<string, { id: string; image_url: string; category_id: string | null }>();
    for (const p of tplProducts) tplByName.set(p.name, { id: p.id, image_url: p.image_url, category_id: p.category_id });

    // Build matched pairs (storeProductId -> templateProductId)
    const pairs: { storeId: string; tplId: string; tplImage: string; storeImage: string }[] = [];
    for (const sp of storeProducts) {
      const tpl = tplByName.get(sp.name);
      if (tpl) pairs.push({ storeId: sp.id, tplId: tpl.id, tplImage: tpl.image_url, storeImage: sp.image_url });
    }
    if (!pairs.length) return { matched: 0, images: 0, sizes: 0, categoryLinks: 0, imagesPrimary: 0 };

    const tplPairIds = pairs.map((x) => x.tplId);
    const storePairIds = pairs.map((x) => x.storeId);

    // 3) Existing child counts on the STORE side
    const { data: existingImgs } = await supabaseAdmin
      .from("product_images").select("product_id").in("product_id", storePairIds);
    const hasImg = new Set((existingImgs ?? []).map((r) => r.product_id));

    const { data: existingSizes } = await supabaseAdmin
      .from("product_sizes").select("product_id").in("product_id", storePairIds);
    const hasSize = new Set((existingSizes ?? []).map((r) => r.product_id));

    const { data: existingPCs } = await supabaseAdmin
      .from("product_categories").select("product_id, category_id").in("product_id", storePairIds);
    const existingPCKey = new Set((existingPCs ?? []).map((r) => `${r.product_id}::${r.category_id}`));

    // 4) Template child rows
    const { data: tplImgs } = await supabaseAdmin
      .from("product_images")
      .select("product_id, image_url, display_order")
      .in("product_id", tplPairIds).order("display_order");

    const { data: tplSizes } = await supabaseAdmin
      .from("product_sizes")
      .select("product_id, label, price, original_price, display_order")
      .in("product_id", tplPairIds).order("display_order");

    const { data: tplPCs } = await supabaseAdmin
      .from("product_categories")
      .select("product_id, category_id").in("product_id", tplPairIds);

    // 5) Category id map: template category id -> store category id (by name + display_order)
    const { data: tplCats } = await supabaseAdmin
      .from("categories").select("id, name, display_order").eq("store_id", PLATFORM_TEMPLATE_STORE_ID);
    const { data: storeCats } = await supabaseAdmin
      .from("categories").select("id, name, display_order").eq("store_id", storeId);
    const storeCatByName = new Map<string, string>();
    for (const c of storeCats ?? []) storeCatByName.set(c.name, c.id);
    const tplCatToStoreCat = new Map<string, string>();
    for (const c of tplCats ?? []) {
      const newId = storeCatByName.get(c.name);
      if (newId) tplCatToStoreCat.set(c.id, newId);
    }

    const tplToStore = new Map<string, string>();
    for (const p of pairs) tplToStore.set(p.tplId, p.storeId);

    // 6) Apply: only fill what's missing
    let imagesInserted = 0;
    const imgRows: any[] = [];
    for (const r of tplImgs ?? []) {
      const sId = tplToStore.get(r.product_id);
      if (!sId || hasImg.has(sId)) continue;
      imgRows.push({ product_id: sId, image_url: r.image_url, display_order: r.display_order ?? 0 });
    }
    if (imgRows.length) {
      const { error } = await supabaseAdmin.from("product_images").insert(imgRows);
      if (error) throw new Error(`image backfill failed: ${error.message}`);
      imagesInserted = imgRows.length;
    }

    let sizesInserted = 0;
    const sizeRows: any[] = [];
    for (const r of tplSizes ?? []) {
      const sId = tplToStore.get(r.product_id);
      if (!sId || hasSize.has(sId)) continue;
      sizeRows.push({
        product_id: sId, label: r.label, price: r.price ?? 0,
        original_price: r.original_price ?? null, display_order: r.display_order ?? 0,
      });
    }
    if (sizeRows.length) {
      const { error } = await supabaseAdmin.from("product_sizes").insert(sizeRows);
      if (error) throw new Error(`sizes backfill failed: ${error.message}`);
      sizesInserted = sizeRows.length;
    }

    let pcsInserted = 0;
    const pcRows: any[] = [];
    for (const r of tplPCs ?? []) {
      const sId = tplToStore.get(r.product_id);
      const sCid = tplCatToStoreCat.get(r.category_id);
      if (!sId || !sCid) continue;
      const key = `${sId}::${sCid}`;
      if (existingPCKey.has(key)) continue;
      pcRows.push({ product_id: sId, category_id: sCid });
      existingPCKey.add(key);
    }
    if (pcRows.length) {
      const { error } = await supabaseAdmin.from("product_categories").insert(pcRows);
      if (error) throw new Error(`product_categories backfill failed: ${error.message}`);
      pcsInserted = pcRows.length;
    }

    // 7) Primary image on products row — only fill when the store's current
    //    primary image is missing OR points to a storage object that no longer
    //    exists. Use the first reachable gallery image as fallback when the
    //    template image itself is broken.
    const galleryByTpl = new Map<string, string[]>();
    for (const r of tplImgs ?? []) {
      const arr = galleryByTpl.get(r.product_id) || [];
      arr.push(r.image_url);
      galleryByTpl.set(r.product_id, arr);
    }
    const allUrls: string[] = [];
    for (const p of pairs) {
      allUrls.push(p.storeImage, p.tplImage);
      allUrls.push(...(galleryByTpl.get(p.tplId) || []));
    }
    const existing = await existingStorageObjects(allUrls);
    const urlOk = (u: string | null | undefined) => {
      if (!u || u.trim() === "" || u.startsWith("data:image/svg+xml")) return false;
      const name = extractStorageObjectName(u);
      if (!name) return true;
      return existing.has(name);
    };
    let primaryUpdated = 0;
    for (const p of pairs) {
      if (urlOk(p.storeImage)) continue; // store already has a working primary image
      const next = pickPrimaryImage(p.tplImage, galleryByTpl.get(p.tplId) || [], existing);
      if (!next) continue;
      const { error } = await supabaseAdmin
        .from("products").update({ image_url: next }).eq("id", p.storeId).eq("store_id", storeId);
      if (!error) primaryUpdated += 1;
    }

    return {
      matched: pairs.length,
      images: imagesInserted,
      sizes: sizesInserted,
      categoryLinks: pcsInserted,
      imagesPrimary: primaryUpdated,
    };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLATFORM_TEMPLATE_STORE_ID } from "./platform-template";

async function assertPlatformAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden: platform admin required");
}

/* Extract storage object paths from public URLs of our buckets */
const BUCKETS = ["product-images", "site-assets", "store-assets"] as const;
function extractStoragePath(url: string | null | undefined): { bucket: string; path: string } | null {
  if (!url || typeof url !== "string") return null;
  for (const b of BUCKETS) {
    const marker = `/storage/v1/object/public/${b}/`;
    const idx = url.indexOf(marker);
    if (idx >= 0) return { bucket: b, path: url.slice(idx + marker.length) };
  }
  return null;
}

/**
 * Files under `product-images/template/*` belong to the platform Model Store
 * (PLATFORM_TEMPLATE_STORE_ID). They are shared across every customer store
 * and MUST never be cleaned up when an individual store is deleted. This
 * helper is the in-app safety net; storage RLS provides the hard guarantee.
 */
function isProtectedTemplateAsset(bucket: string, path: string): boolean {
  return bucket === "product-images" && path.startsWith("template/");
}

export const deleteStoreCompletely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ storeId: z.string().uuid(), confirmName: z.string().min(1) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertPlatformAdmin(userId);
    const { storeId, confirmName } = data;
    if (storeId === PLATFORM_TEMPLATE_STORE_ID) throw new Error("refusing to delete platform template");

    const { data: store, error: sErr } = await supabaseAdmin
      .from("stores").select("id, name, slug, logo_url, favicon_url").eq("id", storeId).maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!store) throw new Error("store not found");
    if (store.name !== confirmName) throw new Error("confirmation name does not match");

    // 1) Collect storage paths to delete (before we wipe rows).
    const filesByBucket: Record<string, string[]> = {};
    const queue = (u: string | null | undefined) => {
      const p = extractStoragePath(u);
      if (p) (filesByBucket[p.bucket] ||= []).push(p.path);
    };
    queue(store.logo_url); queue(store.favicon_url);

    const { data: products } = await supabaseAdmin.from("products").select("id, image_url").eq("store_id", storeId);
    const productIds = (products ?? []).map((p) => p.id);
    (products ?? []).forEach((p) => queue(p.image_url));

    if (productIds.length) {
      const { data: pimgs } = await supabaseAdmin.from("product_images").select("image_url").in("product_id", productIds);
      (pimgs ?? []).forEach((r) => queue(r.image_url));
    }

    const { data: addons } = await supabaseAdmin.from("add_ons").select("id, image_url").eq("store_id", storeId);
    const addonIds = (addons ?? []).map((a) => a.id);
    (addons ?? []).forEach((a) => queue(a.image_url));
    if (addonIds.length) {
      const { data: aimgs } = await supabaseAdmin.from("addon_images").select("image_url").in("addon_id", addonIds);
      (aimgs ?? []).forEach((r) => queue(r.image_url));
    }

    const { data: cats } = await supabaseAdmin.from("categories").select("bg_image_url").eq("store_id", storeId);
    (cats ?? []).forEach((c) => queue(c.bg_image_url));

    const { data: heroes } = await supabaseAdmin.from("hero_slides").select("media_url").eq("store_id", storeId);
    (heroes ?? []).forEach((h) => queue(h.media_url));

    const { data: popups } = await supabaseAdmin.from("site_popups").select("image_url, bg_video_url").eq("store_id", storeId);
    (popups ?? []).forEach((p) => { queue(p.image_url); queue(p.bg_video_url); });

    // 2) Delete DB rows in dependency order.
    const { data: orders } = await supabaseAdmin.from("orders").select("id").eq("store_id", storeId);
    const orderIds = (orders ?? []).map((o) => o.id);
    if (orderIds.length) {
      await supabaseAdmin.from("order_items").delete().in("order_id", orderIds);
      await supabaseAdmin.from("order_status_history").delete().in("order_id", orderIds);
    }
    await supabaseAdmin.from("coupon_usages").delete().eq("store_id", storeId);
    await supabaseAdmin.from("orders").delete().eq("store_id", storeId);
    await supabaseAdmin.from("coupons").delete().eq("store_id", storeId);
    await supabaseAdmin.from("popup_subscribers").delete().eq("store_id", storeId);
    await supabaseAdmin.from("site_popups").delete().eq("store_id", storeId);
    await supabaseAdmin.from("hero_slides").delete().eq("store_id", storeId);
    await supabaseAdmin.from("legal_documents").delete().eq("store_id", storeId);
    await supabaseAdmin.from("customer_tags").delete().eq("store_id", storeId);
    await supabaseAdmin.from("pricing_rules").delete().eq("store_id", storeId);
    await supabaseAdmin.from("broadcasts").delete().eq("store_id", storeId);

    const { data: cIds } = await supabaseAdmin.from("couriers").select("id").eq("store_id", storeId);
    const courierIds = (cIds ?? []).map((c) => c.id);
    if (courierIds.length) {
      await supabaseAdmin.from("courier_locations").delete().in("courier_id", courierIds);
    }
    await supabaseAdmin.from("couriers").delete().eq("store_id", storeId);

    if (productIds.length) {
      await supabaseAdmin.from("product_images").delete().in("product_id", productIds);
      await supabaseAdmin.from("product_sizes").delete().in("product_id", productIds);
      await supabaseAdmin.from("product_categories").delete().in("product_id", productIds);
    }
    if (addonIds.length) {
      await supabaseAdmin.from("addon_images").delete().in("addon_id", addonIds);
    }
    await supabaseAdmin.from("products").delete().eq("store_id", storeId);
    await supabaseAdmin.from("add_ons").delete().eq("store_id", storeId);
    await supabaseAdmin.from("categories").delete().eq("store_id", storeId);
    await supabaseAdmin.from("site_settings").delete().eq("store_id", storeId);
    await supabaseAdmin.from("store_members").delete().eq("store_id", storeId);
    // FK-cascaded: store_subscriptions, store_features, billing_tokens
    const { error: dErr } = await supabaseAdmin.from("stores").delete().eq("id", storeId);
    if (dErr) throw new Error(dErr.message);

    // 3) Remove storage files.
    let removed = 0;
    for (const bucket of Object.keys(filesByBucket)) {
      const paths = Array.from(new Set(filesByBucket[bucket]))
        .filter(Boolean)
        .filter((p) => !isProtectedTemplateAsset(bucket, p));
      if (!paths.length) continue;
      const { error } = await supabaseAdmin.storage.from(bucket).remove(paths);
      if (!error) removed += paths.length;
    }

    return { ok: true, removedFiles: removed };
  });

export const listPlatformShops = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertPlatformAdmin(userId);

    const [{ data: stores }, { data: subs }, { data: orders }, { data: members }] = await Promise.all([
      supabaseAdmin.from("stores").select("id, slug, name, active, plan, owner_user_id, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("store_subscriptions").select("store_id, plan_key, status, provider, current_period_end"),
      supabaseAdmin.from("orders").select("store_id, total, created_at").is("deleted_at", null),
      supabaseAdmin.from("store_members").select("store_id, user_id, role"),
    ]);

    const ownerIds = Array.from(new Set([
      ...(stores ?? []).map((s) => s.owner_user_id).filter(Boolean) as string[],
      ...(members ?? []).map((m) => m.user_id) as string[],
    ]));
    let emailMap = new Map<string, string>();
    if (ownerIds.length) {
      // Use admin auth API to resolve emails (no auth.users RLS access otherwise).
      const { data: usersRes } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      emailMap = new Map((usersRes?.users ?? []).map((u) => [u.id, u.email ?? ""]));
    }

    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const statsByStore = new Map<string, { orders30d: number; revenue30d: number; ordersAll: number; revenueAll: number }>();
    for (const o of orders ?? []) {
      const k = o.store_id as string;
      const cur = statsByStore.get(k) || { orders30d: 0, revenue30d: 0, ordersAll: 0, revenueAll: 0 };
      cur.ordersAll += 1;
      cur.revenueAll += Number(o.total || 0);
      if (new Date(o.created_at as string).getTime() >= since) {
        cur.orders30d += 1;
        cur.revenue30d += Number(o.total || 0);
      }
      statsByStore.set(k, cur);
    }
    const subByStore = new Map((subs ?? []).map((s) => [s.store_id as string, s]));
    return (stores ?? []).map((s) => ({
      id: s.id, slug: s.slug, name: s.name, active: s.active, plan: s.plan,
      ownerEmail: s.owner_user_id ? emailMap.get(s.owner_user_id) ?? "" : "",
      subscription: subByStore.get(s.id) ?? null,
      stats: statsByStore.get(s.id) ?? { orders30d: 0, revenue30d: 0, ordersAll: 0, revenueAll: 0 },
      createdAt: s.created_at,
    }));
  });

/** Admin-only: list full store rows including PII columns (contact_email, owner_user_id). */
export const adminListStoresFull = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertPlatformAdmin(userId);
    const { data, error } = await supabaseAdmin
      .from("stores")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  });

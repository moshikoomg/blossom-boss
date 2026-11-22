import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cloneTemplateCatalog } from "./store-create.functions";

const PaletteSchema = z
  .object({
    primary: z.string().optional(),
    accent: z.string().optional(),
    bg: z.string().optional(),
    text: z.string().optional(),
  })
  .partial();

const InputSchema = z.object({
  scan_token: z.string().min(1).max(128),
  palette_override: PaletteSchema.optional(),
});

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "store";
}

function toNumberPrice(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function stringFrom(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

export const finalizeScanIntoStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId, claims } = context as {
      userId: string;
      claims: { email?: string };
    };

    // 1. Load scan
    const { data: scan, error: scanErr } = await supabaseAdmin
      .from("lead_scans")
      .select("*")
      .eq("scan_token", data.scan_token)
      .maybeSingle();
    if (scanErr) throw new Error(`scan_read_failed: ${scanErr.message}`);
    if (!scan) throw new Error("scan_not_found");

    // Idempotent — already finalized
    if (scan.store_id) {
      const { data: existing } = await supabaseAdmin
        .from("stores")
        .select("id, slug")
        .eq("id", scan.store_id)
        .maybeSingle();
      if (existing) return { storeId: existing.id, slug: existing.slug, reused: true };
    }

    if (scan.status !== "ready") {
      // Allow finalization for scans that have been OTP-verified, even if
      // Make.com still has them as 'scanning'/'pending'/'failed'. This is
      // the post-OTP recovery path so the user always lands on a real store.
      if (!scan.verified_at) {
        throw new Error(`scan_not_ready_or_verified:${scan.status}`);
      }
      console.info("[finalize] proceeding on verified-but-not-ready scan", {
        scan_token: data.scan_token,
        status: scan.status,
      });
    }

    // 2. Resolve defaults
    const businessName =
      (scan.discovered_business_name || scan.business_name || "החנות שלי").trim();
    const palette = (data.palette_override ?? (scan.discovered_palette as any) ?? {}) as {
      primary?: string;
      accent?: string;
      bg?: string;
      text?: string;
      secondary?: string;
    };
    const themePrimary = palette.primary || "#c9356b";
    const themeAccent = palette.accent || palette.secondary || "#f8c8d8";
    const themeBg = palette.bg || "#fdf6f7";
    const themeText = palette.text || "#1c0d12";
    const logoUrl = scan.discovered_logo_url || "";
    const phone = scan.discovered_phone || scan.requested_phone || "";
    const products = Array.isArray(scan.discovered_products)
      ? (scan.discovered_products as Array<Record<string, unknown>>)
      : [];
    const categories = Array.isArray(scan.discovered_categories)
      ? (scan.discovered_categories as unknown[]).filter(
          (c): c is string => typeof c === "string" && c.trim().length > 0,
        )
      : [];
    const storeAddons = Array.isArray((scan as any).discovered_addons)
      ? ((scan as any).discovered_addons as Array<Record<string, unknown>>)
      : [];
    const workingHours = Array.isArray((scan as any).discovered_working_hours)
      ? ((scan as any).discovered_working_hours as Array<Record<string, unknown>>)
      : [];
    console.info("[finalize] loaded scan", {
      scan_token: data.scan_token,
      status: scan.status,
      verified: Boolean(scan.verified_at),
      products: products.length,
      categories: categories.length,
    });

    // 3. Slug
    let slug = slugify(businessName);
    for (let i = 0; i < 6; i++) {
      const { data: clash } = await supabaseAdmin
        .from("stores")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!clash) break;
      slug = `${slugify(businessName)}-${Math.random().toString(36).slice(2, 6)}`;
    }

    // 4. Store
    const theme = {
      primary: themePrimary,
      accent: themeAccent,
      secondary: themeAccent,
      background: themeBg,
      foreground: themeText,
    };
    const { data: store, error: sErr } = await supabaseAdmin
      .from("stores")
      .insert({
        slug,
        name: businessName,
        description: "",
        owner_user_id: userId,
        active: true,
        plan: "trial",
        theme: theme as any,
        logo_url: logoUrl,
        contact_email: claims?.email ?? "",
        contact_phone: phone,
        whatsapp_business: phone,
        working_hours: workingHours as any,
      })
      .select("id, slug, name")
      .single();
    if (sErr || !store) throw new Error(`store_insert_failed: ${sErr?.message}`);
    console.info("[finalize] store inserted", { storeId: store.id, slug: store.slug });

    // 5. Membership
    await supabaseAdmin
      .from("store_members")
      .insert({ store_id: store.id, user_id: userId, role: "owner" })
      .select("id")
      .maybeSingle();

    // 6. Trial subscription
    const trialEnds = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await supabaseAdmin.from("store_subscriptions").insert({
      store_id: store.id,
      plan_key: "pro",
      status: "trialing",
      provider: "manual",
      is_trial: true,
      trial_ends_at: trialEnds,
      payment_method_attached: false,
      current_period_end: trialEnds,
    });

    // 7. Pro feature flags
    await supabaseAdmin.from("store_features").upsert(
      ["ai_chat", "image_studio_ai", "custom_domain", "email_broadcasts", "whatsapp"].map(
        (feature_key) => ({
          store_id: store.id,
          feature_key,
          enabled: true,
          enabled_at: new Date().toISOString(),
          expires_at: trialEnds,
        }),
      ),
      { onConflict: "store_id,feature_key" },
    );

    // 8. Categories
    // Deep-clone the platform showcase template (banner, character, hero,
    // popups, add-ons, settings). This is the base of every new store —
    // even scan-imported ones — so the visual structure stays consistent.
    await cloneTemplateCatalog(store.id, theme as any);
    console.info("[finalize] template cloned", { storeId: store.id });

    // If the scan returned real data (products OR categories), REPLACE the
    // cloned catalog with the merchant's actual products + categories.
    // Hero slides, pop-ups and site_settings from the template stay in place.
    const categoryIdByName = new Map<string, string>();
    let defaultCategoryId: string | null = null;
    const hasScanData = products.length > 0 || categories.length > 0;
    if (hasScanData) {
      // Wipe cloned categories/products for this store only
      const { data: clonedProducts } = await supabaseAdmin
        .from("products").select("id").eq("store_id", store.id);
      const clonedProductIds = (clonedProducts ?? []).map((r) => r.id);
      if (clonedProductIds.length) {
        await supabaseAdmin.from("product_images").delete().in("product_id", clonedProductIds);
        await supabaseAdmin.from("product_sizes").delete().in("product_id", clonedProductIds);
        await supabaseAdmin.from("product_categories").delete().in("product_id", clonedProductIds);
      }
      await supabaseAdmin.from("products").delete().eq("store_id", store.id);
      await supabaseAdmin.from("categories").delete().eq("store_id", store.id);

      // Build the combined category list: explicit scan categories +
      // any category names referenced by products that weren't listed.
      const orderedNames: string[] = [];
      const seenCat = new Set<string>();
      const pushCat = (raw: unknown) => {
        const n = stringFrom(raw);
        if (!n) return;
        const k = n.toLowerCase();
        if (seenCat.has(k)) return;
        seenCat.add(k);
        orderedNames.push(n);
      };
      categories.forEach(pushCat);
      products.forEach((p) => pushCat((p as any).category));
      if (orderedNames.length === 0) orderedNames.push("כללי");

      for (let i = 0; i < orderedNames.length; i++) {
        const { data: cat, error: cErr } = await supabaseAdmin
          .from("categories")
          .insert({
            store_id: store.id,
            name: orderedNames[i],
            display_order: i,
            active: true,
          })
          .select("id")
          .single();
        if (cErr || !cat) throw new Error(`category_insert_failed: ${cErr?.message}`);
        categoryIdByName.set(orderedNames[i].toLowerCase(), cat.id);
        if (i === 0) defaultCategoryId = cat.id;
      }
    }

    if (products.length > 0) {
      const rows = products.map((p, idx) => {
        const name =
          stringFrom(p.name) ||
          stringFrom((p as any).title) ||
          stringFrom((p as any).product_name) ||
          "מוצר";
        const image =
          stringFrom(p.image_url) ||
          stringFrom((p as any).imageUrl) ||
          stringFrom((p as any).image) ||
          stringFrom((p as any).img) ||
          stringFrom((p as any).photo) ||
          "";
        const desc =
          stringFrom(p.description) ||
          stringFrom((p as any).text) ||
          stringFrom((p as any).summary) ||
          "";
        const price = toNumberPrice(
          (p as any).price ?? (p as any).sale_price ?? (p as any).amount ?? (p as any).cost,
        );
        const hasValidImage = /^https?:\/\//i.test(image);
        const pCatName = stringFrom((p as any).category).toLowerCase();
        const pCatId =
          (pCatName && categoryIdByName.get(pCatName)) || defaultCategoryId;
        return {
          store_id: store.id,
          name,
          description: desc,
          price,
          image_url: hasValidImage ? image : "",
          category_id: pCatId,
          active: true,
          stock: 50,
          rating: 5,
          display_order: idx,
        };
      });
      const { data: insertedProducts, error: pErr } = await supabaseAdmin
        .from("products")
        .insert(rows)
        .select("id, display_order");
      if (pErr) {
        console.error("[finalize] products_insert_failed", pErr);
        throw new Error(`products_insert_failed: ${pErr.message}`);
      }
      console.info("[finalize] products inserted", { count: rows.length });

      // 9b. Per-product extras: extra images, price variations (sizes), addons
      const productIdByIndex = new Map<number, string>();
      for (const r of insertedProducts ?? []) {
        productIdByIndex.set(Number(r.display_order), r.id as string);
      }
      const imageRows: any[] = [];
      const sizeRows: any[] = [];
      products.forEach((p, idx) => {
        const pid = productIdByIndex.get(idx);
        if (!pid) return;
        const extraImgs = Array.isArray((p as any).images) ? ((p as any).images as unknown[]) : [];
        extraImgs.forEach((u, i) => {
          if (typeof u === "string" && /^https?:\/\//i.test(u)) {
            imageRows.push({ product_id: pid, image_url: u, display_order: i });
          }
        });
        const variations = Array.isArray((p as any).price_variations)
          ? ((p as any).price_variations as Array<Record<string, unknown>>)
          : Array.isArray((p as any).sizes)
            ? ((p as any).sizes as Array<Record<string, unknown>>)
            : [];
        variations.forEach((v, i) => {
          const label = stringFrom((v as any).label) || stringFrom((v as any).name);
          if (!label) return;
          const vPrice = toNumberPrice((v as any).price);
          const op = (v as any).original_price;
          sizeRows.push({
            product_id: pid,
            label,
            price: vPrice,
            original_price: op !== undefined && op !== null ? toNumberPrice(op) : null,
            display_order: i,
          });
        });
      });
      if (imageRows.length) {
        const { error } = await supabaseAdmin.from("product_images").insert(imageRows);
        if (error) console.error("[finalize] product_images_insert_failed (non-fatal)", error);
      }
      if (sizeRows.length) {
        const { error } = await supabaseAdmin.from("product_sizes").insert(sizeRows);
        if (error) console.error("[finalize] product_sizes_insert_failed (non-fatal)", error);
      }

    }

    // 9c. Store-level add-ons (independent of products): merge top-level
    // addons + per-product addons, de-duped by name. Always runs when the
    // scan returned any addons — so even an addons-only scan is honored.
    {
      const perProductAddons: Array<Record<string, unknown>> = [];
      products.forEach((p) => {
        const pAddons = Array.isArray((p as any).addons) ? (p as any).addons : [];
        for (const a of pAddons) perProductAddons.push(a as Record<string, unknown>);
      });
      const addonPool: Array<Record<string, unknown>> = [...storeAddons, ...perProductAddons];
      const seen = new Set<string>();
      const addonRows: any[] = [];
      addonPool.forEach((a, i) => {
        const name = stringFrom((a as any).name);
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const img = stringFrom((a as any).image_url) || stringFrom((a as any).image);
        addonRows.push({
          store_id: store.id,
          name,
          price: toNumberPrice((a as any).price),
          image_url: /^https?:\/\//i.test(img) ? img : "",
          active: true,
          display_order: i,
        });
      });
      if (addonRows.length) {
        await supabaseAdmin.from("add_ons").delete().eq("store_id", store.id);
        const { error } = await supabaseAdmin.from("add_ons").insert(addonRows);
        if (error) console.error("[finalize] addons_insert_failed (non-fatal)", error);
      }
    }

    // 9d. Human-readable working_hours string for the footer (always, even
    //     when no products were scanned). Keeps the structured JSON on stores
    //     and a flat string on site_settings for the existing footer render.
    if (workingHours.length) {
      const lines = workingHours
        .map((w) => {
          const day = stringFrom((w as any).day);
          if (!day) return "";
          if ((w as any).closed) return `${day}: סגור`;
          const open = stringFrom((w as any).open);
          const close = stringFrom((w as any).close);
          if (open && close) return `${day}: ${open}–${close}`;
          const note = stringFrom((w as any).note);
          return note ? `${day}: ${note}` : "";
        })
        .filter(Boolean);
      if (lines.length) {
        await supabaseAdmin.from("site_settings").upsert(
          [{ store_id: store.id, key: "store_hours", value: lines.join(" · ") as any }],
          { onConflict: "store_id,key" },
        );
      }
    }

    // 10. Site settings
    const { error: ssErr } = await supabaseAdmin.from("site_settings").upsert(
      [
        { store_id: store.id, key: "store_name", value: businessName as any },
        { store_id: store.id, key: "store_tagline", value: "" as any },
        { store_id: store.id, key: "store_city", value: "" as any },
        { store_id: store.id, key: "theme_primary", value: themePrimary as any },
        { store_id: store.id, key: "theme_accent", value: themeAccent as any },
      ],
      { onConflict: "store_id,key" },
    );
    if (ssErr) console.error("[finalize] site_settings_upsert_failed (non-fatal)", ssErr);

    // 11. Mark scan finalized
    const { error: scanUpdErr } = await supabaseAdmin
      .from("lead_scans")
      .update({ verified_at: new Date().toISOString(), store_id: store.id })
      .eq("scan_token", data.scan_token);
    if (scanUpdErr) console.error("[finalize] lead_scans_update_failed (non-fatal)", scanUpdErr);
    console.info("[finalize] done", { storeId: store.id });

    return { storeId: store.id, slug: store.slug, reused: false };
  });

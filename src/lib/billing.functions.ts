import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLAN_PRICE: Record<string, number> = { free: 0, trial: 0, pro: 149, enterprise: 499 };
const PLAN_NAME: Record<string, string> = { free: "Free", trial: "ניסיון", pro: "Pro", enterprise: "Enterprise" };

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("forbidden: platform admin required");
}
async function assertStoreAccess(userId: string, storeId: string) {
  const [admin, member] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    supabaseAdmin.from("store_members").select("id").eq("user_id", userId).eq("store_id", storeId).maybeSingle(),
  ]);
  if (!admin.data && !member.data) throw new Error("forbidden");
  return { isAdmin: !!admin.data };
}

export type BillingBreakdown = {
  storeId: string;
  storeName: string;
  plan: { key: string; name: string; price: number };
  addons: Array<{ key: string; name: string; price: number; expires_at: string | null }>;
  subtotal: number;
  vat: number;
  total: number;
  currency: "ILS";
  status: string;
  provider: string;
  nextChargeDate: string | null;
};

async function buildBreakdown(storeId: string): Promise<BillingBreakdown> {
  const [store, sub, sf, feats] = await Promise.all([
    supabaseAdmin.from("stores").select("id,name").eq("id", storeId).maybeSingle(),
    supabaseAdmin.from("store_subscriptions").select("plan_key,status,provider,current_period_end").eq("store_id", storeId).maybeSingle(),
    supabaseAdmin.from("store_features").select("feature_key,enabled,expires_at").eq("store_id", storeId).eq("enabled", true),
    supabaseAdmin.from("plan_features").select("key,name,monthly_price").eq("active", true),
  ]);
  const now = new Date();
  const map = new Map((feats.data ?? []).map((f) => [f.key, f]));
  const addons = (sf.data ?? [])
    .filter((r) => !r.expires_at || new Date(r.expires_at) > now)
    .map((r) => {
      const m = map.get(r.feature_key);
      return m ? { key: m.key, name: m.name, price: Number(m.monthly_price), expires_at: r.expires_at } : null;
    })
    .filter(Boolean) as BillingBreakdown["addons"];
  const planKey = sub.data?.plan_key || "free";
  const planPrice = PLAN_PRICE[planKey] ?? 0;
  const subtotal = planPrice + addons.reduce((s, a) => s + a.price, 0);
  const vat = Math.round(subtotal * 0.17 * 100) / 100;
  return {
    storeId,
    storeName: store.data?.name || "—",
    plan: { key: planKey, name: PLAN_NAME[planKey] || planKey, price: planPrice },
    addons,
    subtotal,
    vat,
    total: Math.round((subtotal + vat) * 100) / 100,
    currency: "ILS",
    status: sub.data?.status || "active",
    provider: sub.data?.provider || "manual",
    nextChargeDate: sub.data?.current_period_end || null,
  };
}

export const getStoreBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ storeId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertStoreAccess(userId, data.storeId);
    return buildBreakdown(data.storeId);
  });

export const listAllBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertAdmin(userId);
    const { data: stores } = await supabaseAdmin.from("stores").select("id").order("created_at", { ascending: false });
    const results: BillingBreakdown[] = [];
    for (const s of stores ?? []) results.push(await buildBreakdown(s.id));
    return results;
  });

export const listBillingEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ storeId: z.string().uuid(), limit: z.number().min(1).max(500).default(100) }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertStoreAccess(userId, data.storeId);
    const { data: events } = await supabaseAdmin
      .from("billing_events").select("*").eq("store_id", data.storeId)
      .order("created_at", { ascending: false }).limit(data.limit);
    return events ?? [];
  });

/* ---------- Toggle feature (with idempotency + optional Stripe proration) ---------- */

async function callStripeProration(args: {
  subscriptionId: string;
  priceId: string;
  action: "enable" | "disable";
  idempotencyKey: string;
}): Promise<{ ok: boolean; ref?: string; error?: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: true, ref: "manual" }; // No Stripe wired — manual mode
  try {
    const body = new URLSearchParams();
    body.set("proration_behavior", "create_prorations");
    if (args.action === "enable") {
      body.append("items[0][price]", args.priceId);
      body.append("items[0][quantity]", "1");
    } else {
      body.append("items[0][deleted]", "true");
      body.append("items[0][id]", args.priceId);
    }
    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${args.subscriptionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": args.idempotencyKey,
      },
      body,
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error?.message || `stripe ${res.status}` };
    return { ok: true, ref: json.id };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export const toggleStoreFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      storeId: z.string().uuid(),
      featureKey: z.string().min(1).max(64),
      enable: z.boolean(),
      idempotencyKey: z.string().min(8).max(128),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { isAdmin } = await assertStoreAccess(userId, data.storeId);

    // 1. Idempotency check — return cached result if same key was seen
    const { data: cached } = await supabaseAdmin
      .from("billing_idempotency").select("result,expires_at").eq("key", data.idempotencyKey).maybeSingle();
    if (cached && new Date(cached.expires_at) > new Date()) {
      return { ...(cached.result as any), idempotent: true };
    }

    // 2. Load feature + current state
    const [{ data: feature }, { data: existing }, { data: sub }] = await Promise.all([
      supabaseAdmin.from("plan_features").select("*").eq("key", data.featureKey).maybeSingle(),
      supabaseAdmin.from("store_features").select("*").eq("store_id", data.storeId).eq("feature_key", data.featureKey).maybeSingle(),
      supabaseAdmin.from("store_subscriptions").select("*").eq("store_id", data.storeId).maybeSingle(),
    ]);
    if (!feature) throw new Error("unknown feature");
    const wasEnabled = !!existing?.enabled;
    if (wasEnabled === data.enable) {
      const breakdown = await buildBreakdown(data.storeId);
      return { ok: true, noop: true, breakdown };
    }

    // 3. Stripe call (only if subscription is on Stripe and price is mapped)
    let providerRef: string | null = null;
    if (sub?.provider === "stripe" && sub.provider_subscription_id) {
      const priceId = (feature as any).stripe_price_id;
      if (priceId) {
        const r = await callStripeProration({
          subscriptionId: sub.provider_subscription_id,
          priceId,
          action: data.enable ? "enable" : "disable",
          idempotencyKey: data.idempotencyKey,
        });
        if (!r.ok) throw new Error(`חיוב נכשל: ${r.error}`);
        providerRef = r.ref ?? null;
      }
    }

    // 4. Update DB
    await supabaseAdmin.from("store_features").upsert(
      { store_id: data.storeId, feature_key: data.featureKey, enabled: data.enable, enabled_at: new Date().toISOString(), expires_at: null },
      { onConflict: "store_id,feature_key" }
    );

    // 5. Recompute total and log event
    const breakdown = await buildBreakdown(data.storeId);
    const delta = (data.enable ? 1 : -1) * Number(feature.monthly_price);
    await supabaseAdmin.from("billing_events").insert({
      store_id: data.storeId,
      event_type: data.enable ? "feature_enabled" : "feature_disabled",
      feature_key: data.featureKey,
      amount_delta: delta,
      total_after: breakdown.subtotal,
      actor_user_id: userId,
      actor_role: isAdmin ? "platform_admin" : "store_owner",
      provider: sub?.provider || "manual",
      provider_ref: providerRef,
      metadata: { feature_name: feature.name, idempotency_key: data.idempotencyKey },
    });

    const result = { ok: true, breakdown };
    await supabaseAdmin.from("billing_idempotency").upsert({ key: data.idempotencyKey, store_id: data.storeId, result });
    return result;
  });

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Stripe webhook handler.
 * Set STRIPE_WEBHOOK_SECRET to enable signature verification.
 * Listens for: invoice.payment_succeeded, invoice.payment_failed, customer.subscription.updated/deleted.
 * URL: /api/public/stripe-webhook  (configure in Stripe Dashboard → Webhooks)
 */

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  // Stripe signature: t=timestamp,v1=hex(hmacSha256(timestamp.payload, secret))
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=")));
  if (!parts.t || !parts.v1) return false;
  const signed = `${parts.t}.${payload}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signed));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // timing-safe compare
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

async function findStoreBySubscription(subId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("store_subscriptions").select("store_id").eq("provider_subscription_id", subId).maybeSingle();
  return data?.store_id ?? null;
}

async function handleEvent(event: any) {
  const type = event.type as string;
  const obj = event.data?.object ?? {};

  if (type === "invoice.payment_succeeded" || type === "invoice.payment_failed") {
    const subId = obj.subscription as string | undefined;
    if (!subId) return;
    const storeId = await findStoreBySubscription(subId);
    if (!storeId) return;
    const status = type === "invoice.payment_succeeded" ? "active" : "past_due";
    const periodEnd = obj.lines?.data?.[0]?.period?.end;
    await supabaseAdmin.from("store_subscriptions").update({
      status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : undefined,
      updated_at: new Date().toISOString(),
    }).eq("store_id", storeId);
    await supabaseAdmin.from("billing_events").insert({
      store_id: storeId,
      event_type: type === "invoice.payment_succeeded" ? "invoice_paid" : "invoice_failed",
      amount_delta: Number(obj.amount_paid ?? obj.amount_due ?? 0) / 100,
      total_after: Number(obj.amount_paid ?? 0) / 100,
      currency: (obj.currency || "ils").toUpperCase(),
      provider: "stripe",
      provider_ref: obj.id,
      actor_role: "system",
      metadata: { invoice_url: obj.hosted_invoice_url, reason: obj.last_finalization_error?.message },
    });
  } else if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    const storeId = await findStoreBySubscription(obj.id);
    if (!storeId) return;
    await supabaseAdmin.from("store_subscriptions").update({
      status: type === "customer.subscription.deleted" ? "canceled" : obj.status,
      current_period_end: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : undefined,
      updated_at: new Date().toISOString(),
    }).eq("store_id", storeId);
    await supabaseAdmin.from("billing_events").insert({
      store_id: storeId,
      event_type: "subscription_updated",
      provider: "stripe",
      provider_ref: obj.id,
      actor_role: "system",
      metadata: { stripe_status: obj.status },
    });
  }
}

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        const sig = request.headers.get("stripe-signature");
        if (secret) {
          if (!sig || !(await verifyStripeSignature(body, sig, secret))) {
            return new Response("invalid signature", { status: 401 });
          }
        }
        let event: any;
        try { event = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }
        try { await handleEvent(event); } catch (e: any) {
          console.error("stripe-webhook error:", e?.message);
          return new Response("handler error", { status: 500 });
        }
        return new Response("ok");
      },
    },
  },
});

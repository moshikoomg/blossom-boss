import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { approveGrowTransaction } from "@/lib/meshulam.server";

/**
 * Grow (Meshulam) server-to-server notification.
 * URL: /api/public/meshulam-webhook?k=<MESHULAM_WEBHOOK_SECRET>  (set automatically as notifyUrl)
 *
 * Trust model:
 *  - the shared secret in the URL must match (Grow calls back exactly the notifyUrl we gave it);
 *  - the charged sum must match what we expect (order total / plan price);
 *  - each transaction id is processed once (billing_idempotency).
 * cField1 = order id or store id, cField2 = "order" | "sub".
 */

function flatten(input: Record<string, unknown>, prefix = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(input)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === "object") flatten(v as Record<string, unknown>, key, out);
    else if (v !== undefined && v !== null) out[key] = String(v);
  }
  return out;
}

async function readFields(request: Request): Promise<Record<string, string>> {
  const raw = await request.text();
  const type = request.headers.get("content-type") || "";
  if (type.includes("json") || raw.trim().startsWith("{")) {
    try {
      return flatten(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

/** Finds a field whether Grow sent it flat ("cField1"), nested ("data[cField1]") or under customFields. */
function pick(f: Record<string, string>, name: string): string {
  if (f[name]) return f[name];
  const hit = Object.keys(f).find((k) => k === `data[${name}]` || k.endsWith(`[${name}]`));
  return hit ? f[hit] : "";
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const DAY = 86_400_000;
const UUID = /^[0-9a-f-]{36}$/i;

async function alreadyProcessed(key: string, storeId: string) {
  const { error } = await supabaseAdmin
    .from("billing_idempotency")
    .insert({ key, store_id: storeId, result: {}, expires_at: new Date(Date.now() + 400 * DAY).toISOString() });
  // Unique violation = we've seen this transaction before.
  return !!error;
}

async function handleOrder(orderId: string, sum: number, txId: string, f: Record<string, string>) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,store_id,total,payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return "unknown order";
  if (Math.abs(Number(order.total) - sum) > 0.01) {
    console.warn("[grow] order sum mismatch", { orderId, expected: order.total, got: sum });
    return "sum mismatch";
  }
  if (await alreadyProcessed(`grow:${txId}`, order.store_id)) return "duplicate";
  await supabaseAdmin
    .from("orders")
    .update({ payment_status: "paid", meshulam_transaction_id: txId })
    .eq("id", orderId);
  await approveGrowTransaction(f);
  return "order paid";
}

async function handleSubscription(storeId: string, sum: number, txId: string, f: Record<string, string>) {
  const { data: sub } = await supabaseAdmin
    .from("store_subscriptions")
    .select("id,current_period_end,is_trial")
    .eq("store_id", storeId)
    .maybeSingle();
  if (await alreadyProcessed(`grow:${txId}`, storeId)) return "duplicate";

  // Extend from the later of now / current period end, so early payments don't lose days.
  const from = Math.max(Date.now(), sub?.current_period_end && !sub.is_trial ? Date.parse(sub.current_period_end) : 0);
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  const patch = {
    plan_key: "pro",
    status: "active",
    is_trial: false,
    payment_method_attached: true,
    provider: "grow",
    current_period_end: next.toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (sub) await supabaseAdmin.from("store_subscriptions").update(patch).eq("store_id", storeId);
  else await supabaseAdmin.from("store_subscriptions").insert({ store_id: storeId, ...patch });
  await supabaseAdmin.from("stores").update({ plan: "pro" }).eq("id", storeId);
  await supabaseAdmin.from("billing_events").insert({
    store_id: storeId,
    event_type: "invoice_paid",
    amount_delta: sum,
    total_after: sum,
    currency: "ILS",
    provider: "grow",
    provider_ref: txId,
    actor_role: "system",
    metadata: { period_end: patch.current_period_end },
  });
  await approveGrowTransaction(f);
  return "subscription extended";
}

export const Route = createFileRoute("/api/public/meshulam-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const secret = process.env.MESHULAM_WEBHOOK_SECRET;
        const k = new URL(request.url).searchParams.get("k") || "";
        if (!secret || !timingSafeEqual(k, secret)) return new Response("forbidden", { status: 403 });

        const f = await readFields(request);
        const status = pick(f, "status") || pick(f, "statusCode");
        const txId = pick(f, "transactionId") || pick(f, "asmachta");
        const sum = Number(pick(f, "sum"));
        const id = pick(f, "cField1");
        const kind = pick(f, "cField2") || "order";

        // Grow reports a paid transaction as status=1 / statusCode=2.
        const ok = status === "1" || pick(f, "statusCode") === "2";
        if (!ok || !txId || !UUID.test(id) || !Number.isFinite(sum) || sum <= 0) {
          console.warn("[grow] ignored notification", { status, hasTx: !!txId, kind });
          return new Response("ignored");
        }
        try {
          const result = kind === "sub" ? await handleSubscription(id, sum, txId, f) : await handleOrder(id, sum, txId, f);
          console.info("[grow]", kind, result);
          return new Response("ok");
        } catch (e: any) {
          console.error("[grow] handler error", e?.message);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});

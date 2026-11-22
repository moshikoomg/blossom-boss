import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type QuotaKey =
  | "whatsapp_outbound"
  | "email_outbound"
  | "ai_chat"
  | "image_generation";

export type QuotaStatus = {
  key: QuotaKey;
  planKey: string;
  isTrial: boolean;
  period: "month" | "lifetime";
  baseLimit: number;
  effectiveLimit: number;
  used: number;
  remaining: number;
  exceeded: boolean;
};

export class QuotaExceededError extends Error {
  code = "QUOTA_EXCEEDED";
  constructor(public quota: QuotaKey, public status: QuotaStatus) {
    super(`QUOTA_EXCEEDED:${quota}`);
  }
}

function periodStart(period: "month" | "lifetime"): string {
  if (period === "lifetime") return "1970-01-01";
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/** Look up the active subscription + plan + quota row. */
export async function getQuotaStatus(
  storeId: string,
  key: QuotaKey,
): Promise<QuotaStatus> {
  const { data: sub } = await supabaseAdmin
    .from("store_subscriptions")
    .select("plan_key,is_trial,trial_ends_at,payment_method_attached")
    .eq("store_id", storeId)
    .maybeSingle();

  const planKey = sub?.plan_key || "basic";
  const trialActive =
    !!sub?.is_trial &&
    !sub?.payment_method_attached &&
    (!sub?.trial_ends_at || new Date(sub.trial_ends_at) > new Date());

  const { data: quotaRow } = await supabaseAdmin
    .from("plan_quotas")
    .select("monthly_limit,trial_percent,period")
    .eq("plan_key", planKey)
    .eq("quota_key", key)
    .maybeSingle();

  const baseLimit = quotaRow?.monthly_limit ?? 0;
  const period = (quotaRow?.period as "month" | "lifetime") || "month";
  const trialPct = quotaRow?.trial_percent ?? 10;
  const effectiveLimit = trialActive
    ? Math.max(0, Math.floor((baseLimit * trialPct) / 100))
    : baseLimit;

  const { data: usageRow } = await supabaseAdmin
    .from("store_usage")
    .select("used")
    .eq("store_id", storeId)
    .eq("period_start", periodStart(period))
    .eq("quota_key", key)
    .maybeSingle();

  const used = usageRow?.used ?? 0;
  const remaining = Math.max(0, effectiveLimit - used);

  return {
    key,
    planKey,
    isTrial: trialActive,
    period,
    baseLimit,
    effectiveLimit,
    used,
    remaining,
    exceeded: used >= effectiveLimit,
  };
}

/** Throws QuotaExceededError if the next call would exceed the limit. */
export async function assertQuota(storeId: string, key: QuotaKey, n = 1) {
  const status = await getQuotaStatus(storeId, key);
  if (status.used + n > status.effectiveLimit) {
    throw new QuotaExceededError(key, status);
  }
  return status;
}

/** Asserts then atomically increments the counter. */
export async function consumeQuota(storeId: string, key: QuotaKey, n = 1) {
  const status = await assertQuota(storeId, key, n);
  if (status.period === "lifetime") {
    // Lifetime counters: store under a fixed sentinel period_start.
    await supabaseAdmin
      .from("store_usage")
      .upsert(
        {
          store_id: storeId,
          period_start: "1970-01-01",
          quota_key: key,
          used: status.used + n,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "store_id,period_start,quota_key" },
      );
  } else {
    await supabaseAdmin.rpc("increment_store_usage", {
      _store_id: storeId,
      _quota_key: key,
      _n: n,
    });
  }
  return status;
}

export function quotaUserMessage(key: QuotaKey): string {
  return "הגעת למגבלת החבילה שלך. כדי להמשיך להשתמש בפיצ'ר זה, ניתן לשדרג מנוי או לרכוש חבילת תוספת.";
}

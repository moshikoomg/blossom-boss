import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getQuotaStatus, type QuotaKey, type QuotaStatus } from "./quota.server";

const KEYS: QuotaKey[] = [
  "whatsapp_outbound",
  "email_outbound",
  "ai_chat",
  "image_generation",
];

async function ensureAccess(userId: string, storeId: string) {
  const [admin, member] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    supabaseAdmin.from("store_members").select("id").eq("user_id", userId).eq("store_id", storeId).maybeSingle(),
  ]);
  if (!admin.data && !member.data) throw new Error("forbidden");
}

export type QuotaSummary = {
  isTrial: boolean;
  trialEndsAt: string | null;
  paymentAttached: boolean;
  planKey: string;
  quotas: QuotaStatus[];
};

export const getStoreQuotas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ storeId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<QuotaSummary> => {
    const { userId } = context as { userId: string };
    await ensureAccess(userId, data.storeId);

    const { data: sub } = await supabaseAdmin
      .from("store_subscriptions")
      .select("plan_key,is_trial,trial_ends_at,payment_method_attached")
      .eq("store_id", data.storeId)
      .maybeSingle();

    const quotas = await Promise.all(KEYS.map((k) => getQuotaStatus(data.storeId, k)));
    return {
      isTrial: !!sub?.is_trial,
      trialEndsAt: sub?.trial_ends_at ?? null,
      paymentAttached: !!sub?.payment_method_attached,
      planKey: sub?.plan_key || "basic",
      quotas,
    };
  });

/** Flip the subscription out of trial mode once a real payment method is attached.
 *  Called from the billing flow after a successful token save. */
export const activatePaidSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ storeId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await ensureAccess(userId, data.storeId);

    // Require an actual billing token before opening quotas to 100%.
    const { data: tok } = await supabaseAdmin
      .from("billing_tokens")
      .select("id")
      .eq("store_id", data.storeId)
      .limit(1)
      .maybeSingle();
    if (!tok) throw new Error("נדרש כרטיס אשראי מקושר לפני הפעלת המנוי הקבוע");

    const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await supabaseAdmin
      .from("store_subscriptions")
      .update({
        is_trial: false,
        payment_method_attached: true,
        status: "active",
        current_period_end: periodEnd,
      })
      .eq("store_id", data.storeId);
    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHost } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createGrowSubscriptionProcess } from "./meshulam.server";
import { getPlanSettings } from "./plan-settings.server";
import { withVat } from "./plans";
import { computeBillingState, type SubRow } from "./billing-state";

async function assertOwner(userId: string, storeId: string) {
  const [admin, member] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    supabaseAdmin
      .from("store_members")
      .select("role")
      .eq("user_id", userId)
      .eq("store_id", storeId)
      .in("role", ["owner", "manager"])
      .maybeSingle(),
  ]);
  if (!admin.data && !member.data) throw new Error("forbidden");
}

/** Billing state for the admin banner. */
export const getMyBillingState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ storeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertOwner(userId, data.storeId);
    const { data: sub } = await supabaseAdmin
      .from("store_subscriptions")
      .select("status,is_trial,trial_ends_at,current_period_end,provider")
      .eq("store_id", data.storeId)
      .maybeSingle();
    const plan = await getPlanSettings();
    return { billing: computeBillingState(sub as SubRow | null), price: withVat(plan.monthly_price_ils) };
  });

/** Opens the Grow recurring payment page for the store's monthly subscription. */
export const startSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        storeId: z.string().uuid(),
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().regex(/^[\d\-+ ()]{9,20}$/),
        email: z.string().trim().email().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertOwner(userId, data.storeId);
    const plan = await getPlanSettings();
    const { total } = withVat(plan.monthly_price_ils);
    const res = await createGrowSubscriptionProcess({
      storeId: data.storeId,
      sum: total,
      fullName: data.fullName,
      phone: data.phone,
      email: data.email,
      origin: `https://${getRequestHost()}`,
    });
    await supabaseAdmin.from("billing_events").insert({
      store_id: data.storeId,
      event_type: "subscription_checkout_started",
      amount_delta: total,
      currency: "ILS",
      actor_user_id: userId,
      actor_role: "owner",
      provider: "grow",
      metadata: { ok: "url" in res },
    });
    return "url" in res ? { ok: true as const, url: res.url } : { ok: false as const, error: res.error };
  });

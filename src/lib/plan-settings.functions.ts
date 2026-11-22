import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPlanSettings } from "./plan-settings.server";
import { VAT_RATE } from "./plans";

/** Public: trial length + monthly price (for the landing page and the admin). */
export const getPublicPlanSettings = createServerFn({ method: "GET" }).handler(async () => {
  const s = await getPlanSettings();
  return { ...s, vat_rate: VAT_RATE };
});

/** Super Admin only: change trial length and monthly price (before VAT). */
export const savePlanSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        trial_days: z.number().int().min(1).max(90),
        monthly_price_ils: z.number().positive().max(10000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("forbidden");
    const { error } = await supabaseAdmin
      .from("platform_content" as any)
      .upsert({ key: "billing", data, updated_at: new Date().toISOString(), updated_by: userId } as any, {
        onConflict: "key",
      });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

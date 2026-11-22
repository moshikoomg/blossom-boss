import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolvePlans, type PlanSettings } from "./plans";

/** Trial length + monthly price, editable from Super Admin (platform_content key "billing"). */
export async function getPlanSettings(): Promise<PlanSettings> {
  const { data } = await supabaseAdmin
    .from("platform_content" as any)
    .select("data")
    .eq("key", "billing")
    .maybeSingle();
  return resolvePlans((data as { data?: unknown } | null)?.data ?? null);
}

export function trialEndsFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

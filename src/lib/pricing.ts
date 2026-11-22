import { supabase } from "@/integrations/supabase/client";

export type PricingRule = {
  id: string;
  name: string;
  adjustment_type: "percent" | "amount";
  adjustment_value: number;
  scope: "all" | "category" | "product";
  scope_id: string | null;
  weekdays: number[] | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  priority: number;
};

let cache: { rules: PricingRule[]; ts: number } | null = null;

export async function getPricingRules(): Promise<PricingRule[]> {
  if (cache && Date.now() - cache.ts < 60000) return cache.rules;
  const { data } = await supabase.from("pricing_rules").select("*").eq("active", true);
  const rules = (data || []) as PricingRule[];
  cache = { rules, ts: Date.now() };
  return rules;
}

export function clearPricingCache() { cache = null; }

export function applyRules(basePrice: number, ctx: { productId?: string; categoryId?: string | null }, rules: PricingRule[], when = new Date()): number {
  const dow = when.getDay();
  const today = when.toISOString().slice(0, 10);
  let price = basePrice;
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    if (r.weekdays && r.weekdays.length > 0 && !r.weekdays.includes(dow)) continue;
    if (r.starts_at && today < r.starts_at) continue;
    if (r.ends_at && today > r.ends_at) continue;
    if (r.scope === "product" && r.scope_id !== ctx.productId) continue;
    if (r.scope === "category" && r.scope_id !== ctx.categoryId) continue;
    if (r.adjustment_type === "percent") price = price * (1 + r.adjustment_value / 100);
    else price = price + r.adjustment_value;
  }
  return Math.max(0, Math.round(price * 100) / 100);
}

// Single source of truth for trial length, price and VAT.
// To change the monthly price: edit MONTHLY_PRICE_ILS here, or override it at
// runtime from Super Admin (stored in platform_content key "billing").
export const TRIAL_DAYS = 20;
export const MONTHLY_PRICE_ILS = 149; // placeholder, before VAT
export const VAT_RATE = 0.18;
export const PAST_DUE_GRACE_DAYS = 3;

export type PlanSettings = { trial_days: number; monthly_price_ils: number };

export function resolvePlans(value: unknown): PlanSettings {
  const v = value as Partial<PlanSettings> | null;
  return {
    trial_days:
      Number.isInteger(v?.trial_days) && Number(v?.trial_days) > 0 ? Number(v?.trial_days) : TRIAL_DAYS,
    monthly_price_ils:
      typeof v?.monthly_price_ils === "number" && Number.isFinite(v.monthly_price_ils) && v.monthly_price_ils > 0
        ? v.monthly_price_ils
        : MONTHLY_PRICE_ILS,
  };
}

export function withVat(amount: number) {
  const vat = Math.round(amount * VAT_RATE * 100) / 100;
  return { subtotal: amount, vat, total: Math.round((amount + vat) * 100) / 100 };
}

export function remainingTrialDays(endsAt: string | null | undefined, now = Date.now()) {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 86400000)) : null;
}

export function trialTone(days: number | null): "danger" | "warning" | "normal" {
  return days !== null && days <= 2 ? "danger" : days !== null && days <= 5 ? "warning" : "normal";
}

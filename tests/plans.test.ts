import { describe, expect, it } from "vitest";
import { remainingTrialDays, resolvePlans, trialTone, withVat } from "@/lib/plans";

describe("plans", () => {
  it("defaults: 20-day trial, 149 ILS", () => {
    expect(resolvePlans(null)).toEqual({ trial_days: 20, monthly_price_ils: 149 });
  });
  it("accepts valid overrides and rejects junk", () => {
    expect(resolvePlans({ trial_days: 14, monthly_price_ils: 99 })).toEqual({
      trial_days: 14,
      monthly_price_ils: 99,
    });
    expect(resolvePlans({ trial_days: -1, monthly_price_ils: "abc" })).toEqual({
      trial_days: 20,
      monthly_price_ils: 149,
    });
    expect(resolvePlans({ trial_days: 2.5, monthly_price_ils: 0 })).toEqual({
      trial_days: 20,
      monthly_price_ils: 149,
    });
  });
  it("adds 18% VAT", () => {
    expect(withVat(149)).toEqual({ subtotal: 149, vat: 26.82, total: 175.82 });
  });
  it("trial countdown rounds up and never goes negative", () => {
    const now = Date.parse("2026-11-22T00:00:00Z");
    expect(remainingTrialDays(new Date(now + 20 * 86400000).toISOString(), now)).toBe(20);
    expect(remainingTrialDays(new Date(now + 1000).toISOString(), now)).toBe(1);
    expect(remainingTrialDays(new Date(now - 1000).toISOString(), now)).toBe(0);
    expect(remainingTrialDays(null, now)).toBeNull();
  });
  it("trial banner tone", () => {
    expect(trialTone(1)).toBe("danger");
    expect(trialTone(4)).toBe("warning");
    expect(trialTone(10)).toBe("normal");
    expect(trialTone(null)).toBe("normal");
  });
});

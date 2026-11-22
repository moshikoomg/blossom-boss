import { describe, expect, it } from "vitest";
import { canTakeOrders, computeBillingState } from "@/lib/billing-state";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("computeBillingState (trial + soft lock)", () => {
  it("no subscription row = legacy store, keeps working", () => {
    expect(computeBillingState(null, NOW)).toEqual({ state: "none" });
  });

  it("trial in progress", () => {
    const s = computeBillingState(
      {
        status: "trialing",
        is_trial: true,
        trial_ends_at: iso(NOW + 5 * DAY),
        current_period_end: null,
      },
      NOW,
    );
    expect(s.state).toBe("trial");
    expect(canTakeOrders(s)).toBe(true);
  });

  it("trial ended: 3 grace days, then blocked", () => {
    const sub = {
      status: "trialing",
      is_trial: true,
      trial_ends_at: iso(NOW - 1 * DAY),
      current_period_end: null,
    };
    expect(computeBillingState(sub, NOW).state).toBe("grace");
    const blocked = computeBillingState({ ...sub, trial_ends_at: iso(NOW - 4 * DAY) }, NOW);
    expect(blocked.state).toBe("blocked");
    expect(canTakeOrders(blocked)).toBe(false);
  });

  it("paid and active until period end", () => {
    const s = computeBillingState(
      {
        status: "active",
        is_trial: false,
        trial_ends_at: iso(NOW - 30 * DAY),
        current_period_end: iso(NOW + 10 * DAY),
      },
      NOW,
    );
    expect(s).toEqual({ state: "active", renewsAt: iso(NOW + 10 * DAY) });
  });

  it("paid period lapsed -> grace -> blocked", () => {
    const sub = {
      status: "past_due",
      is_trial: false,
      trial_ends_at: null,
      current_period_end: iso(NOW - 2 * DAY),
    };
    expect(computeBillingState(sub, NOW).state).toBe("grace");
    expect(
      computeBillingState({ ...sub, current_period_end: iso(NOW - 10 * DAY) }, NOW).state,
    ).toBe("blocked");
  });

  it("canceled is blocked immediately", () => {
    expect(
      computeBillingState(
        {
          status: "canceled",
          is_trial: false,
          trial_ends_at: null,
          current_period_end: iso(NOW + DAY),
        },
        NOW,
      ).state,
    ).toBe("blocked");
  });

  it("manually managed paid store without end date stays active", () => {
    expect(
      computeBillingState(
        { status: "active", is_trial: false, trial_ends_at: null, current_period_end: null },
        NOW,
      ),
    ).toEqual({
      state: "active",
      renewsAt: null,
    });
  });
});

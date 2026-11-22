import { PAST_DUE_GRACE_DAYS } from "./plans";

export type SubRow = {
  status: string | null;
  is_trial: boolean | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  provider?: string | null;
};

export type BillingState =
  | { state: "none" } // no subscription row (legacy / manually managed store)
  | { state: "trial"; endsAt: string }
  | { state: "active"; renewsAt: string | null }
  | { state: "grace"; blockAt: string } // trial or payment ended, store still works for a few days
  | { state: "blocked" };

const DAY = 86_400_000;

/** Single source of truth for "may this store take orders?" */
export function computeBillingState(sub: SubRow | null, now = Date.now()): BillingState {
  if (!sub) return { state: "none" };
  if (sub.status === "canceled") return { state: "blocked" };

  const paid = !sub.is_trial && (sub.status === "active" || sub.status === "past_due");
  const end = paid ? sub.current_period_end : sub.trial_ends_at;
  // Manually managed paid stores without an end date stay active.
  if (paid && !end) return { state: "active", renewsAt: null };
  if (!end) return sub.is_trial ? { state: "trial", endsAt: new Date(now + DAY).toISOString() } : { state: "none" };

  const endMs = Date.parse(end);
  if (endMs > now) return paid ? { state: "active", renewsAt: end } : { state: "trial", endsAt: end };
  const blockAt = endMs + PAST_DUE_GRACE_DAYS * DAY;
  if (blockAt > now) return { state: "grace", blockAt: new Date(blockAt).toISOString() };
  return { state: "blocked" };
}

export function canTakeOrders(s: BillingState) {
  return s.state !== "blocked";
}

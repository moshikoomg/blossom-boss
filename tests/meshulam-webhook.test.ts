import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- tiny in-memory fake of the supabase query builder ----
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
const approve = vi.fn();

function table(name: string) {
  db[name] ??= [];
  const filters: [string, any][] = [];
  let op: "select" | "update" | "insert" = "select";
  let patch: Row = {};
  const rows = () => db[name].filter((r) => filters.every(([k, v]) => r[k] === v));
  const q: any = {
    select: () => q,
    eq: (k: string, v: any) => (filters.push([k, v]), q),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    update: (p: Row) => ((op = "update"), (patch = p), q),
    insert: async (r: Row) => {
      if (name === "billing_idempotency" && db[name].some((x) => x.key === r.key))
        return { error: { message: "duplicate key" } };
      db[name].push({ ...r });
      return { error: null };
    },
    then: (res: any) => {
      if (op === "update") rows().forEach((r) => Object.assign(r, patch));
      return Promise.resolve({ data: null, error: null }).then(res);
    },
  };
  return q;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (n: string) => table(n) },
}));
vi.mock("@/lib/meshulam.server", () => ({
  approveGrowTransaction: (...a: any[]) => approve(...a),
}));
vi.mock("@/lib/plan-settings.server", () => ({
  getPlanSettings: async () => ({ trial_days: 20, monthly_price_ils: 149 }),
}));

const ORDER = "11111111-1111-1111-1111-111111111111";
const STORE = "22222222-2222-2222-2222-222222222222";

async function post(fields: Record<string, string>, k = "s3cret") {
  const { Route } = await import("@/routes/api/public/meshulam-webhook");
  const handler = (Route as any).options.server.handlers.POST;
  const req = new Request(`https://x.test/api/public/meshulam-webhook?k=${k}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  const res: Response = await handler({ request: req });
  return { status: res.status, text: await res.text() };
}

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  approve.mockReset();
  process.env.MESHULAM_WEBHOOK_SECRET = "s3cret";
  db.orders = [{ id: ORDER, store_id: STORE, total: 225, payment_status: "pending" }];
  db.stores = [{ id: STORE, plan: "trial" }];
  db.store_subscriptions = [
    {
      store_id: STORE,
      is_trial: true,
      status: "trialing",
      current_period_end: null,
      trial_ends_at: "2026-12-01T00:00:00Z",
    },
  ];
});

const paid = (extra: Record<string, string>) => ({ status: "1", transactionId: "tx-1", ...extra });

describe("Grow webhook", () => {
  it("rejects a wrong or missing secret", async () => {
    expect((await post(paid({ sum: "225", cField1: ORDER }), "nope")).status).toBe(403);
    delete process.env.MESHULAM_WEBHOOK_SECRET;
    expect((await post(paid({ sum: "225", cField1: ORDER }))).status).toBe(403);
  });

  it("marks an order paid when the sum matches", async () => {
    const r = await post(paid({ sum: "225", cField1: ORDER, cField2: "order" }));
    expect(r.text).toBe("ok");
    expect(db.orders[0].payment_status).toBe("paid");
    expect(db.orders[0].meshulam_transaction_id).toBe("tx-1");
    expect(approve).toHaveBeenCalledOnce();
  });

  it("does not mark paid when the sum is wrong", async () => {
    await post(paid({ sum: "1", cField1: ORDER }));
    expect(db.orders[0].payment_status).toBe("pending");
  });

  it("ignores failed payments", async () => {
    const r = await post({ status: "0", transactionId: "tx-9", sum: "225", cField1: ORDER });
    expect(r.text).toBe("ignored");
    expect(db.orders[0].payment_status).toBe("pending");
  });

  it("processes each transaction once", async () => {
    await post(paid({ sum: "225", cField1: ORDER }));
    await post(paid({ sum: "225", cField1: ORDER }));
    expect(approve).toHaveBeenCalledOnce();
  });

  it("reads nested JSON payloads (data[cField1])", async () => {
    const { Route } = await import("@/routes/api/public/meshulam-webhook");
    const handler = (Route as any).options.server.handlers.POST;
    const req = new Request("https://x.test/api/public/meshulam-webhook?k=s3cret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: 1,
        data: { transactionId: "tx-j", sum: 225, customFields: { cField1: ORDER } },
      }),
    });
    await handler({ request: req });
    expect(db.orders[0].payment_status).toBe("paid");
  });

  it("subscription payment ends the trial and extends one month", async () => {
    const r = await post(paid({ sum: "175.82", cField1: STORE, cField2: "sub" }));
    expect(r.text).toBe("ok");
    const sub = db.store_subscriptions[0];
    expect(sub.is_trial).toBe(false);
    expect(sub.status).toBe("active");
    const days = (Date.parse(sub.current_period_end) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    expect(db.stores[0].plan).toBe("pro");
    expect(db.billing_events).toHaveLength(1);
  });

  it("subscription payment below the plan price is refused", async () => {
    await post(paid({ sum: "1", cField1: STORE, cField2: "sub" }));
    expect(db.store_subscriptions[0].is_trial).toBe(true);
  });

  it("subscription for an unknown store is refused", async () => {
    await post(
      paid({ sum: "175.82", cField1: "33333333-3333-3333-3333-333333333333", cField2: "sub" }),
    );
    expect(db.store_subscriptions).toHaveLength(1);
  });
});

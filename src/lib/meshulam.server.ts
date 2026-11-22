// Grow (formerly Meshulam) "Light" payment pages.
// Env: MESHULAM_USER_ID, MESHULAM_API_KEY, MESHULAM_PAGE_CODE (one-time payments for shop orders),
//      MESHULAM_SUBSCRIPTION_PAGE_CODE (recurring/standing-order page for the platform subscription),
//      MESHULAM_WEBHOOK_SECRET (random string; must match the ?k= on notifyUrl),
//      MESHULAM_API_BASE (optional, default https://meshulam.co.il/api/light/server/1.0; use the sandbox base for tests).

const DEFAULT_BASE = "https://meshulam.co.il/api/light/server/1.0";

type GrowResult = { url: string } | { error: string };

function base() {
  return (process.env.MESHULAM_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

export function growNotifyUrl(origin: string) {
  const k = process.env.MESHULAM_WEBHOOK_SECRET;
  return `${origin}/api/public/meshulam-webhook${k ? `?k=${encodeURIComponent(k)}` : ""}`;
}

async function createGrowProcess(opts: {
  pageCode: string | undefined;
  sum: number;
  description: string;
  fullName: string;
  phone: string;
  email: string;
  cFields: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  origin: string;
}): Promise<GrowResult> {
  const userId = process.env.MESHULAM_USER_ID;
  const apiKey = process.env.MESHULAM_API_KEY;
  if (!userId || !apiKey || !opts.pageCode) {
    return { error: "סליקה לא הוגדרה עדיין. חסרים מפתחות Grow בהגדרות השרת." };
  }
  const body = new URLSearchParams({
    pageCode: opts.pageCode,
    userId,
    apiKey,
    sum: opts.sum.toFixed(2),
    paymentNum: "1",
    description: opts.description,
    "pageField[fullName]": opts.fullName,
    "pageField[phone]": opts.phone,
    "pageField[email]": opts.email,
    successUrl: opts.successUrl,
    cancelUrl: opts.cancelUrl,
    notifyUrl: growNotifyUrl(opts.origin),
  });
  for (const [k, v] of Object.entries(opts.cFields)) body.set(k, v);
  try {
    const res = await fetch(`${base()}/createPaymentProcess`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json: any = await res.json().catch(() => ({}));
    if (json?.status === 1 && json?.data?.url) return { url: json.data.url as string };
    return { error: json?.err?.message || json?.err || "שגיאה ביצירת תשלום" };
  } catch {
    return { error: "שירות התשלומים לא זמין כרגע, נסו שוב בעוד רגע" };
  }
}

/** One-time payment for a customer's flower order. */
export async function createMeshulamProcess(opts: {
  orderId: string;
  sum: number;
  fullName: string;
  phone: string;
  email: string;
  origin: string;
  receiptToken?: string;
}) {
  const t = opts.receiptToken ? `&t=${opts.receiptToken}` : "";
  return createGrowProcess({
    pageCode: process.env.MESHULAM_PAGE_CODE,
    sum: opts.sum,
    description: `הזמנה ${opts.orderId.slice(0, 8)}`,
    fullName: opts.fullName,
    phone: opts.phone,
    email: opts.email,
    cFields: { cField1: opts.orderId, cField2: "order" },
    successUrl: `${opts.origin}/payment/success?order=${opts.orderId}${t}`,
    cancelUrl: `${opts.origin}/payment/cancel?order=${opts.orderId}`,
    origin: opts.origin,
  });
}

/** Monthly platform subscription for a store (recurring page in Grow). */
export async function createGrowSubscriptionProcess(opts: {
  storeId: string;
  sum: number;
  fullName: string;
  phone: string;
  email: string;
  origin: string;
}) {
  return createGrowProcess({
    pageCode: process.env.MESHULAM_SUBSCRIPTION_PAGE_CODE,
    sum: opts.sum,
    description: "מנוי חודשי Blossom Boss",
    fullName: opts.fullName,
    phone: opts.phone,
    email: opts.email,
    cFields: { cField1: opts.storeId, cField2: "sub" },
    successUrl: `${opts.origin}/admin?section=settings&subscribed=1`,
    cancelUrl: `${opts.origin}/admin?section=settings`,
    origin: opts.origin,
  });
}

/** Grow requires the merchant to approve each transaction it reports. Best effort. */
export async function approveGrowTransaction(fields: Record<string, string>) {
  const userId = process.env.MESHULAM_USER_ID;
  const apiKey = process.env.MESHULAM_API_KEY;
  if (!userId || !apiKey) return;
  const body = new URLSearchParams({ userId, apiKey, ...fields });
  try {
    await fetch(`${base()}/approveTransaction`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (e) {
    console.warn("[grow] approveTransaction failed", e);
  }
}

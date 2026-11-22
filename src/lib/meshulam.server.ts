export async function createMeshulamProcess(opts: { orderId: string; sum: number; fullName: string; phone: string; email: string; origin: string }) {
  const userId = process.env.MESHULAM_USER_ID;
  const pageCode = process.env.MESHULAM_PAGE_CODE;
  const apiKey = process.env.MESHULAM_API_KEY;
  if (!userId || !pageCode || !apiKey) {
    return { error: "סליקת אשראי לא הוגדרה. הוסף את מפתחות משולם בהגדרות." };
  }
  const body = new URLSearchParams({
    pageCode,
    userId,
    apiKey,
    sum: String(opts.sum),
    paymentNum: "1",
    description: `הזמנה ${opts.orderId.slice(0,8)}`,
    "pageField[fullName]": opts.fullName,
    "pageField[phone]": opts.phone,
    "pageField[email]": opts.email,
    cField1: opts.orderId,
    successUrl: `${opts.origin}/payment/success?order=${opts.orderId}`,
    cancelUrl: `${opts.origin}/payment/cancel?order=${opts.orderId}`,
    notifyUrl: `${opts.origin}/api/public/meshulam-webhook`,
  });
  const res = await fetch("https://meshulam.co.il/api/light/server/1.0/createPaymentProcess", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (json?.status === 1 && json?.data?.url) return { url: json.data.url as string };
  return { error: json?.err || "שגיאה ביצירת תשלום" };
}

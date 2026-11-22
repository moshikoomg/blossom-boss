// Remembers order receipt tokens in this browser so a customer can reopen
// their tracking page without the token in the URL.
const KEY = "bb_receipts";

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function rememberReceipts(orders: { id: string; receipt_token: string }[]) {
  try {
    const all = read();
    for (const o of orders) all[o.id] = o.receipt_token;
    const entries = Object.entries(all).slice(-30);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage unavailable */
  }
}

export function receiptTokenFor(orderId: string): string | null {
  return read()[orderId] ?? null;
}

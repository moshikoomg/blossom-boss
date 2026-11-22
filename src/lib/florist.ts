// Pure helpers for the florist workspace: today's work, prep lists and
// supplier orders over WhatsApp. Kept free of React/Supabase so they are
// easy to test.

export type OrderStatus =
  "pending" | "confirmed" | "preparing" | "out_for_delivery" | "delivered" | "cancelled";

/** The one button a florist needs on each order: the next step. */
export const NEXT_STEP: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  pending: { to: "confirmed", label: "אשר הזמנה" },
  confirmed: { to: "preparing", label: "התחל הכנה" },
  preparing: { to: "out_for_delivery", label: "יצא למשלוח" },
  out_for_delivery: { to: "delivered", label: "נמסר ✓" },
};

export const OPEN_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
];

/** When the order is due: the requested delivery time, or when it was placed. */
export function dueAt(o: { scheduled_for?: string | null; created_at: string }): Date {
  return new Date(o.scheduled_for || o.created_at);
}

export function startOfDay(d: Date, addDays = 0): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + addDays);
  return x;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Converts an Israeli phone (050-1234567, +972 50…, 972501234567) to wa.me digits. */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "972" + d.slice(1);
  if (d.length < 9 || d.length > 15) return null;
  return d;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const n = toWhatsAppNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export type PrepLine = { name: string; qty: number };

/** Sums order lines by product name: what has to be made today/tomorrow. */
export function buildPrepList(items: { product_name: string; quantity: number }[]): PrepLine[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const name = (it.product_name || "").trim();
    if (!name) continue;
    m.set(name, (m.get(name) || 0) + Math.max(0, Number(it.quantity) || 0));
  }
  return [...m.entries()]
    .filter(([, q]) => q > 0)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "he"));
}

export type POItem = { name: string; qty: number; unit: string; price?: number | null };

export const PO_UNITS = ["יח׳", "צרור", "גבעולים", "קופסה", "ק״ג"] as const;

export const SUPPLIER_CATEGORIES: { value: string; label: string; emoji: string }[] = [
  { value: "flowers", label: "פרחים", emoji: "🌹" },
  { value: "plants", label: "עציצים וצמחים", emoji: "🪴" },
  { value: "vases", label: "כלים ואגרטלים", emoji: "🏺" },
  { value: "packaging", label: "אריזה וסרטים", emoji: "🎀" },
  { value: "other", label: "אחר", emoji: "📦" },
];

export const WEEKDAYS: { key: string; label: string }[] = [
  { key: "sun", label: "א׳" },
  { key: "mon", label: "ב׳" },
  { key: "tue", label: "ג׳" },
  { key: "wed", label: "ד׳" },
  { key: "thu", label: "ה׳" },
  { key: "fri", label: "ו׳" },
];

export function cleanPOItems(items: POItem[]): POItem[] {
  return items
    .map((i) => ({
      name: (i.name || "").trim(),
      qty: Math.max(0, Number(i.qty) || 0),
      unit: i.unit || PO_UNITS[0],
      price:
        i.price === null || i.price === undefined || String(i.price) === ""
          ? null
          : Math.max(0, Number(i.price) || 0),
    }))
    .filter((i) => i.name && i.qty > 0);
}

export function poTotal(items: POItem[]): number {
  return (
    Math.round(cleanPOItems(items).reduce((s, i) => s + (i.price ? i.price * i.qty : 0), 0) * 100) /
    100
  );
}

/** The WhatsApp message a florist sends to a supplier. */
export function formatPurchaseOrderMessage(opts: {
  storeName: string;
  supplierName?: string | null;
  neededBy?: string | null; // yyyy-mm-dd
  items: POItem[];
  notes?: string | null;
}): string {
  const lines: string[] = [];
  lines.push(
    `שלום${opts.supplierName ? ` ${opts.supplierName}` : ""}, הזמנה חדשה מ${opts.storeName || "החנות"} 🌸`,
  );
  if (opts.neededBy) {
    const [y, m, d] = opts.neededBy.split("-");
    if (y && m && d) lines.push(`לתאריך: ${d}/${m}/${y}`);
  }
  lines.push("");
  for (const i of cleanPOItems(opts.items)) lines.push(`• ${i.name}: ${i.qty} ${i.unit}`);
  if (opts.notes && opts.notes.trim()) {
    lines.push("");
    lines.push(`הערות: ${opts.notes.trim()}`);
  }
  lines.push("");
  lines.push("תודה! אשמח לאישור 🙏");
  return lines.join("\n");
}

export function tomorrowISO(now = new Date()): string {
  const t = startOfDay(now, 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

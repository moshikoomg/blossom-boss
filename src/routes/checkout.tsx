import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useCart, itemKey, type CartItem } from "@/lib/cart";
import { ArrowRight, CreditCard, MapPin, Plus, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { placeOrder } from "@/lib/checkout.functions";
import { rememberReceipts } from "@/lib/receipts";
import { useStore } from "@/lib/store-context";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "תשלום" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { items, subtotal, clear, coupon } = useCart();
  const nav = useNavigate();
  const [shipping, setShipping] = useState<number>(25);
  const [whatsappNumber, setWhatsappNumber] = useState<string>("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"bit" | "credit">("bit");
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  type Stop = { id: string; name: string; phone: string; address: string; notes: string };
  const newStop = (): Stop => ({ id: crypto.randomUUID(), name: "", phone: "", address: "", notes: "" });
  const [stops, setStops] = useState<Stop[]>([newStop(), newStop()]);
  // map of itemKey -> stopId
  const [assign, setAssign] = useState<Record<string, string>>({});
  const placeOrderFn = useServerFn(placeOrder);
  const { store: currentStore } = useStore();

  // Validation schema used before any DB write (single-mode + multi-mode email).
  // Phone regex: digits/+/-/spaces/parens, 9-20 chars.
  const contactSchema = z.object({
    email: z.string().trim().email("אימייל לא תקין").max(255),
    name: z.string().trim().min(2, "שם מלא חובה").max(100),
    phone: z.string().trim().regex(/^[\d\-+ ()]{9,20}$/, "מספר טלפון לא תקין (לפחות 9 ספרות)"),
    address: z.string().trim().min(4, "כתובת חובה").max(255),
  });
  const phoneSchema = z.string().trim().regex(/^[\d\-+ ()]{9,20}$/, "מספר טלפון לא תקין");
  const emailSchema = z.string().trim().email("אימייל לא תקין").max(255);

  useEffect(() => {
    if (!currentStore) return;
    // Explicit store_id filter — never read another tenant's shipping/whatsapp.
    supabase
      .from("site_settings")
      .select("key,value")
      .eq("store_id", currentStore.id)
      .in("key", ["shipping_price", "whatsapp_business"])
      .then(({ data }) => {
      for (const row of data || []) {
        const v = (row as any).value;
        if (row.key === "shipping_price") { const n = Number(v); setShipping(Number.isFinite(n) && n >= 0 ? n : 25); }
        if (row.key === "whatsapp_business") setWhatsappNumber(typeof v === "string" ? v : "");
      }
    });
  }, [currentStore]);

  const discount = coupon?.discount || 0;
  const stopsCount = multiMode ? stops.length : (items.length ? 1 : 0);
  const totalShipping = shipping * stopsCount;
  const total = Math.max(0, subtotal - discount) + totalShipping;

  // auto-assign first stop on enable
  useEffect(() => {
    if (!multiMode) return;
    setAssign((prev) => {
      const next = { ...prev };
      const firstId = stops[0]?.id;
      for (const it of items) {
        const k = itemKey(it);
        if (!next[k] || !stops.find((s) => s.id === next[k])) next[k] = firstId;
      }
      return next;
    });
  }, [multiMode, stops, items]);

  function buildWhatsappMessage(orderNumber: string) {
    const lines = [
      `🌸 הזמנה חדשה ${orderNumber}`,
      `שם: ${name}`,
      `טלפון: ${phone}`,
      `כתובת: ${address}`,
      ...(notes ? [`הערות: ${notes}`] : []),
      "",
      "📦 פריטים:",
      ...items.map((it) => `• ${it.name} × ${it.qty} = ₪${(it.price + (it.extras?.reduce((s,e)=>s+e.price,0)||0)) * it.qty}`),
      "",
      ...(discount > 0 ? [`💸 הנחה (${coupon?.code}): -₪${discount}`] : []),
      `🚚 משלוח: ₪${shipping}`,
      `💰 סה״כ לתשלום: ₪${total}`,
      "",
      "💳 תשלום: Bit / מזומן לשליח",
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  function buildWhatsappForStop(orderNumber: string, stop: Stop, stopItems: CartItem[], stopShipping: number, stopTotal: number) {
    const lines = [
      `🌸 הזמנה חדשה ${orderNumber}`,
      `שם: ${stop.name}`,
      `טלפון: ${stop.phone}`,
      `כתובת: ${stop.address}`,
      ...(stop.notes ? [`הערות: ${stop.notes}`] : []),
      "",
      "📦 פריטים:",
      ...stopItems.map((it) => `• ${it.name} × ${it.qty} = ₪${(it.price + (it.extras?.reduce((s,e)=>s+e.price,0)||0)) * it.qty}`),
      "",
      `🚚 משלוח: ₪${stopShipping}`,
      `💰 סה״כ: ₪${stopTotal}`,
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) {
      toast.error("הסל שלך ריק");
      return;
    }
    if (!acceptedTerms) {
      toast.error("יש לאשר את תקנון האתר ומדיניות הפרטיות");
      return;
    }

    if (!currentStore?.id) { toast.error("החנות לא זוהתה. רעננו את הדף ונסו שוב."); return; }
    const toItem = (it: CartItem) => ({
      productId: it.productId,
      qty: it.qty,
      sizeLabel: it.sizeLabel || undefined,
      cardText: it.cardText || undefined,
      extras: (it.extras || []).map((e) => ({ id: e.id, qty: e.qty || 1 })),
    });

    let stopsPayload: { contact: { name: string; phone: string; email: string; address: string; notes: string }; items: ReturnType<typeof toItem>[] }[];
    let groupedStops: { stop: Stop; items: CartItem[] }[] = [];

    if (multiMode) {
      // Email is collected once at the top in multi-mode too.
      const emailRes = emailSchema.safeParse(email);
      if (!emailRes.success) { toast.error(emailRes.error.issues[0].message); return; }
      for (const s of stops) {
        if (!s.name || !s.phone || !s.address) {
          toast.error("יש למלא שם, טלפון וכתובת לכל יעד");
          return;
        }
        const ps = phoneSchema.safeParse(s.phone);
        if (!ps.success) { toast.error(`טלפון לא תקין עבור ${s.name}`); return; }
      }
      // every item must be assigned
      const grouped = new Map<string, CartItem[]>();
      for (const it of items) {
        const sid = assign[itemKey(it)];
        if (!sid) { toast.error(`יש לשייך את "${it.name}" ליעד`); return; }
        const arr = grouped.get(sid) || [];
        arr.push(it);
        grouped.set(sid, arr);
      }
      for (const s of stops) {
        if (!grouped.get(s.id)?.length) { toast.error(`היעד של ${s.name || "ללא שם"} ריק — שייך/י אליו לפחות מוצר אחד או מחק/י את היעד`); return; }
      }
      groupedStops = stops.map((s) => ({ stop: s, items: grouped.get(s.id)! }));
      stopsPayload = groupedStops.map(({ stop: s, items: its }) => ({
        contact: { name: s.name, phone: s.phone, email, address: s.address, notes: s.notes },
        items: its.map(toItem),
      }));
    } else {
      const parsed = contactSchema.safeParse({ email, name, phone, address });
      if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
      stopsPayload = [{ contact: { name, phone, email, address, notes }, items: items.map(toItem) }];
    }

    setLoading(true);
    let res: Awaited<ReturnType<typeof placeOrderFn>>;
    try {
      res = await placeOrderFn({
        data: { storeId: currentStore.id, payment: paymentMethod, coupon: multiMode ? null : coupon?.code || null, stops: stopsPayload },
      });
    } catch (err: any) {
      setLoading(false);
      toast.error(err?.message || "שגיאה ביצירת ההזמנה");
      return;
    }
    if (!res.ok) { setLoading(false); toast.error(res.error); return; }
    const first = res.orders[0];
    rememberReceipts(res.orders);

    if (paymentMethod === "credit") {
      if (res.paymentUrl) { clear(); window.location.href = res.paymentUrl; return; }
      toast.error(res.paymentError || "שגיאה ביצירת תשלום אשראי");
      setLoading(false);
      return;
    }

    // Bit → open WhatsApp to the shop with the order summary.
    if (whatsappNumber) {
      const cleaned = whatsappNumber.replace(/[^\d]/g, "");
      if (multiMode) {
        groupedStops.forEach(({ stop: s, items: its }, i) => {
          const o = res.ok ? res.orders[i] : null;
          if (!o) return;
          const stopSubtotal = its.reduce((a, b) => a + b.qty * (b.price + (b.extras?.reduce((x, e) => x + e.price, 0) || 0)), 0);
          window.open(`https://wa.me/${cleaned}?text=${buildWhatsappForStop(o.order_number, s, its, shipping, stopSubtotal + shipping)}`, "_blank");
        });
      } else {
        window.open(`https://wa.me/${cleaned}?text=${buildWhatsappMessage(first.order_number)}`, "_blank");
      }
    }
    clear(); setLoading(false);
    toast.success(res.orders.length > 1 ? `${res.orders.length} הזמנות נשלחו!` : "ההזמנה התקבלה!");
    nav({ to: "/track/$orderId", params: { orderId: first.id }, search: { t: first.receipt_token } });
  }

  const stopBadge = (sid: string) => {
    const i = stops.findIndex((s) => s.id === sid);
    return i >= 0 ? `יעד ${i + 1}` : "—";
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <Link to="/cart" className="flex items-center gap-1 text-sm font-bold"><ArrowRight size={18}/> חזרה לסל</Link>
        <h1 className="font-black">תשלום</h1>
        <div className="w-12"/>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-black">פרטי משלוח</h2>
              <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                <input type="checkbox" checked={multiMode} onChange={(e) => { setMultiMode(e.target.checked); if (e.target.checked) setPaymentMethod("bit"); }} className="h-4 w-4 accent-primary"/>
                משלוח למספר כתובות
              </label>
            </div>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="אימייל (לקבלת עדכונים)" aria-label="אימייל" className="w-full bg-background border border-input rounded-xl px-4 py-3 outline-none focus:border-primary"/>
            {!multiMode ? (
              <>
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא" aria-label="שם מלא" className="w-full bg-background border border-input rounded-xl px-4 py-3 outline-none focus:border-primary"/>
                <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="טלפון" aria-label="טלפון" className="w-full bg-background border border-input rounded-xl px-4 py-3 outline-none focus:border-primary"/>
                <input required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="כתובת מלאה" aria-label="כתובת מלאה" className="w-full bg-background border border-input rounded-xl px-4 py-3 outline-none focus:border-primary"/>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות לשליח (אופציונלי)" aria-label="הערות לשליח" rows={2} className="w-full bg-background border border-input rounded-xl px-4 py-3 outline-none focus:border-primary"/>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">כל יעד מקבל הזמנה ומשלוח נפרדים. לאחר מכן שייכ/י לכל מוצר את היעד שלו.</p>
                {stops.map((s, idx) => (
                  <div key={s.id} className="bg-background border border-border rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center text-xs">{idx + 1}</span>
                        <MapPin size={14} className="text-primary"/> יעד {idx + 1}
                      </div>
                      {stops.length > 1 && (
                        <button type="button" onClick={() => setStops((arr) => arr.filter((x) => x.id !== s.id))} className="text-destructive hover:bg-destructive/10 p-1 rounded" aria-label="מחק יעד">
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </div>
                    <input required value={s.name} onChange={(e) => setStops((arr) => arr.map((x) => x.id === s.id ? { ...x, name: e.target.value } : x))} placeholder="שם המקבל" aria-label="שם המקבל" className="w-full bg-card border border-input rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"/>
                    <input required type="tel" value={s.phone} onChange={(e) => setStops((arr) => arr.map((x) => x.id === s.id ? { ...x, phone: e.target.value } : x))} placeholder="טלפון" aria-label="טלפון מקבל" className="w-full bg-card border border-input rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"/>
                    <input required value={s.address} onChange={(e) => setStops((arr) => arr.map((x) => x.id === s.id ? { ...x, address: e.target.value } : x))} placeholder="כתובת מלאה" aria-label="כתובת מקבל" className="w-full bg-card border border-input rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"/>
                    <textarea value={s.notes} onChange={(e) => setStops((arr) => arr.map((x) => x.id === s.id ? { ...x, notes: e.target.value } : x))} placeholder="הערות לשליח" aria-label="הערות לשליח" rows={1} className="w-full bg-card border border-input rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"/>
                  </div>
                ))}
                <button type="button" onClick={() => setStops((arr) => [...arr, newStop()])} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border hover:border-primary rounded-xl py-3 font-bold text-sm text-muted-foreground hover:text-primary">
                  <Plus size={16}/> הוסף יעד
                </button>

                <div className="bg-accent/40 rounded-xl p-3 space-y-2">
                  <h3 className="font-black text-sm">שיוך פרחים ליעדים</h3>
                  {items.map((it) => {
                    const k = itemKey(it);
                    return (
                      <div key={k} className="flex items-center gap-2 bg-card border border-border rounded-lg p-2">
                        <img src={it.image} alt="" width={36} height={36} className="w-9 h-9 object-cover rounded"/>
                        <span className="flex-1 text-xs font-medium line-clamp-1">{it.name} × {it.qty}</span>
                        <select
                          value={assign[k] || ""}
                          onChange={(e) => setAssign((a) => ({ ...a, [k]: e.target.value }))}
                          className="bg-background border border-input rounded-md px-2 py-1 text-xs font-bold focus:border-primary outline-none"
                          aria-label={`שייך ${it.name} ליעד`}
                        >
                          {stops.map((s, i) => (
                            <option key={s.id} value={s.id}>יעד {i + 1}{s.address ? ` · ${s.address.slice(0, 18)}` : ""}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <h2 className="font-black mb-2">אמצעי תשלום</h2>
            <button type="button" onClick={() => setPaymentMethod("bit")} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition ${paymentMethod==="bit"?"border-primary bg-primary/5":"border-border"}`}>
              <Smartphone size={22} className={paymentMethod==="bit"?"text-primary":"text-muted-foreground"}/>
              <div className="text-right flex-1">
                <p className="font-bold">Bit / מזומן לשליח</p>
                <p className="text-xs text-muted-foreground">תשלום בעת המסירה דרך וואטסאפ</p>
              </div>
            </button>
            <button type="button" disabled={multiMode} onClick={() => setPaymentMethod("credit")} className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition disabled:opacity-50 disabled:cursor-not-allowed ${paymentMethod==="credit"?"border-primary bg-primary/5":"border-border"}`}>
              <CreditCard size={22} className={paymentMethod==="credit"?"text-primary":"text-muted-foreground"}/>
              <div className="text-right flex-1">
                <p className="font-bold">כרטיס אשראי</p>
                <p className="text-xs text-muted-foreground">{multiMode ? "זמין להזמנה לכתובת אחת בלבד" : "סליקה מאובטחת דרך Grow"}</p>
              </div>
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <h2 className="font-black mb-2">סיכום הזמנה</h2>
            {items.map((it) => (
              <div key={it.productId + JSON.stringify(it.extras||[])} className="flex justify-between text-sm">
                <span>{it.name} × {it.qty}{multiMode && assign[itemKey(it)] ? ` · ${stopBadge(assign[itemKey(it)])}` : ""}</span>
                <span>₪{(it.price + (it.extras?.reduce((s, e) => s + e.price, 0) || 0)) * it.qty}</span>
              </div>
            ))}
            {discount > 0 && <div className="flex justify-between text-sm text-emerald-700 pt-2 border-t border-border"><span>הנחה ({coupon?.code})</span><span>-₪{discount}</span></div>}
            <div className="border-t border-border pt-2 mt-2 flex justify-between text-sm text-muted-foreground"><span>משלוח{multiMode ? ` (× ${stopsCount})` : ""}</span><span>₪{totalShipping}</span></div>
            <div className="flex justify-between font-black text-lg"><span>סה״כ</span><span>₪{total}</span></div>
          </div>
          <label className="flex items-start gap-2 bg-card border border-border rounded-2xl p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
              className="mt-0.5 h-5 w-5 accent-primary shrink-0"
            />
            <span className="text-sm leading-relaxed">
              קראתי ואני מסכים/ה ל
              <Link to="/terms" target="_blank" className="text-primary underline mx-1">תקנון האתר</Link>
              ול
              <Link to="/privacy" target="_blank" className="text-primary underline mx-1">מדיניות הפרטיות</Link>
            </span>
          </label>
          <button disabled={loading || items.length === 0 || !acceptedTerms} type="submit" className="w-full bg-primary text-primary-foreground font-black py-4 rounded-xl hover:bg-primary/90 disabled:opacity-50">
            {loading ? "מעבד..." : paymentMethod === "credit" ? `המשך לסליקה · ₪${total}` : `שלח לוואטסאפ · ₪${total}`}
          </button>
        </form>
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { getMyBillingState, startSubscriptionCheckout } from "@/lib/subscription.functions";
import type { BillingState } from "@/lib/billing-state";

type Price = { subtotal: number; vat: number; total: number };

function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

/** Top-of-admin banner: trial ending / grace / blocked, with a one-tap "pay with Grow" flow. */
export function SubscriptionBanner() {
  const { store } = useStore();
  const stateFn = useServerFn(getMyBillingState);
  const checkoutFn = useServerFn(startSubscriptionCheckout);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "" });

  useEffect(() => {
    if (!store?.id) return;
    stateFn({ data: { storeId: store.id } })
      .then((r) => { setBilling(r.billing); setPrice(r.price); })
      .catch(() => {});
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (u) setForm((f) => ({ ...f, email: f.email || u.email || "", fullName: f.fullName || (u.user_metadata?.full_name as string) || "" }));
    });
    setForm((f) => ({ ...f, phone: f.phone || store.contact_phone || "" }));
  }, [store?.id, stateFn]);

  // "Activate subscription" buttons elsewhere (trial card) open this sheet.
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("tmm:open-subscribe", h);
    return () => window.removeEventListener("tmm:open-subscribe", h);
  }, []);

  useEffect(() => {
    try {
      if (new URL(window.location.href).searchParams.get("subscribed") === "1") toast.success("תודה! המנוי יופעל תוך דקה, ברגע ש-Grow יאשר את התשלום.");
    } catch {}
  }, []);

  if (!billing || billing.state === "none" || billing.state === "active") return sheet();

  const trialDays = billing.state === "trial" ? daysUntil(billing.endsAt) : 0;
  if (billing.state === "trial" && trialDays > 5) return sheet();

  const tone =
    billing.state === "blocked" ? "bg-red-600 text-white" : billing.state === "grace" || trialDays <= 2 ? "bg-red-50 text-red-900 border-red-200" : "bg-amber-50 text-amber-900 border-amber-200";
  const text =
    billing.state === "blocked"
      ? "תקופת הניסיון הסתיימה והחנות לא מקבלת הזמנות. הפעילו מנוי כדי לחזור לפעול מיד."
      : billing.state === "grace"
        ? `תקופת הניסיון הסתיימה. החנות תפסיק לקבל הזמנות בעוד ${daysUntil(billing.blockAt)} ימים.`
        : trialDays <= 1
          ? "הניסיון החינמי מסתיים מחר."
          : `נשארו ${trialDays} ימי ניסיון חינם.`;

  return (
    <>
      <div dir="rtl" className={`mb-4 rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 ${tone}`}>
        <p className="flex-1 text-sm font-bold">{text}</p>
        <button type="button" onClick={() => setOpen(true)}
          className={`h-11 px-5 rounded-xl font-bold text-sm inline-flex items-center justify-center gap-2 ${billing.state === "blocked" ? "bg-white text-red-700" : "bg-foreground text-background"}`}>
          <CreditCard size={16} /> הפעל מנוי{price ? ` · ₪${price.total} לחודש` : ""}
        </button>
      </div>
      {sheet()}
    </>
  );

  function sheet() {
    if (!open || !store) return null;
    const valid = form.fullName.trim().length >= 2 && /^[\d\-+ ()]{9,20}$/.test(form.phone.trim()) && /@/.test(form.email);
    async function pay() {
      if (!store) return;
      setBusy(true);
      const r = await checkoutFn({ data: { storeId: store.id, ...form } }).catch(() => null);
      setBusy(false);
      if (r?.ok) { window.location.href = r.url; return; }
      toast.error(r && !r.ok ? r.error : "לא הצלחנו לפתוח את דף התשלום");
    }
    return (
      <div dir="rtl" className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
        <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="font-black text-lg">הפעלת מנוי חודשי</h3>
            <button type="button" onClick={() => setOpen(false)} aria-label="סגירה"><X size={20} /></button>
          </div>
          {price && (
            <p className="text-sm text-muted-foreground">₪{price.subtotal} + מע״מ = <b className="text-foreground">₪{price.total} לחודש</b>. חיוב חודשי אוטומטי דרך Grow, ביטול בכל רגע.</p>
          )}
          {(["fullName", "phone", "email"] as const).map((k) => (
            <input key={k} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              placeholder={k === "fullName" ? "שם מלא" : k === "phone" ? "טלפון" : "אימייל לחשבונית"}
              dir={k === "fullName" ? "rtl" : "ltr"} inputMode={k === "phone" ? "tel" : k === "email" ? "email" : undefined}
              className="w-full h-12 rounded-xl border border-border bg-background px-3" />
          ))}
          <button type="button" onClick={pay} disabled={!valid || busy}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-black disabled:opacity-50">
            {busy ? "פותח דף תשלום..." : "המשך לתשלום מאובטח"}
          </button>
        </div>
      </div>
    );
  }
}

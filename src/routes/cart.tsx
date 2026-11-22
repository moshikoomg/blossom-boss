import { createFileRoute, Link } from "@tanstack/react-router";
import { useCart } from "@/lib/cart";
import { itemKey } from "@/lib/cart";
import { ArrowRight, Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { validateCoupon } from "@/lib/coupons";
import { toast } from "sonner";
import { useStore } from "@/lib/store-context";
import logoImg from "@/assets/logo.png";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "סל קניות" }] }),
  component: CartPage,
});

function CartPage() {
  const { items, setQty, remove, subtotal, count, coupon, setCoupon } = useCart();
  const { store: currentStore } = useStore();
  const [code, setCode] = useState(coupon?.code || "");
  const [busy, setBusy] = useState(false);

  async function applyCoupon() {
    if (!code.trim()) return;
    setBusy(true);
    const r = await validateCoupon(code, subtotal);
    setBusy(false);
    if (!r.valid) { toast.error(r.message || "קוד לא תקף"); return; }
    setCoupon({ code: r.code, discount: r.discount, coupon_id: r.coupon_id });
    toast.success(`חיסכון של ₪${r.discount}!`);
  }

  const discount = coupon?.discount || 0;
  const afterDiscount = Math.max(0, subtotal - discount);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between gap-3">
        <Link to="/" aria-label="חזרה לחנות" className="flex items-center gap-2 min-w-0">
          <img src={currentStore?.logo_url || logoImg} alt="לוגו" className="w-9 h-9 rounded-xl object-contain bg-primary/5 shrink-0" />
          <span className="font-bold text-sm truncate">{currentStore?.name || "החנות"}</span>
        </Link>
        <h1 className="font-black text-sm">הסל שלי ({count})</h1>
        <Link to="/" className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
          <ArrowRight size={16}/> המשך קנייה
        </Link>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {items.length === 0 ? (
          <div className="bg-card border border-border rounded-3xl p-10 text-center">
            <p className="text-lg font-bold mb-2">הסל ריק</p>
            <Link to="/" className="inline-block mt-4 bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl">לתפריט</Link>
          </div>
        ) : (
          <>
            {items.map((it) => {
              const extraSum = (it.extras || []).reduce((s, e) => s + e.price * (e.qty || 1), 0);
              const k = itemKey(it);
              return (
                <div key={k} className="bg-card border border-border rounded-2xl p-3 flex gap-3">
                  <img src={it.image} alt={it.name} className="w-20 h-20 rounded-xl object-cover bg-muted"/>
                  <div className="flex-1">
                    <p className="font-bold">{it.name}</p>
                    {it.sizeLabel && <p className="text-xs text-muted-foreground mt-0.5">גודל: {it.sizeLabel}</p>}
                    {it.extras && it.extras.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {it.extras.map((e) => (
                          <span key={e.id} className="inline-flex items-center gap-1 text-[11px] bg-muted text-foreground px-2 py-0.5 rounded-full">
                            {e.image && <img src={e.image} alt="" className="w-4 h-4 rounded-full object-cover"/>}
                            {e.name} ×{e.qty || 1}
                          </span>
                        ))}
                      </div>
                    )}
                    {it.cardText && <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-1">"{it.cardText}"</p>}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
                        <button onClick={() => setQty(k, it.qty - 1)} aria-label="הפחת כמות" className="p-1.5 hover:bg-accent rounded"><Minus size={12}/></button>
                        <span className="w-6 text-center text-sm font-bold">{it.qty}</span>
                        <button onClick={() => setQty(k, it.qty + 1)} aria-label="הגדל כמות" className="p-1.5 hover:bg-accent rounded"><Plus size={12}/></button>
                      </div>
                      <p className="font-black">₪{(it.price + extraSum) * it.qty}</p>
                    </div>
                  </div>
                  <button onClick={() => remove(k)} aria-label="הסר מהעגלה" className="text-destructive p-1 self-start"><Trash2 size={16}/></button>
                </div>
              );
            })}
            <div className="bg-card border border-border rounded-2xl p-4 mt-4">
              <div className="mb-3">
                <p className="text-sm font-bold mb-2">קוד הנחה</p>
                {coupon ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <div>
                      <p className="text-sm font-black text-emerald-700">{coupon.code}</p>
                      <p className="text-xs text-emerald-600">חיסכון ₪{coupon.discount}</p>
                    </div>
                    <button onClick={() => { setCoupon(null); setCode(""); }} className="text-xs text-rose-600 font-bold">הסר</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="הקלד קוד" aria-label="קוד קופון" className="flex-1 bg-background border border-input rounded-xl px-3 py-2 text-sm uppercase tracking-wider"/>
                    <button disabled={busy} onClick={applyCoupon} className="bg-foreground text-background font-bold px-4 rounded-xl text-sm disabled:opacity-50">החל</button>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-muted-foreground">סכום ביניים</span>
                <span className="font-black text-xl">₪{subtotal}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between mb-3 text-emerald-700">
                  <span>הנחה</span>
                  <span className="font-black">-₪{discount}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex items-center justify-between mb-3 border-t border-border pt-3">
                  <span className="font-bold">לתשלום (ללא משלוח)</span>
                  <span className="font-black text-xl">₪{afterDiscount}</span>
                </div>
              )}
              <Link to="/checkout" className="block w-full bg-primary text-primary-foreground text-center font-black py-3 rounded-xl hover:bg-primary/90">למעבר לתשלום</Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

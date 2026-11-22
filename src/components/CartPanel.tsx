import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCart, itemKey } from "@/lib/cart";
import { validateCoupon } from "@/lib/coupons";
import { toast } from "sonner";
import { Minus, Plus, Trash2, X, ShoppingBag } from "lucide-react";

export function CartPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { items, setQty, remove, subtotal, count, coupon, setCoupon } = useCart();
  const nav = useNavigate();
  const [code, setCode] = useState(coupon?.code || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const discount = coupon?.discount || 0;
  const afterDiscount = Math.max(0, subtotal - discount);

  async function applyCoupon() {
    if (!code.trim()) return;
    setBusy(true);
    const r = await validateCoupon(code, subtotal);
    setBusy(false);
    if (!r.valid) { toast.error(r.message || "קוד לא תקף"); return; }
    setCoupon({ code: r.code, discount: r.discount, coupon_id: r.coupon_id });
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-50 animate-in fade-in duration-100">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute top-0 left-0 h-full w-full max-w-md bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-primary" />
            <h2 className="font-bold text-base">הסל שלי ({count})</h2>
          </div>
          <button onClick={onClose} aria-label="סגור" className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {items.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">הסל ריק</p>
          ) : items.map((it) => {
            const k = itemKey(it);
            const extraSum = (it.extras || []).reduce((s, e) => s + e.price * (e.qty || 1), 0);
            return (
              <div key={k} className="bg-card border border-border rounded-2xl p-3 flex gap-3">
                <img src={it.image} alt={it.name} className="w-16 h-16 rounded-xl object-cover bg-muted" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{it.name}</p>
                  {it.sizeLabel && <p className="text-[11px] text-muted-foreground">גודל: {it.sizeLabel}</p>}
                  {it.cardText && <p className="text-[11px] text-muted-foreground italic line-clamp-1">"{it.cardText}"</p>}
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5">
                      <button onClick={() => setQty(k, it.qty - 1)} className="p-1 hover:bg-secondary rounded"><Minus size={11}/></button>
                      <span className="w-5 text-center text-xs font-bold">{it.qty}</span>
                      <button onClick={() => setQty(k, it.qty + 1)} className="p-1 hover:bg-secondary rounded"><Plus size={11}/></button>
                    </div>
                    <p className="font-bold text-sm">₪{(it.price + extraSum) * it.qty}</p>
                  </div>
                </div>
                <button onClick={() => remove(k)} className="text-destructive p-1 self-start"><Trash2 size={14}/></button>
              </div>
            );
          })}
        </div>
        {items.length > 0 && (
          <div className="border-t border-border p-3 space-y-2 bg-card">
            {coupon ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5 text-xs">
                <span className="font-bold text-emerald-700">{coupon.code} · -₪{coupon.discount}</span>
                <button onClick={() => { setCoupon(null); setCode(""); }} className="text-rose-600 font-bold">הסר</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="קוד הנחה" className="flex-1 bg-background border border-input rounded-lg px-2 py-1.5 text-xs uppercase tracking-wider"/>
                <button disabled={busy} onClick={applyCoupon} className="bg-foreground text-background font-bold px-3 rounded-lg text-xs disabled:opacity-50">החל</button>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">סכום ביניים</span>
              <span className="font-bold">₪{subtotal}</span>
            </div>
            {discount > 0 && (
              <div className="flex items-center justify-between text-sm font-bold border-t border-border pt-2">
                <span>לתשלום (ללא משלוח)</span>
                <span>₪{afterDiscount}</span>
              </div>
            )}
            <button onClick={() => { onClose(); nav({ to: "/checkout" }); }} className="w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:bg-primary/90">למעבר לתשלום</button>
          </div>
        )}
      </aside>
    </div>
  );
}

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  image: string;
  qty: number;
  extras?: { id: string; name: string; price: number; qty: number; image?: string }[];
  cardText?: string;
  sizeLabel?: string;
};

type Ctx = {
  items: CartItem[];
  add: (i: CartItem) => void;
  remove: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  coupon: { code: string; discount: number; coupon_id: string | null } | null;
  setCoupon: (c: { code: string; discount: number; coupon_id: string | null } | null) => void;
};

const CartCtx = createContext<Ctx | null>(null);
const KEY = "tmm_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [coupon, setCouponState] = useState<Ctx["coupon"]>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
      const c = localStorage.getItem(KEY + "_coupon");
      if (c) setCouponState(JSON.parse(c));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  }, [items]);
  useEffect(() => {
    try {
      if (coupon) localStorage.setItem(KEY + "_coupon", JSON.stringify(coupon));
      else localStorage.removeItem(KEY + "_coupon");
    } catch {}
  }, [coupon]);

  const add: Ctx["add"] = (i) => setItems((s) => {
    const idx = s.findIndex((x) => x.productId === i.productId && (x.sizeLabel||"") === (i.sizeLabel||"") && JSON.stringify(x.extras||[]) === JSON.stringify(i.extras||[]) && (x.cardText||"") === (i.cardText||""));
    if (idx >= 0) {
      const next = [...s];
      next[idx] = { ...next[idx], qty: next[idx].qty + i.qty };
      return next;
    }
    return [...s, i];
  });
  const remove: Ctx["remove"] = (key) => setItems((s) => s.filter((x) => itemKey(x) !== key));
  const setQty: Ctx["setQty"] = (key, qty) => setItems((s) => qty <= 0 ? s.filter((x) => itemKey(x) !== key) : s.map((x) => itemKey(x) === key ? { ...x, qty } : x));

  const count = items.reduce((a, b) => a + b.qty, 0);
  const subtotal = items.reduce((a, b) => a + b.qty * (b.price + (b.extras?.reduce((s, e) => s + e.price * (e.qty || 1), 0) || 0)), 0);

  const setCoupon: Ctx["setCoupon"] = (c) => setCouponState(c);
  return <CartCtx.Provider value={{ items, add, remove, setQty, clear: () => { setItems([]); setCouponState(null); }, count, subtotal, coupon, setCoupon }}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error("useCart must be used within CartProvider");
  return c;
}

export function itemKey(it: CartItem): string {
  return `${it.productId}|${it.sizeLabel||""}|${it.cardText||""}|${JSON.stringify(it.extras||[])}`;
}

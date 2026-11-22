import { useEffect, useState } from "react";

type FlyEvent = {
  src: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  id: number;
};

let listeners: ((e: FlyEvent) => void)[] = [];
let counter = 0;

export function flyToCart(opts: { src: string; startEl: Element | null }) {
  const cart = document.getElementById("cart-icon");
  if (!cart || !opts.startEl) return;
  const s = opts.startEl.getBoundingClientRect();
  const e = cart.getBoundingClientRect();
  const ev: FlyEvent = {
    src: opts.src,
    startX: s.left + s.width / 2,
    startY: s.top + s.height / 2,
    endX: e.left + e.width / 2,
    endY: e.top + e.height / 2,
    id: ++counter,
  };
  listeners.forEach((l) => l(ev));
  cart.classList.add("cart-pulse");
  setTimeout(() => cart.classList.remove("cart-pulse"), 600);
}

export function FlyLayer() {
  const [items, setItems] = useState<FlyEvent[]>([]);
  useEffect(() => {
    const fn = (e: FlyEvent) => {
      setItems((s) => [...s, e]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== e.id)), 800);
    };
    listeners.push(fn);
    return () => { listeners = listeners.filter((l) => l !== fn); };
  }, []);
  return (
    <div className="fixed inset-0 pointer-events-none z-[200]">
      {items.map((it) => {
        const dx = it.endX - it.startX;
        const dy = it.endY - it.startY;
        return (
          <img
            key={it.id}
            src={it.src}
            alt=""
            className="fly-item"
            style={{
              position: "fixed",
              left: it.startX - 30,
              top: it.startY - 30,
              width: 60,
              height: 60,
              borderRadius: 12,
              objectFit: "cover",
              boxShadow: "0 8px 24px rgba(0,0,0,.25)",
              ["--dx" as any]: `${dx}px`,
              ["--dy" as any]: `${dy}px`,
            }}
          />
        );
      })}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { ProductGallery } from "@/components/ProductGallery";
import { PriceStrike } from "@/components/PriceStrike";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { flyToCart } from "@/lib/fly-to-cart";
import { useNavigate } from "@tanstack/react-router";
import { useIsMobile } from "@/hooks/use-mobile";
import { PLATFORM_TEMPLATE_STORE_ID } from "@/lib/platform-template";
import { isLazyPreviewMode } from "@/lib/preview-mode";

type Product = {
  id: string; name: string; description: string; price: number;
  original_price: number | null; image_url: string; rating: number;
  badge: string | null; stock: number; category_id: string | null;
};
type AddOn = { id: string; name: string; price: number; image_url: string };
type SizeOpt = { id: string; label: string; price: number; original_price: number | null };

function useProductData(productId: string | null, open: boolean) {
  const [p, setP] = useState<Product | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [addons, setAddons] = useState<AddOn[]>([]);
  const [sizes, setSizes] = useState<SizeOpt[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !productId) return;
    setLoading(true);
    setP(null);
    (async () => {
      const preview = isLazyPreviewMode();
      const templateFilter = preview ? PLATFORM_TEMPLATE_STORE_ID : null;
      let productQuery: any = supabase.from("products").select("*").eq("id", productId);
      if (templateFilter) productQuery = productQuery.eq("store_id", templateFilter);
      let addonQuery: any = supabase.from("add_ons").select("id,name,price,image_url").eq("active", true);
      if (templateFilter) addonQuery = addonQuery.eq("store_id", templateFilter);
      const [pr, gal, a, sz] = await Promise.all([
        productQuery.maybeSingle(),
        supabase.from("product_images").select("image_url,display_order").eq("product_id", productId).order("display_order"),
        addonQuery.order("display_order"),
        (supabase as any).from("product_sizes").select("id,label,price,original_price,display_order").eq("product_id", productId).order("display_order"),
      ]);
      const prod = (pr.data as Product) ?? null;
      setP(prod);
      const galleryUrls = (gal.data || []).map((g: any) => g.image_url as string);
      const baseImg = prod?.image_url;
      setImages(baseImg ? [baseImg, ...galleryUrls.filter((u) => u !== baseImg)] : galleryUrls);
      setAddons((a.data || []) as AddOn[]);
      setSizes(((sz?.data || []) as any[]).map((r) => ({ id: r.id, label: r.label, price: Number(r.price), original_price: r.original_price !== null ? Number(r.original_price) : null })));
      setLoading(false);
    })();
  }, [open, productId]);

  return { p, images, addons, sizes, loading };
}

function DetailBody({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const { add } = useCart();
  const nav = useNavigate();
  const { p, images, addons, sizes, loading } = useProductData(productId, !!productId);
  const [pickedQty, setPickedQty] = useState<Record<string, number>>({});
  const [card, setCard] = useState("");
  const [qty, setQty] = useState(1);
  const [sizeId, setSizeId] = useState<string | null>(null);

  useEffect(() => { setPickedQty({}); setCard(""); setQty(1); setSizeId(null); }, [productId]);
  useEffect(() => { if (sizes.length && !sizeId) setSizeId(sizes[0].id); }, [sizes, sizeId]);
  const selSize = sizes.find((s) => s.id === sizeId) || null;
  const unitPrice = selSize ? selSize.price : (p ? Number(p.price) : 0);

  const extras = addons
    .filter((a) => (pickedQty[a.id] || 0) > 0)
    .map((a) => ({ id: a.id, name: a.name, price: Number(a.price), qty: pickedQty[a.id], image: a.image_url }));
  const extraSum = extras.reduce((s, e) => s + e.price * e.qty, 0);
  const total = p ? (unitPrice + extraSum) * qty : 0;

  function setAddonQty(id: string, q: number) { setPickedQty((s) => ({ ...s, [id]: Math.max(0, q) })); }
  function handleAdd(goCheckout = false) {
    if (!p) return;
    flyToCart({ src: p.image_url, startEl: document.querySelector(`[data-detail-img="${p.id}"]`) });
    add({ productId: p.id, name: p.name, price: unitPrice, image: p.image_url, qty, extras, cardText: card, sizeLabel: selSize?.label });
    toast.success(p.name + " נוסף לסל");
    onClose();
    if (goCheckout) nav({ to: "/checkout" });
  }

  if (loading || !p) return <div className="py-20 text-center text-muted-foreground">טוען...</div>;

  return (
    <>
      <div className="space-y-5 pt-2">
        <div data-detail-img={p.id}>
          <ProductGallery images={images} alt={p.name} />
        </div>

        <div className="space-y-2">
          {p.badge && <span className="inline-block bg-primary text-primary-foreground text-[11px] font-semibold px-3 py-1 rounded-full">{p.badge}</span>}
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{p.name}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {p.stock > 0 ? `במלאי (${p.stock})` : "אזל"}
          </div>
          {p.description && <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{p.description}</p>}
          <div className="flex items-baseline gap-2 pt-1">
            {selSize?.original_price ? (
              <PriceStrike value={selSize.original_price} className="text-sm" />
            ) : (!selSize && p.original_price && <PriceStrike value={p.original_price} className="text-sm" />)}
            <span className="text-2xl font-bold text-primary">₪{unitPrice}</span>
          </div>
        </div>

        {sizes.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
            <p className="font-semibold text-sm">בחר גודל</p>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <button key={s.id} onClick={() => setSizeId(s.id)}
                  className={`px-3 py-1.5 rounded-xl text-sm border transition ${sizeId === s.id ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/40"}`}>
                  {s.label} · ₪{s.price}
                </button>
              ))}
            </div>
          </div>
        )}

        {addons.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-3 space-y-3">
            <p className="font-semibold text-sm">תוספות מומלצות</p>
            <div className="-mx-3 overflow-x-auto snap-x snap-mandatory">
              <div className="flex gap-3 px-3 pb-2">
                {addons.map((a) => {
                  const selected = (pickedQty[a.id] || 0) > 0;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAddonQty(a.id, selected ? 0 : 1)}
                      aria-pressed={selected}
                      className={`relative shrink-0 snap-start w-40 rounded-2xl border-2 p-2.5 text-right transition ${selected ? "border-primary bg-primary/10 shadow-md" : "border-border bg-background hover:border-primary/40"}`}
                    >
                      {selected && (
                        <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black z-10">✓</span>
                      )}
                      <div className="aspect-square w-full rounded-xl overflow-hidden bg-muted mb-2">
                        {a.image_url && <img src={a.image_url} alt={a.name} className="w-full h-full object-cover" />}
                      </div>
                      <p className="font-semibold text-sm truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">+₪{a.price}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
          <label className="font-semibold text-sm">טקסט לכרטיס ברכה (אופציונלי)</label>
          <textarea value={card} onChange={(e) => setCard(e.target.value)} maxLength={200} rows={2}
            className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm outline-none focus:border-primary" placeholder="לאהובי היקר..." />
        </div>
      </div>
      <div className="sticky bottom-0 -mx-5 mt-5 bg-background/95 backdrop-blur border-t border-border p-3 pb-5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
            <button aria-label="הפחת כמות" onClick={() => setQty((q) => Math.max(1, q - 1))} className="p-1.5 hover:bg-secondary rounded-lg"><Minus size={14} /></button>
            <span className="w-7 text-center font-semibold text-sm">{qty}</span>
            <button aria-label="הוסף כמות" onClick={() => setQty((q) => q + 1)} className="p-1.5 hover:bg-secondary rounded-lg"><Plus size={14} /></button>
          </div>
          <button disabled={p.stock === 0} onClick={() => handleAdd(false)} className="flex-1 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-40 transition">
            הוסף לסל · ₪{total}
          </button>
        </div>
        <button disabled={p.stock === 0} onClick={() => handleAdd(true)} className="w-full text-sm bg-foreground text-background font-medium py-2 rounded-xl hover:opacity-90 disabled:opacity-40">קנה עכשיו</button>
      </div>
    </>
  );
}

export function ProductDetail({ productId, open, onOpenChange }: { productId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const isMobile = useIsMobile();

  if (!isMobile) return null; // desktop uses inline panel
  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground>
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 animate-in fade-in" />
          <DrawerPrimitive.Content
            dir="rtl"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[94%] max-w-2xl flex-col rounded-t-3xl bg-background border border-border shadow-2xl outline-none"
          >
            <DrawerPrimitive.Title className="sr-only">פרטי מוצר</DrawerPrimitive.Title>
            <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-muted-foreground/30 shrink-0" />
            <button onClick={() => onOpenChange(false)} aria-label="סגור" className="absolute top-3 left-3 p-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground z-10">
              <X size={16} />
            </button>
            <div className="flex-1 overflow-y-auto px-5 pb-2">
              <DetailBody productId={productId} onClose={() => onOpenChange(false)} />
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
  );
}

/** Inline side panel for desktop layouts. Pass productId; renders nothing if null. */
export function ProductDetailPanel({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  if (!productId) return null;
  return (
    <div dir="rtl" className="bg-card rounded-3xl border border-border shadow-[var(--shadow-soft)] flex flex-col h-[calc(100vh-7rem)] sticky top-24 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
        <span className="text-xs font-semibold text-muted-foreground">פרטי מוצר</span>
        <button onClick={onClose} aria-label="סגור" className="p-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground">
          <X size={16} />
        </button>
      </div>
      <div key={productId} className="flex-1 overflow-y-auto px-5 pb-2 animate-in fade-in duration-150">
        <DetailBody productId={productId} onClose={onClose} />
      </div>
    </div>
  );
}

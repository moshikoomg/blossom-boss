import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { ArrowRight, Minus, Plus, ShoppingCart, Star } from "lucide-react";
import { toast } from "sonner";
import { ProductGallery } from "@/components/ProductGallery";
import { flyToCart } from "@/lib/fly-to-cart";
import { PLATFORM_TEMPLATE_STORE_ID } from "@/lib/platform-template";
import { isLazyPreviewMode } from "@/lib/preview-mode";

export const Route = createFileRoute("/products/$productId")({
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("products")
      .select("id,name,description,price,image_url")
      .eq("id", params.productId)
      .maybeSingle();
    return { product: (data as { id: string; name: string; description: string | null; price: number; image_url: string | null } | null) ?? null };
  },
  head: ({ params, loaderData }) => {
    const p = loaderData?.product;
    const url = `/products/${params.productId}`;
    if (!p) {
      return {
        meta: [
          { title: "מוצר" },
          { name: "description", content: "מוצרים בחנות שלנו." },
        ],
        links: [{ rel: "canonical", href: url }],
      };
    }
    const title = p.name;
    const desc = (p.description || `${p.name} — להזמנה ומשלוח.`).replace(/\s+/g, " ").slice(0, 160);
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: url },
        ...(p.image_url ? [{ property: "og:image", content: p.image_url }, { name: "twitter:image", content: p.image_url }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.name,
            description: desc,
            image: p.image_url || undefined,
            offers: {
              "@type": "Offer",
              price: p.price,
              priceCurrency: "ILS",
              availability: "https://schema.org/InStock",
              url,
            },
          }),
        },
      ],
    };
  },
  component: ProductPage,
});

type Product = {
  id: string; name: string; description: string; price: number;
  original_price: number | null; image_url: string; rating: number;
  badge: string | null; stock: number; category_id: string | null;
};
type AddOn = { id: string; name: string; price: number; image_url: string; gallery?: string[] };

function ProductPage() {
  const { productId } = Route.useParams();
  const nav = useNavigate();
  const { add, count } = useCart();
  const [p, setP] = useState<Product | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [related, setRelated] = useState<Product[]>([]);
  const [addons, setAddons] = useState<AddOn[]>([]);
  const [pickedQty, setPickedQty] = useState<Record<string, number>>({});
  const [card, setCard] = useState("");
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const preview = isLazyPreviewMode();
      let productQuery: any = supabase.from("products").select("*").eq("id", productId);
      if (preview) productQuery = productQuery.eq("store_id", PLATFORM_TEMPLATE_STORE_ID);
      const { data } = await productQuery.maybeSingle();
      setP((data as Product) ?? null);

      const { data: gal } = await supabase.from("product_images").select("image_url,display_order").eq("product_id", productId).order("display_order");
      const galleryUrls = (gal || []).map((g: any) => g.image_url as string);
      const baseImg = (data as Product | null)?.image_url;
      const allImgs = baseImg ? [baseImg, ...galleryUrls.filter((u) => u !== baseImg)] : galleryUrls;
      setImages(allImgs);

      const [a, r] = await Promise.all([
        (preview
          ? supabase.from("add_ons").select("id,name,price,image_url").eq("store_id", PLATFORM_TEMPLATE_STORE_ID).eq("active", true)
          : supabase.from("add_ons").select("id,name,price,image_url").eq("active", true)
        ).order("display_order"),
        data && (data as Product).category_id
          ? (preview
            ? supabase.from("products").select("*").eq("store_id", PLATFORM_TEMPLATE_STORE_ID).eq("active", true)
            : supabase.from("products").select("*").eq("active", true)
          ).eq("category_id", (data as Product).category_id as string).neq("id", productId).limit(8)
          : Promise.resolve({ data: [] as Product[] }),
      ]);
      const addonIds = ((a.data || []) as AddOn[]).map((x) => x.id);
      const ai = addonIds.length
        ? await supabase.from("addon_images").select("addon_id,image_url,display_order").in("addon_id", addonIds).order("display_order")
        : { data: [] as any[] };
      const galleryByAddon: Record<string, string[]> = {};
      for (const row of (ai.data || []) as any[]) {
        (galleryByAddon[row.addon_id] ||= []).push(row.image_url);
      }
      const addonsWithImgs = ((a.data || []) as AddOn[]).map((x) => ({ ...x, gallery: galleryByAddon[x.id] || [] }));
      setAddons(addonsWithImgs);
      if (r.data) setRelated(r.data as Product[]);
      setLoading(false);
    })();
  }, [productId]);

  if (loading) return <div dir="rtl" className="min-h-screen flex items-center justify-center text-muted-foreground">טוען...</div>;
  if (!p) return (
    <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p>המוצר לא נמצא</p>
      <Link to="/" className="bg-primary text-primary-foreground px-6 py-2 rounded-xl font-bold">חזרה לחנות</Link>
    </div>
  );

  const extras = addons
    .filter((a) => (pickedQty[a.id] || 0) > 0)
    .map((a) => ({ id: a.id, name: a.name, price: Number(a.price), qty: pickedQty[a.id], image: a.image_url }));
  const extraSum = extras.reduce((s, e) => s + e.price * e.qty, 0);
  const total = (Number(p.price) + extraSum) * qty;

  function toggleAddon(id: string) {
    setPickedQty((s) => ({ ...s, [id]: s[id] ? 0 : 1 }));
  }

  function handleAdd(goCheckout = false, sourceEl?: HTMLElement | null) {
    if (sourceEl) flyToCart({ src: p!.image_url, startEl: sourceEl });
    add({ productId: p!.id, name: p!.name, price: Number(p!.price), image: p!.image_url, qty, extras, cardText: card });
    toast.success("נוסף לסל", { description: p!.name });
    if (goCheckout) nav({ to: "/checkout" });
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-1 text-sm font-bold text-foreground"><ArrowRight size={18}/> חזרה</Link>
        <Link to="/cart" id="cart-icon" aria-label="פתח עגלת קניות" className="relative p-2 rounded-full bg-accent text-accent-foreground">
          <ShoppingCart size={18}/>
          {count > 0 && <span className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">{count}</span>}
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        <div className="grid md:grid-cols-2 gap-8">
          <ProductGallery images={images} alt={p.name}/>
          <div className="space-y-4">
            {p.badge && <span className="inline-block bg-primary text-primary-foreground text-xs font-black px-3 py-1 rounded-full">{p.badge}</span>}
            <h1 className="text-3xl md:text-4xl font-black text-foreground leading-tight">{p.name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Star size={14} className="fill-yellow-500 text-yellow-500"/> {p.rating} · {p.stock > 0 ? `במלאי (${p.stock})` : "אזל"}
            </div>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{p.description}</p>
            <div className="flex items-baseline gap-3">
              {p.original_price && <span className="line-through text-muted-foreground">₪{p.original_price}</span>}
              <span className="text-3xl font-black text-foreground">₪{p.price}</span>
            </div>

            {addons.length > 0 && (
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <p className="font-bold text-sm">תוספות מומלצות</p>
                <div className="-mx-1 overflow-x-auto snap-x snap-mandatory scrollbar-thin">
                  <div className="flex gap-3 px-1 pb-1">
                    {addons.map((a) => {
                      const selected = (pickedQty[a.id] || 0) > 0;
                      const imgs = a.gallery && a.gallery.length ? a.gallery : (a.image_url ? [a.image_url] : []);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleAddon(a.id)}
                          aria-pressed={selected}
                          className={`relative shrink-0 snap-start w-36 rounded-2xl border-2 p-2 text-right transition ${selected ? "border-primary bg-primary/10 shadow-md" : "border-border bg-background hover:border-primary/40"}`}
                        >
                          {selected && (
                            <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-black z-10">✓</span>
                          )}
                          <div className="aspect-square w-full rounded-xl overflow-hidden bg-muted mb-2">
                            {imgs[0] && <img src={imgs[0]} alt={a.name} className="w-full h-full object-cover"/>}
                          </div>
                          <p className="font-bold text-sm truncate">{a.name}</p>
                          <p className="text-xs text-muted-foreground">+₪{a.price}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
              <label className="font-bold text-sm">טקסט לכרטיס ברכה (אופציונלי)</label>
              <textarea value={card} onChange={(e) => setCard(e.target.value)} maxLength={200} rows={2}
                className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm outline-none focus:border-primary" placeholder="לאהובי היקר..."/>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-card border border-border rounded-xl p-1">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="הפחת כמות" className="p-2 hover:bg-accent rounded-lg"><Minus size={14}/></button>
                <span className="w-8 text-center font-bold">{qty}</span>
                <button onClick={() => setQty((q) => q + 1)} aria-label="הגדל כמות" className="p-2 hover:bg-accent rounded-lg"><Plus size={14}/></button>
              </div>
              <button disabled={p.stock === 0} onClick={(e) => handleAdd(false, (e.currentTarget as HTMLElement))} className="flex-1 bg-primary text-primary-foreground font-black py-3 rounded-xl hover:bg-primary/90 disabled:opacity-40 transition">
                הוסף לסל · ₪{total}
              </button>
            </div>
            <button disabled={p.stock === 0} onClick={() => handleAdd(true)} className="w-full bg-foreground text-background font-bold py-3 rounded-xl hover:opacity-90 disabled:opacity-40">קנה עכשיו</button>
          </div>
        </div>

        {related.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-black">עוד מאותה קטגוריה</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {related.map((r) => (
                <Link to="/products/$productId" params={{ productId: r.id }} key={r.id} className="bg-card rounded-2xl p-3 border border-border hover:-translate-y-1 transition">
                  <div className="aspect-square rounded-xl overflow-hidden bg-muted mb-2">
                    <img src={r.image_url} alt={r.name} className="w-full h-full object-cover"/>
                  </div>
                  <p className="font-bold text-sm line-clamp-1">{r.name}</p>
                  <p className="font-black mt-1">₪{r.price}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

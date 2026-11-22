import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPreviewBundle, type PreviewBundle } from "@/lib/preview-store.functions";

export const Route = createFileRoute("/preview/$storeId")({
  component: PreviewPage,
  head: () => ({
    meta: [
      { title: "תצוגה מקדימה — החנות שלך" },
      { name: "description", content: "תצוגה מקדימה של החנות החדשה שלך — המוצרים, הצבעים והעיצוב." },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">לא הצלחנו לטעון את התצוגה</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p>החנות לא נמצאה.</p>
    </div>
  ),
});

function PreviewPage() {
  const { storeId } = Route.useParams();
  const [bundle, setBundle] = useState<PreviewBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPreviewBundle({ data: { store_id: storeId } })
      .then((b) => {
        if (cancelled) return;
        setBundle(b);
        setError(b.store ? null : "החנות לא נמצאה");
      })
      .catch((e) => !cancelled && setError(e?.message || "שגיאה בטעינה"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  // Platform brand colors (Blossom Boss) - customer can change in dashboard
  const primary = "#2d6a4f";
  const accent = "#52b788";
  const bg = "#faf8f5";
  const fg = "#1a1a1a";

  if (loading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">טוען את החנות שלך…</p>
      </div>
    );
  }
  if (error || !bundle?.store) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-center">{error || "החנות לא נמצאה"}</p>
      </div>
    );
  }

  const { store, categories, products } = bundle;
  const productsByCategory = categories.map((c) => ({
    cat: c,
    items: products.filter((p) => p.category_id === c.id),
  }));
  const uncategorized = products.filter((p) => !p.category_id);

  return (
    <div dir="rtl" style={{ background: bg, color: fg }} className="min-h-screen">
      {/* Preview banner */}
      <div style={{ background: primary, color: "#fff" }} className="px-4 py-2 text-center text-sm">
        זוהי תצוגה מקדימה של החנות שלך — אף אחד עוד לא רואה אותה ✨
      </div>

      {/* Header */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8">
        <div className="flex items-center gap-3">
          {store.logo_url ? (
            <img src={store.logo_url} alt={store.name} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div style={{ background: primary }} className="grid h-12 w-12 place-items-center rounded-full text-lg font-bold text-white">
              {store.name.slice(0, 1)}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold leading-tight">{store.name}</h1>
            {store.whatsapp_business || store.contact_phone ? (
              <p className="text-xs opacity-70">{store.whatsapp_business || store.contact_phone}</p>
            ) : null}
          </div>
        </div>
        <Link
          to="/admin"
          style={{ background: accent, color: "#1a1a1a" }}
          className="rounded-full px-5 py-2 text-sm font-semibold shadow transition hover:opacity-90"
        >
          המשך לעריכה
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pb-10">
        <div
          style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, color: "#fff" }}
          className="rounded-3xl p-10 shadow-lg"
        >
          <h2 className="text-3xl font-bold">ברוכים הבאים ל-{store.name}</h2>
          <p className="mt-2 max-w-xl text-base opacity-90">
            {products.length} מוצרים מוכנים, פלטה מותאמת אישית, וחנות שכבר חיה. הכל אוטומטית.
          </p>
        </div>
      </section>

      {/* Products by category */}
      <main className="mx-auto max-w-5xl px-6 pb-20">
        {productsByCategory.map(({ cat, items }) =>
          items.length === 0 ? null : (
            <section key={cat.id} className="mb-12">
              <h3 className="mb-4 text-xl font-semibold">{cat.name}</h3>
              <ProductGrid items={items} primary={primary} accent={accent} />
            </section>
          ),
        )}
        {uncategorized.length > 0 && (
          <section className="mb-12">
            <h3 className="mb-4 text-xl font-semibold">מוצרים</h3>
            <ProductGrid items={uncategorized} primary={primary} accent={accent} />
          </section>
        )}
        {products.length === 0 && (
          <p className="py-20 text-center opacity-70">אין עדיין מוצרים. אפשר להוסיף מהפאנל.</p>
        )}
      </main>
    </div>
  );
}

function ProductGrid({
  items,
  primary,
  accent,
}: {
  items: NonNullable<PreviewBundle["products"]>;
  primary: string;
  accent: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {items.map((p) => (
        <article
          key={p.id}
          className="group overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-lg"
        >
          <div className="aspect-square overflow-hidden bg-neutral-100">
            {p.image_url ? (
              <img
                src={p.image_url}
                alt={p.name}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div style={{ background: `linear-gradient(135deg, ${primary}33, ${accent}33)` }} className="h-full w-full" />
            )}
          </div>
          <div className="p-3 text-right">
            <h4 className="line-clamp-1 text-sm font-semibold text-neutral-900">{p.name}</h4>
            <p className="mt-1 text-sm font-bold" style={{ color: primary }}>
              ₪{Number(p.price || 0).toFixed(0)}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

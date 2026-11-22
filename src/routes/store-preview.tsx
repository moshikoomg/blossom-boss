import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { getPreviewBundle, type PreviewBundle } from "@/lib/preview-store.functions";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { markOAuthStart, publishedUrl, shouldUsePublishedOAuth } from "@/lib/oauth-flow";

export const Route = createFileRoute("/store-preview")({
  validateSearch: z.object({ store: z.string().optional() }),
  component: StorePreviewPage,
  head: () => ({
    meta: [
      { title: "תצוגה מקדימה — החנות שלך" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function StorePreviewPage() {
  const { store: storeId } = Route.useSearch();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<PreviewBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      // Auto-redirect after a brief pause so the explainer card flashes,
      // then continues onto onboarding.
      const t = window.setTimeout(() => {
        window.location.replace("/?openOnboarding=1");
      }, 2200);
      return () => window.clearTimeout(t);
      return;
    }
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
    return () => { cancelled = true; };
  }, [storeId]);

  // Platform brand colors (Blossom Boss) - customer can change in dashboard
  const primary = "#2d6a4f";
  const accent = "#52b788";
  const bg = "#faf8f5";
  const fg = "#1a1a1a";

  if (loading) {
    return <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background"><p className="text-sm text-muted-foreground">טוען את החנות שלך…</p></div>;
  }
  if (!storeId) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4 bg-card border border-border rounded-3xl p-8 shadow-sm">
          <div className="text-4xl">🌸</div>
          <h1 className="text-xl font-black">צור חנות כדי לראות תצוגה מקדימה</h1>
          <p className="text-sm text-muted-foreground">
            עוד אין לנו חנות לתצוגה. ניקח אותך להקמת חנות בשתי לחיצות.
          </p>
          <a
            href="/?openOnboarding=1"
            className="inline-block bg-primary text-primary-foreground font-bold px-6 py-3 rounded-xl hover:opacity-90 transition"
          >
            פתח חנות עכשיו ←
          </a>
        </div>
      </div>
    );
  }
  if (error || !bundle?.store) {
    return <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background p-6"><p className="text-center">{error || "החנות לא נמצאה"}</p></div>;
  }

  const { store, categories, products } = bundle;
  const grouped = categories.map((c) => ({ cat: c, items: products.filter((p) => p.category_id === c.id) }));
  const uncategorized = products.filter((p) => !p.category_id);

  return (
    <div dir="rtl" style={{ background: bg, color: fg }} className="min-h-screen">
      <div style={{ background: primary, color: "#fff" }} className="px-4 py-2 text-center text-sm">
        זוהי תצוגה מקדימה של החנות שלך — אף אחד עוד לא רואה אותה ✨
      </div>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8">
        <div className="flex items-center gap-3">
          {store.logo_url ? (
            <img src={store.logo_url} alt={store.name} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div style={{ background: primary }} className="grid h-12 w-12 place-items-center rounded-full text-lg font-bold text-white">{store.name.slice(0, 1)}</div>
          )}
          <h1 className="text-2xl font-bold leading-tight">{store.name}</h1>
        </div>
        <Link to="/admin" style={{ background: accent, color: "#1a1a1a" }} className="rounded-full px-5 py-2 text-sm font-semibold shadow hover:opacity-90">המשך לעריכה</Link>
      </header>
      <section className="mx-auto max-w-5xl px-6 pb-10">
        <div style={{ background: `linear-gradient(135deg, ${primary}, ${accent})`, color: "#fff" }} className="rounded-3xl p-10 shadow-lg">
          <h2 className="text-3xl font-bold">ברוכים הבאים ל-{store.name}</h2>
          <p className="mt-2 max-w-xl text-base opacity-90">{products.length} מוצרים מוכנים, פלטה מותאמת אישית, וחנות שכבר חיה.</p>
        </div>
      </section>
      <main className="mx-auto max-w-5xl px-6 pb-20">
        {grouped.map(({ cat, items }) => items.length === 0 ? null : (
          <section key={cat.id} className="mb-12">
            <h3 className="mb-4 text-xl font-semibold">{cat.name}</h3>
            <Grid items={items} primary={primary} accent={accent} />
          </section>
        ))}
        {uncategorized.length > 0 && (
          <section className="mb-12">
            <h3 className="mb-4 text-xl font-semibold">מוצרים</h3>
            <Grid items={uncategorized} primary={primary} accent={accent} />
          </section>
        )}
        {products.length === 0 && <p className="py-20 text-center opacity-70">אין עדיין מוצרים.</p>}
      </main>
      <SaveWithGoogle />
    </div>
  );
}

function Grid({ items, primary, accent }: { items: NonNullable<PreviewBundle["products"]>; primary: string; accent: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {items.map((p) => (
        <article key={p.id} className="group overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-lg">
          <div className="aspect-square overflow-hidden bg-neutral-100">
            {p.image_url ? (
              <img src={p.image_url} alt={p.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
            ) : (
              <div style={{ background: `linear-gradient(135deg, ${primary}33, ${accent}33)` }} className="h-full w-full" />
            )}
          </div>
          <div className="p-3 text-right">
            <h4 className="line-clamp-1 text-sm font-semibold text-neutral-900">{p.name}</h4>
            <p className="mt-1 text-sm font-bold" style={{ color: primary }}>₪{Number(p.price || 0).toFixed(0)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * Floating "Save with Google" CTA. Visible only while the visitor is on an
 * anonymous session — pressing it links a Google identity to that same user
 * (so all data they just created stays attached) and bounces them into the
 * admin dashboard. Falls back to a plain Google sign-in if linkIdentity is
 * unavailable.
 */
function SaveWithGoogle() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data.user;
        if (cancelled) return;
        // Show the CTA for anonymous users AND for completely unauthenticated
        // viewers — both need to "save" their store with a real identity.
        if (!u || u.is_anonymous) setShow(true);
      } catch {
        if (!cancelled) setShow(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    const redirectTo = `${window.location.origin}/admin`;
    try {
      // Try to link the Google identity onto the existing anonymous user so
      // the store they just built stays attached to the same auth.uid.
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user?.is_anonymous) {
        const { error } = await supabase.auth.linkIdentity({
          provider: "google",
          options: { redirectTo },
        });
        if (!error) return; // Browser is redirecting.
        console.warn("linkIdentity failed, falling back to OAuth", error);
      }
      if (shouldUsePublishedOAuth()) {
        window.open(publishedUrl("/admin"), "_blank", "noopener");
        toast.info("פותח את האתר הפומבי בכרטיסייה חדשה להתחברות.");
        setBusy(false);
        return;
      }
      markOAuthStart("/admin");
      const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirectTo });
      if ((res as any)?.error) {
        toast.error("נכשלה התחברות עם Google");
        setBusy(false);
      }
    } catch (err: any) {
      console.error("SaveWithGoogle failed", err);
      toast.error(err?.message || "שגיאה בשמירה");
      setBusy(false);
    }
  }

  return (
    <div
      dir="rtl"
      className="fixed bottom-5 inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
    >
      <button
        onClick={handleSave}
        disabled={busy}
        className="pointer-events-auto inline-flex items-center gap-3 rounded-full bg-white text-neutral-900 px-5 py-3 shadow-2xl border border-neutral-200 hover:shadow-[0_10px_40px_rgba(0,0,0,0.25)] hover:scale-[1.02] transition disabled:opacity-60 disabled:cursor-wait font-bold text-sm"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.26 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.11A6.61 6.61 0 0 1 5.5 12c0-.73.13-1.45.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.95l3.66-2.84Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
          />
        </svg>
        {busy ? "פותח את Google…" : "שמור את החנות עם Google"}
      </button>
    </div>
  );
}

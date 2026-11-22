import { useEffect, useMemo, useState } from "react";
import { Sparkles, ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createStoreForUser } from "@/lib/store-create.functions";
import { applyThemeColors } from "@/lib/theme-loader";
import { lovable } from "@/integrations/lovable";
import { markOAuthStart, publishedUrl, shouldUsePublishedOAuth } from "@/lib/oauth-flow";

/**
 * Sticky onboarding preview bar. Shows on every storefront load that
 * arrives with `?preview=1` — i.e. a visitor previewing how the platform
 * template store would look as their own brand. Renders the visitor's
 * chosen name/colors as an overlay (no DB writes), and the single CTA
 * "להמשך הרשמה ופתיחת החנות" triggers the real `createStoreForUser` flow
 * (Google OAuth if not signed in).
 */
export function PreviewBanner() {
  const params = useMemo(() => {
    if (typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    if (url.searchParams.get("preview") !== "1") return null;
    let theme: Record<string, string> = {};
    try {
      const raw = url.searchParams.get("ptheme");
      if (raw) theme = JSON.parse(decodeURIComponent(escape(atob(raw))));
    } catch {}
    return {
      name: url.searchParams.get("pname")?.trim() || "החנות שלי",
      city: url.searchParams.get("pcity")?.trim() || "",
      theme,
    };
  }, []);

  const [creating, setCreating] = useState(false);
  const createStore = useServerFn(createStoreForUser);

  // True while we are completing the OAuth → createStore handoff.
  // We render a clean white full-screen loader over everything so the user
  // never sees the blurred template/preview banner flash (which feels like
  // a disconnect).
  const [finalizing, setFinalizing] = useState<null | { name: string }>(null);

  // Apply the visitor's theme colors immediately (visual overlay only).
  useEffect(() => {
    if (!params) return;
    applyThemeColors(params.theme as any);
    // Override the document title so the browser tab matches the brand they typed.
    if (typeof document !== "undefined") document.title = params.name;
  }, [params]);

  // After Google OAuth returns with ?createStore=1 we read tmm_pending_store
  // (set by confirm()) and finalize the real creation, then redirect to the
  // live storefront.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("createStore") !== "1") return;
    const raw = localStorage.getItem("tmm_pending_store");
    if (!raw) return;
    try {
      const pendingPeek = JSON.parse(raw) as { name?: string };
      setFinalizing({ name: pendingPeek?.name || params?.name || "החנות שלך" });
    } catch {
      setFinalizing({ name: params?.name || "החנות שלך" });
    }
    let cancelled = false;
    (async () => {
      const start = Date.now();
      let user: any = null;
      while (Date.now() - start < 8000) {
        const { data } = await supabase.auth.getUser();
        if (data.user) { user = data.user; break; }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (cancelled || !user) return;
      try {
        setCreating(true);
        const pending = JSON.parse(raw) as { name: string; city: string; theme: Record<string, string> };
        const res = await createStore({ data: { name: pending.name, city: pending.city, theme: pending.theme as any } });
        localStorage.removeItem("tmm_pending_store");
        localStorage.setItem("tmm_store_override", res.storeId);
        try { localStorage.setItem("tmm_current_store_id", res.storeId); } catch {}
        toast.success("החנות שלך מוכנה! מעבירים אותך אליה");
        const goAdmin = url.searchParams.get("adminAfter") === "1";
        window.location.replace(
          goAdmin ? `/admin?store=${res.storeId}&onboarded=1` : `/?store=${res.storeId}&onboarded=1`,
        );
      } catch (e: any) {
        toast.error(e?.message || "שגיאה ביצירת החנות");
        setCreating(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!params) return null;

  async function confirm() {
    if (!params) return;
    setCreating(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        localStorage.setItem(
          "tmm_pending_store",
          JSON.stringify({ name: params.name, city: params.city, theme: params.theme }),
        );
        if (shouldUsePublishedOAuth()) {
          window.open(publishedUrl("/?openOnboarding=1"), "_blank", "noopener");
          toast.info("פותח את האתר הפומבי בכרטיסייה חדשה להתחברות.");
          setCreating(false);
          return;
        }
        const redirectTo = `${window.location.origin}/?store=11111111-1111-1111-1111-111111111111&preview=1&pname=${encodeURIComponent(params.name)}&pcity=${encodeURIComponent(params.city)}&ptheme=${encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(params.theme)))))}&createStore=1`;
        markOAuthStart("/?openOnboarding=1");
        const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirectTo });
        if ((res as any)?.error) {
          toast.error("נכשלה התחברות עם Google");
          setCreating(false);
        }
        return;
      }
      const r = await createStore({
        data: { name: params.name, city: params.city, theme: params.theme as any },
      });
      localStorage.setItem("tmm_store_override", r.storeId);
      try { localStorage.setItem("tmm_current_store_id", r.storeId); } catch {}
      toast.success("החנות שלך מוכנה! מעבירים אותך אליה");
      window.location.replace(`/?store=${r.storeId}&onboarded=1`);
    } catch (e: any) {
      toast.error(e?.message || "שגיאה ביצירת החנות");
      setCreating(false);
    }
  }

  function close() {
    window.location.assign("/");
  }

  return (
    <>
      {finalizing && (
        <div
          dir="rtl"
          className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center gap-6 px-6"
          role="status"
          aria-live="polite"
        >
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent shadow-xl flex items-center justify-center text-white text-3xl font-black">
            {(finalizing.name || "?").trim().charAt(0)}
          </div>
          <div className="text-center">
            <div className="text-xl font-black text-slate-900">{finalizing.name}</div>
            <div className="text-sm text-slate-500 mt-1">פותחים לך את החנות…</div>
          </div>
          <div className="w-10 h-10 rounded-full border-4 border-slate-200 border-t-primary animate-spin" />
        </div>
      )}
      {/* Spacer so the sticky banner never covers the page hero on mount */}
      <div className="h-[88px] sm:h-[68px]" aria-hidden />
      <div
        dir="rtl"
        className="fixed top-0 inset-x-0 z-[60] bg-gradient-to-l from-primary via-primary to-accent text-primary-foreground shadow-lg"
        role="region"
        aria-label="תצוגה מקדימה של החנות שלך"
      >
        <div className="container mx-auto px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Sparkles className="w-4 h-4 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold leading-tight truncate">
                כך תיראה החנות שלך — {params.name}
              </div>
              <div className="text-[11px] opacity-90 leading-tight hidden sm:block">
                זוהי תצוגה מקדימה. לחץ להמשך כדי שנפתח לך חנות אמיתית עם המוצרים שלך.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={confirm}
              disabled={creating}
              className="flex-1 sm:flex-none bg-background text-foreground font-bold text-sm rounded-xl px-4 py-2 hover:bg-background/90 transition disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {creating ? "פותח חנות…" : "להמשך הרשמה ופתיחת החנות"}
              {!creating && <ArrowLeft className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="סגור תצוגה מקדימה"
              className="rounded-xl p-2 hover:bg-white/10 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

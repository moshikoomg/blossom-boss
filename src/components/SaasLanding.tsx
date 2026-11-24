import { GOOGLE_AUTH_ENABLED } from "@/lib/auth-flags";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Check,
  Sparkles,
  Flower2,
  Loader2,
  LogIn,
  LayoutDashboard,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import type { OnboardingResult } from "@/components/OnboardingWizard";
import {
  awaitSafeSession,
  clearOAuthStart,
  markOAuthStart,
  publishedUrl,
  shouldUsePublishedOAuth,
} from "@/lib/oauth-flow";
import { useServerFn } from "@tanstack/react-start";
import { getPublicPlanSettings } from "@/lib/plan-settings.functions";
import { TRIAL_DAYS, MONTHLY_PRICE_ILS } from "@/lib/plans";

// Lazy-load the wizard so landing TTI stays fast.
const OnboardingWizard = lazy(() =>
  import("@/components/OnboardingWizard").then((m) => ({ default: m.OnboardingWizard })),
);

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

interface SaasLandingProps {
  /** Open the onboarding dialog immediately on mount (used after OAuth return). */
  autoOpen?: boolean;
}

export function SaasLanding({ autoOpen }: SaasLandingProps = {}) {
  const [dialogOpen, setDialogOpen] = useState<boolean>(!!autoOpen);
  const planFn = useServerFn(getPublicPlanSettings);
  const [plan, setPlan] = useState({ trial_days: TRIAL_DAYS, monthly_price_ils: MONTHLY_PRICE_ILS });
  useEffect(() => {
    planFn().then((p) => setPlan({ trial_days: p.trial_days, monthly_price_ils: p.monthly_price_ils })).catch(() => {});
  }, [planFn]);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [hasStore, setHasStore] = useState<boolean>(false);
  const [signingIn, setSigningIn] = useState(false);
  const [usePublishedOAuth, setUsePublishedOAuth] = useState(false);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);

  // Whenever the dialog opens or the inner step changes, snap scroll to top so
  // the header + first input are visible. Without this, a focused input inside
  // the wizard can scroll the dialog down on open and hide the title/field.
  useEffect(() => {
    if (!dialogOpen) return;
    const el = dialogContentRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      try { el.scrollTo({ top: 0, behavior: "auto" }); } catch { el.scrollTop = 0; }
    });
  }, [dialogOpen, hasSession]);

  useEffect(() => {
    if (autoOpen) setDialogOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    setUsePublishedOAuth(shouldUsePublishedOAuth());
  }, []);

  // Re-evaluate auth whenever the dialog opens — and keep it live so that a
  // post-OAuth session change flips Step A → Step B automatically.
  useEffect(() => {
    if (!dialogOpen) return;
    let cancelled = false;
    (async () => {
      // Wait briefly for the session to hydrate (Google OAuth return). Avoids
      // a flash of "sign in" → "signed in" on the same dialog open.
      const session = await awaitSafeSession(supabase);
      if (cancelled) return;
      if (!session) {
        setHasSession(false);
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const u = data.user;
      const signed = !!u && !(u as { is_anonymous?: boolean }).is_anonymous;
      setHasSession(signed);
      // If the user already owns a store, skip the new-store wizard entirely
      // and route them straight to their admin dashboard.
      if (signed && u) {
        const { data: stores } = await supabase
          .from("stores")
          .select("id")
          .eq("owner_user_id", u.id)
          .eq("active", true)
          .limit(1);
        if (cancelled) return;
        if (stores && stores.length > 0) {
          setHasStore(true);
          setDialogOpen(false);
          window.location.replace("/admin");
          return;
        }
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setHasSession(!!u && !(u as { is_anonymous?: boolean }).is_anonymous);
      if (u && !(u as { is_anonymous?: boolean }).is_anonymous) clearOAuthStart();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [dialogOpen]);

  // Header "התחברות / ניהול חנות" badge: tracks session + store ownership
  // independently of the dialog so the CTA can change label dynamically.
  const [headerAuth, setHeaderAuth] = useState<{ signedIn: boolean; ownsStore: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const u = data.user;
      const signed = !!u && !(u as { is_anonymous?: boolean }).is_anonymous;
      if (!signed || !u) { setHeaderAuth({ signedIn: false, ownsStore: false }); return; }
      const { data: s } = await supabase
        .from("stores").select("id")
        .eq("owner_user_id", u.id).eq("active", true).limit(1);
      if (cancelled) return;
      setHeaderAuth({ signedIn: true, ownsStore: !!(s && s.length) });
    }
    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void refresh(); });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  function handleHeaderAuthClick() {
    if (headerAuth?.signedIn && headerAuth.ownsStore) {
      window.location.assign("/admin");
    } else {
      setDialogOpen(true);
    }
  }

  // Wipe any previously-cached store theme so the landing always renders on brand defaults.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.removeItem("tmm_theme_colors"); } catch { /* ignore */ }
    const root = document.documentElement;
    for (const v of [
      "--primary", "--primary-foreground", "--secondary",
      "--accent", "--background", "--foreground",
    ]) {
      root.style.removeProperty(v);
    }
  }, []);

  const openDialog = useCallback(() => setDialogOpen(true), []);

  async function handleGoogleSignIn() {
    if (signingIn) return;
    // Preview/editor origins can lose the OAuth session on return. Complete
    // Google auth on the public app, which has the stable OAuth allowlist.
    if (shouldUsePublishedOAuth()) {
      try {
        window.open(
          publishedUrl("/?openOnboarding=1"),
          "_blank",
          "noopener",
        );
        toast.info("פותח את האתר הפומבי בכרטיסייה חדשה להתחברות.");
      } catch {
        toast.error("פתח את האתר הפומבי בכרטיסייה חדשה כדי להתחבר.");
      }
      return;
    }
    setSigningIn(true);
    try {
      const redirectTo = `${window.location.origin}/?openOnboarding=1`;
      markOAuthStart("/?openOnboarding=1");
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirectTo,
      });
      if ((res as { error?: unknown })?.error) {
        console.warn("[saas-landing] google signin error:", (res as { error?: unknown }).error);
        toast.error("ההתחברות לא הצליחה. נסה שוב או פתח באתר הפומבי בכרטיסייה חדשה.");
        setSigningIn(false);
        return;
      }
      // On a redirect the browser leaves the page; nothing more to do.
    } catch (err) {
      console.error("google signin failed", err);
      toast.error("שגיאה בהתחברות עם Google");
      setSigningIn(false);
    }
  }

  function handleWizardComplete(result: OnboardingResult) {
    const storeId = result.storeId;
    setDialogOpen(false);
    if (storeId) {
      try { localStorage.setItem("tmm_store_override", storeId); } catch { /* ignore */ }
      // Straight into the store's admin, with no extra popups.
      window.location.replace(`/admin?store=${storeId}&onboarded=1`);
    } else {
      window.location.replace("/admin");
    }
  }

  const signupLabel = GOOGLE_AUTH_ENABLED ? "התחברות עם חשבון Google" : "הרשמה עם אימייל וסיסמה";

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground antialiased">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2 font-black text-lg tracking-tight">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground shadow-md">
              <Flower2 size={18} />
            </span>
            Blossom Boss
          </a>
          <button
            onClick={handleHeaderAuthClick}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-foreground/15 bg-background/70 text-foreground text-sm font-bold whitespace-nowrap hover:bg-foreground/5 transition"
          >
            {headerAuth?.signedIn && headerAuth.ownsStore ? (
              <><LayoutDashboard size={15} /> ניהול חנות</>
            ) : (
              <><LogIn size={15} /> התחברות</>
            )}
          </button>
        </div>
      </header>

      <main id="top" className="container mx-auto px-4 max-w-2xl">
        {/* ---------- Pitch ---------- */}
        <section className="pt-12 pb-10 md:pt-20 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
            <Sparkles size={13} /> פיילוט · מחפשים חנויות פרחים ראשונות
          </div>
          <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-tight">
            אתר הזמנות פשוט
            <br />
            <span className="text-primary">לחנות הפרחים שלך</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            אנחנו בונים מערכת קטנה ופשוטה לחנויות פרחים: אתר עם קישור משלך שלקוחות מזמינים ממנו,
            ומקום אחד לראות את ההזמנות והמשלוחים. המערכת חדשה ונמצאת בפיילוט, ואנחנו מחפשים כמה
            חנויות שינסו אותה ויגידו לנו מה עובד ומה חסר.
          </p>
          <div className="space-y-3">
            <button
              onClick={openDialog}
              className="inline-flex items-center justify-center gap-2 h-14 px-8 rounded-2xl bg-primary text-primary-foreground font-black text-base shadow-xl shadow-primary/25 hover:scale-[1.02] transition-all w-full sm:w-auto"
            >
              הצטרפות לפיילוט
              <ArrowLeft size={18} />
            </button>
            <p className="text-sm text-muted-foreground">בלי כרטיס אשראי ובלי התחייבות.</p>
          </div>
        </section>

        {/* ---------- What signup asks ---------- */}
        <section className="py-10 border-t border-border/60">
          <h2 className="text-2xl font-black mb-2 text-center">מה ממלאים בהרשמה</h2>
          <p className="text-muted-foreground text-center mb-6">רק את הפרטים של החנות שלך. בערך דקה.</p>
          <ol className="space-y-3">
            {[
              signupLabel,
              "שם החנות",
              "טלפון לוואטסאפ ועיר (העיר לא חובה)",
            ].map((t, i) => (
              <li key={t} className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border">
                <span className="w-8 h-8 shrink-0 rounded-full bg-primary text-primary-foreground text-sm font-black grid place-items-center">
                  {i + 1}
                </span>
                <span className="font-bold">{t}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground mt-4 text-center">
            את המוצרים, התמונות והמחירים מוסיפים אחר כך מהניהול, בקצב שלך.
          </p>
        </section>

        {/* ---------- What exists today ---------- */}
        <section className="py-10 border-t border-border/60">
          <h2 className="text-2xl font-black mb-6 text-center">מה יש במערכת היום</h2>
          <ul className="space-y-3">
            {[
              "קישור לחנות שלך, לשלוח ללקוחות או לשים באינסטגרם",
              "העלאת מוצרים, תמונות ומחירים מהטלפון",
              "הזמנות מהאתר מגיעות למסך הניהול, עם כפתור וואטסאפ ללקוח",
              "רשימת משלוחים להיום ולמחר",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <Check size={18} className="text-primary mt-0.5 shrink-0" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Pilot terms ---------- */}
        <section className="py-10 border-t border-border/60">
          <h2 className="text-2xl font-black mb-4 text-center">מה זה אומר פיילוט</h2>
          <div className="space-y-3 text-muted-foreground leading-relaxed">
            <p>המערכת עובדת, אבל היא חדשה. יכולות להיות תקלות, ואנחנו מתקנים אותן מהר.</p>
            <p>{plan.trial_days} הימים הראשונים בלי תשלום ובלי כרטיס אשראי. נשמח לשמוע מכם מה לשפר.</p>
          </div>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="py-12 border-t border-border/60 text-center">
          <button
            onClick={openDialog}
            className="inline-flex items-center justify-center gap-2 h-14 px-8 rounded-2xl bg-primary text-primary-foreground font-black text-base shadow-xl shadow-primary/25 hover:scale-[1.02] transition-all w-full sm:w-auto"
          >
            הצטרפות לפיילוט
            <ArrowLeft size={18} />
          </button>
        </section>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="container mx-auto px-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
          <span>© {new Date().getFullYear()} Blossom Boss</span>
          <a href="/terms" className="hover:text-foreground">תנאי שימוש</a>
          <a href="/privacy" className="hover:text-foreground">פרטיות</a>
        </div>
      </footer>

      {/* ---------- Onboarding Dialog ---------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          ref={dialogContentRef}
          dir="rtl"
          className="max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0 border-0 sm:rounded-3xl bg-card shadow-2xl shadow-primary/15"
        >
          {hasSession === null ? (
            <div className="p-10 grid place-items-center">
              <Loader2 className="animate-spin text-muted-foreground" size={28} />
              <DialogTitle className="sr-only">טוען</DialogTitle>
            </div>
          ) : !hasSession ? (
            /* Step A — Google gate */
            <div className="relative p-8 md:p-10 overflow-hidden">
              <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-[var(--primary-glow)]/15 blur-3xl pointer-events-none" />
              <div className="relative">
                <DialogHeader className="text-right mb-6">
                  <div className="mb-5 w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-[var(--primary-glow)] grid place-items-center text-primary-foreground shadow-xl shadow-primary/30">
                    <Sparkles size={26} />
                  </div>
                  <DialogTitle className="text-2xl md:text-3xl font-black leading-tight text-foreground">
                    הצטרפות לפיילוט
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-relaxed pt-1.5 text-muted-foreground">
                    {GOOGLE_AUTH_ENABLED ? "התחברות מאובטחת עם Google" : "הרשמה קצרה עם אימייל וסיסמה"} כדי שנוכל לשמור עבורך את החנות ולתת לך גישת מנהל מלאה.
                  </DialogDescription>
                </DialogHeader>

                <button
                  onClick={handleGoogleSignIn}
                  disabled={signingIn}
                  className="w-full h-14 rounded-2xl bg-card border-2 border-border hover:border-primary text-foreground font-black text-base shadow-sm hover:shadow-lg hover:shadow-primary/15 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-3"
                >
                  {signingIn ? (
                    <><Loader2 className="animate-spin" size={18} /> מתחבר…</>
                  ) : (
                    GOOGLE_AUTH_ENABLED ? <><GoogleIcon /> התחבר עם Google</> : <>הרשמה / התחברות עם אימייל</>
                  )}
                </button>

                <ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><Check size={16} className="text-primary flex-shrink-0" /> {GOOGLE_AUTH_ENABLED ? "ללא טפסים. ללא קוד SMS." : "בלי קוד SMS. רק אימייל וסיסמה."}</li>
                  <li className="flex items-center gap-2"><Check size={16} className="text-primary flex-shrink-0" /> החנות נשמרת לחשבון שלך אוטומטית.</li>
                  <li className="flex items-center gap-2"><Check size={16} className="text-primary flex-shrink-0" /> בלי כרטיס אשראי.</li>
                </ul>
              {usePublishedOAuth && (
                <p className="mt-5 text-xs text-muted-foreground bg-muted/40 border border-border/60 rounded-xl p-3 leading-relaxed">
                  אתה בצפייה מקדימה. להתחברות מלאה עם Google —{" "}
                  <a
                    href={publishedUrl("/?openOnboarding=1")}
                    target="_blank"
                    rel="noopener"
                    className="font-bold text-foreground underline underline-offset-2"
                  >
                    פתח את האתר הפומבי בכרטיסייה חדשה
                  </a>
                  .
                </p>
              )}
              </div>
            </div>
          ) : (
            /* Step B+ — Wizard */
            <div className="relative p-6 md:p-8 overflow-hidden">
              <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
              <div className="relative">
                <DialogHeader className="text-right mb-5">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/12 text-primary text-[11px] font-bold tracking-wide mb-3 w-fit">
                    <Sparkles size={12} /> פותחים חנות
                  </div>
                  <DialogTitle className="text-2xl md:text-3xl font-black leading-tight text-foreground">החנות שלך, צעד אחר צעד</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground pt-1">
                    שם החנות וטלפון, וזהו. את השאר מסדרים אחר כך.
                  </DialogDescription>
                </DialogHeader>
                <Suspense fallback={<div className="py-10 grid place-items-center"><Loader2 className="animate-spin text-primary" size={24} /></div>}>
                  <OnboardingWizard embedded onComplete={handleWizardComplete} />
                </Suspense>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                            */
/* -------------------------------------------------------------------------- */

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C41.2 35.7 44 30.3 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

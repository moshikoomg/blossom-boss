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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  Check,
  Sparkles,
  Flower2,
  MessageCircle,
  CreditCard,
  Truck,
  Tag,
  Bot,
  Boxes,
  Loader2,
  Star,
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
import { useLandingContent } from "@/lib/landing-content";
import { useServerFn } from "@tanstack/react-start";
import { getPublicPlanSettings } from "@/lib/plan-settings.functions";
import { TRIAL_DAYS, MONTHLY_PRICE_ILS } from "@/lib/plans";

// Icon mapping for content-driven feature blocks.
const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  MessageCircle, Boxes, CreditCard, Tag, Truck, Bot, Sparkles, Flower2, Star, Check,
};

// Lazy-load the wizard so landing TTI stays fast.
const OnboardingWizard = lazy(() =>
  import("@/components/OnboardingWizard").then((m) => ({ default: m.OnboardingWizard })),
);

/* -------------------------------------------------------------------------- */
/*  Real flower photography (Unsplash CDN — no key required)                  */
/* -------------------------------------------------------------------------- */

const HERO_BOUQUETS = [
  "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=600&q=70&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=600&q=70&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=600&q=70&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=600&q=70&auto=format&fit=crop",
];

const STORE_EXAMPLES = [
  { name: "פרחי שרה", city: "תל אביב", img: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=500&q=70&auto=format&fit=crop", price: 189 },
  { name: "משתלת הגליל", city: "כרמיאל", img: "https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=500&q=70&auto=format&fit=crop", price: 249 },
  { name: "Blossom Studio", city: "הרצליה", img: "https://images.unsplash.com/photo-1567748157439-651aca2ff064?w=500&q=70&auto=format&fit=crop", price: 320 },
  { name: "אורבן בלום", city: "רמת גן", img: "https://images.unsplash.com/photo-1525310072745-f49212b5ac6d?w=500&q=70&auto=format&fit=crop", price: 159 },
  { name: "פרחי כרמל", city: "חיפה", img: "https://images.unsplash.com/photo-1534531173927-aeb928d54385?w=500&q=70&auto=format&fit=crop", price: 220 },
  { name: "בית הפרח", city: "ירושלים", img: "https://images.unsplash.com/photo-1494972308805-463bc619d34e?w=500&q=70&auto=format&fit=crop", price: 275 },
];

const FEATURES = [
  { icon: MessageCircle, title: "הזמנות בוואטסאפ", body: "כל הזמנה נופלת ישירות לוואטסאפ העסקי שלך עם פרטי הלקוח, הזר והכתובת." },
  { icon: Boxes, title: "ניהול מלאי חכם", body: "עדכון מחירים ומלאי בקליק. מסונכרן בין הסניפים והמכשירים." },
  { icon: CreditCard, title: "Bit · אשראי · העברה", body: "תשלום ישיר ללקוח בלי עמלות סליקה מנופחות. כסף בעו״ש מיד." },
  { icon: Tag, title: "קופונים ומבצעים", body: "קוד הנחה, מחיר מבצע, באנדל זרים — כל מהלך שיווקי בשליטה מלאה." },
  { icon: Truck, title: "משלוחים לפי אזור", body: "מחיר משלוח דינמי, חלונות שעות, ושיוך לשליחים בלחיצה אחת." },
  { icon: Bot, title: "מוכר AI 24/7", body: "סוכן חכם שעונה ללקוחות, ממליץ על זרים ומסגור הזמנות גם בלילה." },
];

const TESTIMONIALS = [
  { name: "מורן לוי", store: "פרחי מורן · רעננה", quote: "תוך שלוש דקות מקליק על Google היתה לי חנות פעילה עם 32 זרים. הלקוחות מזמינים ישירות לוואטסאפ — סוף לבלגן ב-DM של אינסטגרם." },
  { name: "יוסי כהן", store: "משתלת הוורד · חולון", quote: "הקופונים והמבצעים הכפילו לי את ההזמנות בשישי. הAI עונה ללקוחות בערב במקומי." },
  { name: "תמר אברהם", store: "Blossom · תל אביב", quote: "עיצוב יוקרתי שמרגיש כמו אתר של 80,000 שקל. שילמתי כלום וקיבלתי הכל." },
];

const FAQS = [
  { q: "כמה זמן לוקח להעלות חנות?", a: "שתי לחיצות. מתחברים עם Google, בוחרים אם יש לכם אתר קיים (אנחנו סורקים ומעלים אוטומטית) או מתחילים מתבנית — והחנות עולה תוך פחות מ-30 שניות." },
  { q: "אני לא טכני בכלל. אסתדר?", a: "בוודאי. הכל בעברית, מהמובייל, ובלי קוד. אם יש שאלה — צ׳אט תמיכה חי בעברית מהדאשבורד." },
  { q: "איך מקבלים תשלומים?", a: "Bit, אשראי, העברה בנקאית או מזומן במשלוח. הכסף נכנס ישירות לחשבון שלך — בלי עמלת ביניים." },
  { q: "אני יכול לעצב את החנות כמו שאני רוצה?", a: "כן. בוחרים פלטת צבעים, מעלים לוגו, משנים תמונות, עורכים מחירים — הכל מהדאשבורד בעברית בלי תלות בנו." },
  { q: "מה קורה אם אני רוצה לבטל?", a: "אפשר לעצור בכל רגע. אין התחייבות. החנות והנתונים נשארים שלך לייצוא." },
];

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
  const content = useLandingContent();

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
      // Open the real storefront — the merchant gets a standing site, not
      // a preview inside the popup. They can jump into /admin from there.
      window.location.replace(`/?store=${storeId}&onboarded=1&postOnboard=1`);
    } else {
      window.location.replace("/admin");
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground antialiased">
      {/* ---------- Sticky header ---------- */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/75 border-b border-border/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2 font-black text-lg tracking-tight">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground shadow-md">
              <Flower2 size={18} />
            </span>
            Blossom Boss
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#examples" className="hover:text-foreground transition">דוגמאות</a>
            <a href="#features" className="hover:text-foreground transition">יכולות</a>
            <a href="#pricing" className="hover:text-foreground transition">תוכניות</a>
            <a href="#faq" className="hover:text-foreground transition">שאלות</a>
          </nav>
          <div className="flex items-center gap-2">
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
            <button
              onClick={openDialog}
              className="hidden sm:inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-foreground text-background text-sm font-bold whitespace-nowrap hover:scale-[1.03] transition-transform shadow-lg"
            >
              פתח חנות עכשיו
              <ArrowLeft size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section id="top" className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background to-accent/10" />
        <div className="absolute -top-32 -right-32 -z-10 w-[34rem] h-[34rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-40 -left-32 -z-10 w-[34rem] h-[34rem] rounded-full bg-accent/20 blur-3xl" />

        <div className="container mx-auto px-4 pt-16 pb-24 md:pt-24 md:pb-32 grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-7 space-y-7 text-center md:text-right">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/5 border border-foreground/10 text-xs font-bold">
              <Sparkles size={13} className="text-primary" />
              {content.hero.badge}
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight">
              {content.hero.title1}
              <br />
              <span className="bg-gradient-to-l from-primary via-primary to-accent bg-clip-text text-transparent">
                {content.hero.title2}
              </span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto md:mx-0 leading-relaxed">
              {content.hero.lede}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <button
                onClick={openDialog}
                className="inline-flex items-center justify-center gap-2 h-14 px-7 rounded-2xl bg-primary text-primary-foreground font-black text-base shadow-xl shadow-primary/30 hover:scale-[1.02] transition-all"
              >
                {content.hero.ctaPrimary}
                <ArrowLeft size={18} />
              </button>
              <a
                href="#examples"
                className="inline-flex items-center justify-center gap-2 h-14 px-7 rounded-2xl border-2 border-foreground/15 font-bold text-base hover:bg-foreground/5 transition"
              >
                {content.hero.ctaSecondary}
              </a>
            </div>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-2 text-sm text-muted-foreground pt-2">
              <span className="flex items-center gap-1.5"><Check size={16} className="text-primary" /> הקמה ב-2 קליקים</span>
              <span className="flex items-center gap-1.5"><Check size={16} className="text-primary" /> ללא ידע טכני</span>
              <span className="flex items-center gap-1.5"><Check size={16} className="text-primary" /> Bit / אשראי</span>
            </div>
          </div>

          {/* Floating bouquet collage */}
          <div className="md:col-span-5 relative h-[420px] md:h-[520px]">
            <FloatingCard src={content.heroImages[0]} className="absolute top-0 right-4 w-44 h-56 md:w-56 md:h-72 rotate-[-6deg] animate-fade-in" delay={0} />
            <FloatingCard src={content.heroImages[1]} className="absolute top-16 left-0 w-40 h-52 md:w-48 md:h-64 rotate-[4deg]" delay={120} />
            <FloatingCard src={content.heroImages[2]} className="absolute bottom-4 right-16 w-44 h-56 md:w-56 md:h-72 rotate-[8deg]" delay={240} />
            <FloatingCard src={content.heroImages[3]} className="absolute bottom-20 left-6 w-36 h-44 md:w-44 md:h-56 rotate-[-10deg]" delay={360} />
            {/* Floating price chip */}
            <div className="absolute bottom-2 right-0 bg-background border border-border rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-fade-in" style={{ animationDelay: "500ms" }}>
              <div className="w-9 h-9 rounded-full bg-primary/15 grid place-items-center text-primary">
                <MessageCircle size={18} />
              </div>
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground">הזמנה חדשה</div>
                <div className="text-sm font-black">זר מיוחד · 249₪</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Live store examples (marquee) ---------- */}
      <section id="examples" className="py-20 border-y border-border/60 bg-foreground/[0.02] overflow-hidden">
        <div className="container mx-auto px-4 mb-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold mb-3">
            <Sparkles size={13} /> {content.examples.badge}
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight">{content.examples.title}</h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">{content.examples.lede}</p>
        </div>

        <div className="relative">
          <div className="flex gap-5 animate-marquee whitespace-nowrap" style={{ width: "max-content" }}>
            {[...content.examples.items, ...content.examples.items].map((s, i) => (
              <StoreCard key={`${s.name}-${i}`} {...s} onClick={openDialog} />
            ))}
          </div>
          {/* Fade edges */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
        </div>
      </section>

      {/* ---------- 2 clicks timeline ---------- */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 text-foreground text-xs font-bold mb-3">
              2 לחיצות · 30 שניות
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">2 קליקים לחנות פעילה</h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">בלי טפסים אינסופיים. בלי OTP. בלי אימייל אישור. רק הקלקה.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: "01", t: "התחבר עם Google", d: "לחיצה אחת. בלי לזכור סיסמה, בלי טפסים." },
              { n: "02", t: "בחר מסלול", d: "יש לך אתר? נסרוק אוטומטית. אין? נבחר ביחד פלטה." },
              { n: "03", t: "החנות עולה", d: "30 שניות לחנות אמיתית עם מוצרים, מחירים ועיצוב." },
            ].map((s, i) => (
              <div
                key={s.n}
                className="relative p-7 rounded-3xl border border-border bg-card hover:shadow-xl transition-all group animate-fade-in"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <div className="absolute -top-4 right-6 px-3 h-8 rounded-full bg-primary text-primary-foreground text-xs font-black grid place-items-center shadow-lg">
                  {s.n}
                </div>
                <div className="font-black text-xl mb-2">{s.t}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{s.d}</div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <button
              onClick={openDialog}
              className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-foreground text-background font-bold text-sm hover:scale-[1.03] transition shadow-lg"
            >
              פתח חנות עכשיו
              <ArrowLeft size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* ---------- Features bento ---------- */}
      <section id="features" className="py-24 bg-foreground/[0.02] border-y border-border/60">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">{content.features.title}</h2>
            <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">{content.features.lede}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {content.features.items.map((f, i) => {
              const Ico = ICON_MAP[f.icon] || Sparkles;
              return (
                <div
                  key={f.title + i}
                  className="p-6 rounded-3xl bg-card border border-border hover:border-primary/40 hover:-translate-y-1 transition-all"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-4">
                    <Ico size={22} />
                  </div>
                  <div className="font-black text-lg mb-1.5">{f.title}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">{f.body}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Product mockup showcase ---------- */}
      <section className="py-24">
        <div className="container mx-auto px-4 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-5 order-2 md:order-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
              <Flower2 size={13} /> חוויה מובייל-פירסט
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
              חנות שנראית כאילו<br />שילמת עליה הון.
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              עיצוב יוקרתי שמותאם מובייל, מהיר טעינה, נגיש ב-RTL מלא, ועובד מצוין מהוואטסאפ והאינסטגרם של החנות שלך.
            </p>
            <ul className="space-y-2.5 pt-2">
              {["גלריות מוצר עם זום", "סל קניות חכם", "חישוב משלוחים אוטומטי", "צ׳אט AI שמוכר במקומך"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-sm">
                  <Check size={18} className="text-primary" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="order-1 md:order-2 relative h-[520px]">
            {/* Desktop frame */}
            <div className="absolute top-0 left-0 w-[88%] h-[68%] rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
              <div className="h-7 bg-foreground/5 border-b border-border flex items-center gap-1.5 px-3">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
              </div>
              <img src={HERO_BOUQUETS[1]} alt="חנות פרחים לדוגמה — תצוגת דסקטופ" className="w-full h-full object-cover" loading="lazy" />
            </div>
            {/* Phone frame */}
            <div className="absolute bottom-0 right-0 w-[42%] h-[78%] rounded-[2rem] bg-foreground p-2 shadow-2xl">
              <div className="w-full h-full rounded-[1.6rem] overflow-hidden bg-card relative">
                <img src={HERO_BOUQUETS[2]} alt="חנות פרחים לדוגמה — תצוגת מובייל" className="w-full h-full object-cover" loading="lazy" />
                <div className="absolute bottom-3 left-3 right-3 p-3 rounded-xl bg-background/95 backdrop-blur">
                  <div className="text-[11px] text-muted-foreground">זר רומנטי</div>
                  <div className="flex items-center justify-between">
                    <div className="font-black">189₪</div>
                    <div className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-bold">הוספה לסל</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Testimonials ---------- */}
      <section className="py-24 bg-foreground/[0.02] border-y border-border/60">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">{content.testimonials.title}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {content.testimonials.items.map((t, i) => (
              <figure key={t.name + i} className="p-6 rounded-3xl bg-card border border-border">
                <div className="flex gap-0.5 text-primary mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={16} fill="currentColor" strokeWidth={0} />
                  ))}
                </div>
                <blockquote className="text-sm leading-relaxed mb-4">"{t.quote}"</blockquote>
                <figcaption>
                  <div className="font-black text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.store}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Pricing teaser ---------- */}
      <section id="pricing" className="py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">מחיר אחד. בלי הפתעות.</h2>
            <p className="text-muted-foreground mt-3">{plan.trial_days} יום ניסיון חינם, בלי כרטיס אשראי. ממשיכים רק אם זה עובד לכם.</p>
          </div>
          <div className="max-w-md mx-auto">
            <div className="relative p-7 rounded-3xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-2xl shadow-primary/30">
              <div className="absolute -top-3 right-6 px-3 h-7 rounded-full bg-foreground text-background text-[11px] font-black grid place-items-center">{plan.trial_days} יום חינם</div>
              <div className="text-xs font-bold opacity-80 tracking-wider mb-1">הכל כלול</div>
              <div className="flex items-end gap-1 mb-1">
                <div className="text-5xl font-black">₪{plan.monthly_price_ils}</div>
                <div className="text-sm opacity-80 mb-1.5">/חודש + מע״מ</div>
              </div>
              <div className="text-sm opacity-80 mb-5">חנות מלאה · מוכר AI · קופונים · ביטול בכל רגע</div>
              <ul className="space-y-2 text-sm mb-6">
                <li className="flex gap-2 items-center"><Check size={16} /> קישור אישי לחנות שלכם</li>
                <li className="flex gap-2 items-center"><Check size={16} /> הזמנות לוואטסאפ, Bit ואשראי</li>
                <li className="flex gap-2 items-center"><Check size={16} /> מוכר AI אוטומטי</li>
                <li className="flex gap-2 items-center"><Check size={16} /> קופונים · באנדלים · אנליטיקס</li>
              </ul>
              <button onClick={openDialog} className="w-full h-12 rounded-xl bg-foreground text-background font-bold hover:scale-[1.02] transition">
                מתחילים {plan.trial_days} יום חינם
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" className="py-24 bg-foreground/[0.02] border-y border-border/60">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight text-center mb-12">{content.faq.title}</h2>
          <Accordion type="single" collapsible className="w-full">
            {content.faq.items.map((f, i) => (
              <AccordionItem key={i} value={`q-${i}`} className="border-b border-border">
                <AccordionTrigger className="text-right text-base font-bold py-5 hover:no-underline">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed text-right">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary via-primary to-accent p-12 md:p-20 text-center text-primary-foreground shadow-2xl shadow-primary/30">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/15 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
            <h2 className="relative text-3xl md:text-5xl font-black tracking-tight leading-tight">
              {content.finalCta.title.split("\n").map((line, i, arr) => (
                <span key={i}>{line}{i < arr.length - 1 ? <br /> : null}</span>
              ))}
            </h2>
            <p className="relative mt-4 text-base md:text-lg opacity-90 max-w-xl mx-auto">
              {content.finalCta.lede}
            </p>
            <button
              onClick={openDialog}
              className="relative mt-8 inline-flex items-center gap-2 h-14 px-8 rounded-2xl bg-foreground text-background font-black text-base shadow-2xl hover:scale-[1.03] transition"
            >
              {content.finalCta.button}
              <ArrowLeft size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        <div className="container mx-auto px-4">
          © {new Date().getFullYear()} Blossom Boss · פלטפורמת חנויות פרחים לישראל
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
                    שתי לחיצות לחנות שלך
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
                  <li className="flex items-center gap-2"><Check size={16} className="text-primary flex-shrink-0" /> אפשר לבטל בכל רגע.</li>
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
                    <Sparkles size={12} /> איך נתחיל
                  </div>
                  <DialogTitle className="text-2xl md:text-3xl font-black leading-tight text-foreground">החנות שלך, ב‑60 שניות</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground pt-1">
                    הדבק את כתובת האתר שלך ונסרוק אותו — או התחל מחנות חדשה.
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

function FloatingCard({ src, className, delay = 0 }: { src: string; className?: string; delay?: number }) {
  return (
    <div
      className={`rounded-3xl overflow-hidden bg-card border border-border shadow-2xl animate-fade-in ${className ?? ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <img src={src} alt="זר פרחים לדוגמה" className="w-full h-full object-cover" loading="lazy" />
    </div>
  );
}

function StoreCard({ name, city, img, price, onClick }: { name: string; city: string; img: string; price: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`פתח חנות כמו ${name}`}
      className="text-right inline-block w-64 rounded-3xl overflow-hidden bg-card border border-border shadow-md hover:shadow-xl hover:-translate-y-0.5 transition cursor-pointer"
    >
      <div className="h-44 overflow-hidden">
        <img src={img} alt={`חנות הפרחים ${name} ב${city}`} className="w-full h-full object-cover" loading="lazy" />
      </div>
      <div className="p-4 text-right">
        <div className="font-black text-base">{name}</div>
        <div className="text-xs text-muted-foreground mb-3">{city}</div>
        <div className="flex items-center justify-between">
          <span
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-bold cursor-pointer"
          >
            <MessageCircle size={11} /> WhatsApp
          </span>
          <span className="text-sm font-black">החל מ-{price}₪</span>
        </div>
      </div>
    </button>
  );
}

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

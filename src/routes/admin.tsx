import { GOOGLE_AUTH_ENABLED } from "@/lib/auth-flags";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setSupabaseStoreHeader } from "@/lib/store-context";
import { useStore } from "@/lib/store-context";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { claimStoreOwnership } from "@/lib/store-claim.functions";
import { lovable } from "@/integrations/lovable";
import { ImageUpload } from "@/lib/image-upload";
import { MultiImageUpload } from "@/lib/multi-image-upload";
import { PopupCard, POSITION_CLASS, type Popup as PopupT } from "@/lib/popups";
import { PlatformPanel } from "@/components/PlatformPanel";
import { PLATFORM_TEMPLATE_STORE_ID } from "@/lib/platform-template";
import {
  LayoutDashboard, ClipboardList, Package, FolderTree, Plus as PlusIcon, Users,
  TrendingUp, Bell, Send, Settings as SettingsIcon, LogOut, ArrowUp, ArrowDown,
  Search, Calendar, ChevronLeft, Eye, Mail, Phone, MapPin, Trash2, Pencil, X, Check,
  Clock, Truck, FileText, Sun,
} from "lucide-react";
import { LegalEditor } from "@/components/LegalEditor";
import { ThemeColorEditor } from "@/components/ThemeColorEditor";
import { FeaturesPanel } from "@/components/FeaturesPanel";
import { StoreLinkCard } from "@/components/StoreLinkCard";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { QuotaUsagePanel } from "@/components/QuotaUsagePanel";
import { TodaySection } from "@/components/admin/TodaySection";
import { SuppliersSection } from "@/components/admin/SuppliersSection";
import {
  awaitSafeSession,
  clearOAuthStart,
  hasOpenOnboardingParam,
  hasRecentOAuthStart,
  markOAuthStart,
  publishedUrl,
  shouldUsePublishedOAuth,
} from "@/lib/oauth-flow";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Monitor, RefreshCw, Minimize2, Maximize2, Move, Image as ImageIcon } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "ניהול החנות" }] }),
  component: AdminGate,
});

type Section =
  | "today" | "reports" | "orders" | "products" | "categories" | "addons" | "suppliers"
  | "users" | "pricing" | "hero" | "popups" | "broadcasts" | "settings" | "delivery" | "design" | "plan" | "legal";

// Seven places only. Pages that belong together are tabs inside one place,
// so the menu stays short. Old links to ?section=dashboard land on "today".
type Area = { id: string; label: string; icon: typeof LayoutDashboard; tabs: { id: Section; label: string }[] };
const AREAS: Area[] = [
  { id: "today", label: "היום", icon: Sun, tabs: [{ id: "today", label: "היום" }] },
  { id: "orders", label: "הזמנות", icon: ClipboardList, tabs: [{ id: "orders", label: "הזמנות" }] },
  { id: "catalog", label: "מוצרים", icon: Package, tabs: [
    { id: "products", label: "מוצרים" }, { id: "categories", label: "קטגוריות" },
    { id: "addons", label: "תוספות" }, { id: "pricing", label: "מחירי עונה" },
  ] },
  { id: "suppliers", label: "ספקים", icon: Truck, tabs: [{ id: "suppliers", label: "ספקים" }] },
  { id: "marketing", label: "שיווק", icon: Send, tabs: [
    { id: "hero", label: "באנרים" }, { id: "popups", label: "חלונות מבצע" }, { id: "broadcasts", label: "הודעות" },
  ] },
  { id: "reports", label: "דוחות", icon: LayoutDashboard, tabs: [{ id: "reports", label: "דוחות" }] },
  { id: "settings", label: "הגדרות", icon: SettingsIcon, tabs: [
    { id: "settings", label: "פרטי העסק" }, { id: "delivery", label: "משלוחים ושעות" }, { id: "design", label: "עיצוב" },
    { id: "users", label: "צוות" }, { id: "plan", label: "מנוי" }, { id: "legal", label: "תקנון" },
  ] },
];
const ALL_SECTIONS = AREAS.flatMap((a) => a.tabs.map((t) => t.id));
const areaOf = (s: Section) => AREAS.find((a) => a.tabs.some((t) => t.id === s)) ?? AREAS[0];
const MOBILE_AREAS = ["today", "orders", "catalog", "suppliers"];
function normalizeSection(id: string | null | undefined): Section | null {
  if (!id) return null;
  if (id === "dashboard") return "today";
  return (ALL_SECTIONS as string[]).includes(id) ? (id as Section) : null;
}

type MyStore = { store_id: string; role: string; name: string; slug: string | null };

function AdminSkeleton() {
  return (
    <div dir="rtl" className="min-h-screen bg-muted/30 flex animate-pulse">
      <aside className="hidden md:flex flex-col w-64 bg-card border-l border-border p-4 gap-3">
        <div className="h-10 rounded-xl bg-muted" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg bg-muted/70" />
        ))}
      </aside>
      <div className="flex-1 p-6 space-y-4">
        <div className="h-14 rounded-2xl bg-card border border-border" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-card border border-border" />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-card border border-border" />
      </div>
    </div>
  );
}

function AdminLoginGate() {
  const [busy, setBusy] = useState(false);
  async function signIn() {
    if (busy) return;
    if (shouldUsePublishedOAuth()) {
      window.open(publishedUrl("/admin"), "_blank", "noopener");
      toast.info("פותח את האתר הפומבי בכרטיסייה חדשה להתחברות.");
      return;
    }
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/admin`;
      markOAuthStart("/admin");
      const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirectTo });
      if ((res as { error?: unknown })?.error) {
        toast.error("ההתחברות לא הצליחה. נסה שוב.");
        setBusy(false);
      }
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בהתחברות");
      setBusy(false);
    }
  }
  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-3xl p-8 shadow-sm space-y-5 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground shadow">
          <SettingsIcon size={26} />
        </div>
        <div>
          <h1 className="text-xl font-black">כניסה לניהול החנות</h1>
          <p className="text-sm text-muted-foreground mt-1">{GOOGLE_AUTH_ENABLED ? "התחבר עם Google כדי להיכנס לדאשבורד." : "התחבר עם אימייל וסיסמה כדי להיכנס לדאשבורד."}</p>
        </div>
        <button
          onClick={signIn}
          disabled={busy}
          className="w-full h-12 rounded-xl bg-foreground text-background font-bold hover:scale-[1.01] transition disabled:opacity-60"
        >
          {busy ? "מתחבר…" : GOOGLE_AUTH_ENABLED ? "התחבר עם Google" : "התחברות"}
        </button>
        <a
          href="/?openOnboarding=1"
          className="block text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          אין לי עדיין חנות — פתח חנות חדשה
        </a>
      </div>
    </div>
  );
}

function AdminGate() {
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [multiStores, setMultiStores] = useState<MyStore[] | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [justOnboardedStore, setJustOnboardedStore] = useState<{ id: string; slug: string | null; name: string | null } | null>(null);
  const [postOnboardChoice, setPostOnboardChoice] = useState<{ storeId: string } | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };

  useEffect(() => {
    (async () => {
      // If the URL asks for onboarding, never render the admin gate — send
      // the user back to the landing onboarding flow immediately.
      if (hasOpenOnboardingParam()) {
        window.location.replace("/?openOnboarding=1");
        return;
      }
      // Post-OAuth grace period: wait for a real session (not just a user row)
      // to hydrate. `awaitSafeSession` already honors `hasRecentOAuthStart()`.
      const session = await awaitSafeSession(supabase, {
        maxMs: hasRecentOAuthStart() ? 10_000 : 2_500,
      });
      let user: { id: string; email?: string | null } | null = null;
      if (session) {
        const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } as any }));
        user = (data.user as any) ?? null;
      }
      if (!user) clearOAuthStart();
      setEmail(user?.email ?? null);
      if (user) {
        clearOAuthStart();
        const data = { user };
        // Onboarding hand-off: if we landed here from the URL-scan flow
        // (`?onboarded=1&store=<id>`) attach this Google account as the
        // store owner BEFORE we query memberships, otherwise the gate
        // below renders "אין הרשאת מנהל".
        try {
          const params = new URLSearchParams(window.location.search);
          const claimStore = params.get("store");
          if (params.get("onboarded") === "1" && claimStore) {
            await claimStoreOwnership({ data: { storeId: claimStore } });
            try {
              localStorage.setItem("tmm_store_override", claimStore);
              setSupabaseStoreHeader(claimStore);
            } catch {}
            // If onboarding wants to give the merchant the "view or edit"
            // choice right after the store is built, capture that here
            // BEFORE we strip the query params.
            if (params.get("postOnboard") === "1") {
              setPostOnboardChoice({ storeId: claimStore });
            }
            // Strip the one-shot params so a refresh doesn't re-claim,
            // but preserve `section` so AdminShell lands on the requested
            // pane (Products) on first paint.
            const section = params.get("section");
            const cleanUrl = section
              ? `${window.location.pathname}?section=${encodeURIComponent(section)}`
              : window.location.pathname;
            window.history.replaceState({}, "", cleanUrl);
          }
        } catch (err) {
          console.error("claimStoreOwnership failed", err);
        }
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
        const platformAdmin = !!roles?.some((r) => r.role === "admin");
        setIsPlatformAdmin(platformAdmin);
        const { data: memberships } = await supabase
          .from("store_members")
          .select("store_id, role")
          .eq("user_id", data.user.id);
        const ownsAStore = !!memberships && memberships.length > 0;
        setIsAdmin(platformAdmin || ownsAStore);
        if (platformAdmin) {
          // Platform admin: leave override untouched, use system/platform default
        } else if (ownsAStore) {
          const ids = memberships!.map((m) => m.store_id as string);
          const { data: stores } = await supabase
            .from("stores")
            .select("id,name,slug")
            .in("id", ids);
          const list: MyStore[] = memberships!.map((m) => {
            const s = stores?.find((x) => x.id === m.store_id);
            return { store_id: m.store_id as string, role: m.role as string, name: s?.name ?? "חנות", slug: s?.slug ?? null };
          });
          if (list.length === 1) {
            const only = list[0].store_id;
            try {
              const current = localStorage.getItem("tmm_store_override");
              if (current !== only) {
                localStorage.setItem("tmm_store_override", only);
                setSupabaseStoreHeader(only);
                qc.invalidateQueries();
              }
            } catch {}
            setSelectedStoreId(only);
          } else {
            // Multiple memberships: let the user pick explicitly
            const current = (() => { try { return localStorage.getItem("tmm_store_override"); } catch { return null; } })();
            if (current && list.some((s) => s.store_id === current)) {
              setSelectedStoreId(current);
            } else {
              setMultiStores(list);
            }
          }
        }
      }
      setLoading(false);
    })();
  }, [qc]);

  if (loading) return <AdminSkeleton />;
  if (!email) return <AdminLoginGate />;
  if (!isAdmin) return (
    <div dir="rtl" className="min-h-screen p-6 max-w-2xl mx-auto">
      <div className="bg-card rounded-3xl p-8 border border-border space-y-4">
        <h1 className="text-xl font-black">מחובר, יש להשלים את הקמת החנות</h1>
        <p className="text-sm text-muted-foreground">מחובר: {email}</p>
        <p className="text-sm text-muted-foreground">
          עוד לא יצרת חנות בחשבון הזה. המשך להקמה כדי לקבל גישת מנהל.
        </p>
        <div className="flex items-center gap-3">
          <a
            href="/?openOnboarding=1"
            className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-bold"
          >
            להמשך הקמת החנות
          </a>
          <button onClick={logout} className="text-sm text-muted-foreground hover:text-destructive hover:underline">
            התנתק
          </button>
        </div>
      </div>
    </div>
  );
  if (multiStores && !selectedStoreId) {
    return (
      <div dir="rtl" className="min-h-screen p-6 max-w-2xl mx-auto flex flex-col justify-center">
        <div className="bg-card rounded-3xl p-8 border border-border space-y-4">
          <h1 className="text-xl font-black">בחר חנות לניהול</h1>
          <p className="text-sm text-muted-foreground">מחובר: {email}</p>
          <div className="space-y-2">
            {multiStores.map((s) => (
              <button
                key={s.store_id}
                onClick={() => {
                  try { localStorage.setItem("tmm_store_override", s.store_id); } catch {}
                  setSupabaseStoreHeader(s.store_id);
                  qc.invalidateQueries();
                  setSelectedStoreId(s.store_id);
                }}
                className="w-full text-right bg-background hover:bg-accent border border-border rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <span className="font-bold">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.role}</span>
              </button>
            ))}
          </div>
          <button onClick={logout} className="text-sm text-destructive hover:underline">התנתק</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <AdminShell email={email} isPlatformAdmin={isPlatformAdmin} />
      {postOnboardChoice && (
        <PostOnboardChoice
          storeId={postOnboardChoice.storeId}
          onDismiss={() => setPostOnboardChoice(null)}
        />
      )}
    </>
  );
}

function PostOnboardChoice({
  storeId,
  onDismiss,
}: {
  storeId: string;
  onDismiss: () => void;
}) {
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative w-full max-w-md bg-card border-2 border-primary/30 shadow-2xl rounded-3xl p-7 sm:p-8 animate-in zoom-in-95">
        <button
          onClick={onDismiss}
          aria-label="סגור"
          className="absolute top-3 left-3 p-1.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted"
        >
          <X size={18} />
        </button>
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground grid place-items-center mb-4 shadow-md">
          <Check size={26} />
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-foreground mb-2">
          החנות שלך מוכנה! 🎉
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          לאן ממשיכים מכאן? אפשר להציץ באתר ולראות איך הוא נראה ללקוחות,
          או להישאר כאן ולערוך את המוצרים והעיצוב.
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button
            onClick={onDismiss}
            className="w-full sm:w-auto px-4 py-3 rounded-xl text-sm font-bold border border-border hover:bg-muted transition inline-flex items-center justify-center gap-2"
          >
            <Pencil size={14} /> ממשיכים לערוך
          </button>
          <button
            onClick={() => {
              window.location.replace(`/?store=${storeId}&postOnboardView=1`);
            }}
            className="flex-1 bg-primary text-primary-foreground font-bold py-3 rounded-xl hover:opacity-90 transition inline-flex items-center justify-center gap-2"
          >
            <Eye size={16} /> להציץ באתר שלי
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardedWelcomeModal({
  store,
  onClose,
}: {
  store: { id: string; slug: string | null; name: string | null };
  onClose: () => void;
}) {
  const storefrontHref = store.slug ? `/?store=${encodeURIComponent(store.slug)}` : `/?store=${store.id}`;
  return (
    <div dir="rtl" className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-3xl max-w-md w-full p-7 shadow-2xl">
        <div className="text-center space-y-2 mb-6">
          <div className="text-3xl">🎉</div>
          <h2 className="text-xl font-black">החנות שלך מוכנה!</h2>
          <p className="text-sm text-muted-foreground">
            {store.name ? `"${store.name}" נוצרה בהצלחה.` : "החנות נוצרה בהצלחה."} מה תרצה לעשות עכשיו?
          </p>
        </div>
        <div className="grid gap-3">
          <a
            href={storefrontHref}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-primary text-primary-foreground rounded-2xl px-5 py-4 font-bold text-center hover:opacity-90 transition flex items-center justify-center gap-2"
          >
            <Eye size={18} /> צפה בתוצאה
          </a>
          <button
            onClick={onClose}
            className="bg-background border border-border rounded-2xl px-5 py-4 font-bold hover:bg-muted transition flex items-center justify-center gap-2"
          >
            <Pencil size={18} /> המשך לערוך
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminShell({ email, isPlatformAdmin = false }: { email: string; isPlatformAdmin?: boolean }) {
  const [section, setSectionState] = useState<Section>(() => {
    if (typeof window === "undefined") return "today";
    try {
      return normalizeSection(new URL(window.location.href).searchParams.get("section")) ?? "today";
    } catch {}
    return "today";
  });
  const setSection = (id: Section) => {
    setSectionState(id);
    window.scrollTo({ top: 0 });
  };
  // Allow internal components (e.g. SetupWizard "open payments" CTA) to
  // navigate between admin sections without going through the URL.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = normalizeSection((e as CustomEvent<string>).detail);
      if (id) { setSectionState(id); window.scrollTo({ top: 0 }); }
    };
    window.addEventListener("tmm:admin-goto-section", handler);
    return () => window.removeEventListener("tmm:admin-goto-section", handler);
  }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [impersonatedId, setImpersonatedId] = useState<string | null>(() => {
    try { return localStorage.getItem("tmm_store_override"); } catch { return null; }
  });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const logout = async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); };

  // Re-assert the impersonation header any time it changes so every query
  // (products, categories, site_settings, …) is filtered by the active
  // store id — Super-Admin sees exactly what the store owner sees.
  useEffect(() => {
    setSupabaseStoreHeader(impersonatedId);
    qc.invalidateQueries();
  }, [impersonatedId, qc]);

  const area = areaOf(section);
  const { store: shellStore } = useStore();

  const navButton = (a: Area, compact = false) => {
    const I = a.icon;
    const active = area.id === a.id;
    return (
      <button key={a.id} onClick={() => { setSection(a.tabs[0].id); setMobileOpen(false); }}
        aria-current={active ? "page" : undefined}
        className={compact
          ? `flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${active ? "text-primary" : "text-muted-foreground"}`
          : `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition ${active ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted"}`}>
        <I size={compact ? 20 : 18} aria-hidden /> {a.label}
      </button>
    );
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background flex">
      {mobileOpen && (
        <button aria-label="סגור תפריט" onClick={() => setMobileOpen(false)} className="md:hidden fixed inset-0 bg-black/40 z-30" />
      )}
      <aside className={`fixed md:sticky top-0 right-0 h-screen w-64 bg-card border-l border-border z-40 flex flex-col transition-transform ${mobileOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}`}>
        <div className="px-5 py-5 flex items-center gap-3">
          <span className="text-2xl" aria-hidden>🌸</span>
          <div className="min-w-0 flex-1">
            <p className="font-black truncate">{shellStore?.name || "החנות שלי"}</p>
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          </div>
          <button onClick={() => setMobileOpen(false)} className="md:hidden text-muted-foreground p-1" aria-label="סגור"><X size={20}/></button>
        </div>
        <nav className="px-3 space-y-1 flex-1 overflow-y-auto" aria-label="ניווט ראשי">
          {AREAS.map((a) => navButton(a))}
        </nav>
        <div className="p-3 border-t border-border space-y-1">
          <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted">
            <Eye size={16} aria-hidden/> צפייה בחנות
          </a>
          <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted">
            <LogOut size={16} aria-hidden/> התנתקות
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {isPlatformAdmin && (
          <SuperAdminBar impersonatedId={impersonatedId} onImpersonate={(id) => setImpersonatedId(id)} />
        )}
        <header className="md:hidden sticky top-0 bg-card/95 backdrop-blur border-b border-border z-20 px-3 h-14 flex items-center justify-between">
          <p className="font-black">{area.label}</p>
          <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 rounded-lg hover:bg-muted" aria-label="פתח תפריט">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
          </button>
        </header>
        <div className="px-4 py-5 md:px-10 md:py-8 max-w-5xl mx-auto">
          {isPlatformAdmin && !impersonatedId ? (
            <PlatformPanel onImpersonate={(id) => setImpersonatedId(id)} />
          ) : (
            <>
              {area.tabs.length > 1 && (
                <div role="tablist" aria-label={area.label} className="flex gap-1 border-b border-border mb-6 overflow-x-auto no-scrollbar">
                  {area.tabs.map((t) => (
                    <button key={t.id} role="tab" aria-selected={section === t.id} onClick={() => setSection(t.id)}
                      className={`shrink-0 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition ${section === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              {section === "today" && <TodaySection/>}
              {section === "reports" && <DashboardSection/>}
              {section === "suppliers" && <SuppliersSection/>}
              {section === "orders" && <OrdersSection/>}
              {section === "products" && <ProductsSection/>}
              {section === "categories" && <CategoriesSection/>}
              {section === "addons" && <AddonsSection/>}
              {section === "users" && <UsersSection/>}
              {section === "pricing" && <PricingSection/>}
              {section === "hero" && <HeroSlidesSection/>}
              {section === "popups" && <PopupsSection/>}
              {section === "broadcasts" && <BroadcastsSection/>}
              {section === "settings" && <SettingsHome/>}
              {section === "delivery" && <SettingsSection part="delivery"/>}
              {section === "design" && <SettingsSection part="design"/>}
              {section === "plan" && <PlanHome/>}
              {section === "legal" && <LegalSection/>}
            </>
          )}
        </div>
      </main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-border flex pb-[env(safe-area-inset-bottom)]" aria-label="ניווט מהיר">
        {AREAS.filter((a) => MOBILE_AREAS.includes(a.id)).map((a) => navButton(a, true))}
        <button onClick={() => setMobileOpen(true)} className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold text-muted-foreground">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
          עוד
        </button>
      </nav>
    </div>
  );
}

/** Business details: the shop link first, then the details shoppers see. */
function SettingsHome() {
  return (
    <div className="space-y-6 max-w-3xl">
      <StoreLinkCard />
      <SettingsSection part="business"/>
    </div>
  );
}

function PlanHome() {
  const { store } = useStore();
  return (
    <div className="space-y-6 max-w-3xl">
      <FeaturesPanel />
      {store?.id && <QuotaUsagePanel storeId={store.id}/>}
    </div>
  );
}

/* ============ Super Admin Bar ============ */
type StoreLite = { id: string; name: string; slug: string; active: boolean; plan: string };

function SuperAdminBar({ impersonatedId, onImpersonate }: { impersonatedId: string | null; onImpersonate: (id: string | null) => void }) {
  const qc = useQueryClient();
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("stores").select("id,name,slug,active,plan").order("name");
      setStores((data as any[]) || []);
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return stores;
    return stores.filter((s) => s.name.toLowerCase().includes(t) || (s.slug || "").toLowerCase().includes(t));
  }, [q, stores]);

  const current = stores.find((s) => s.id === impersonatedId);

  function impersonate(id: string) {
    try { localStorage.setItem("tmm_store_override", id); } catch {}
    try {
      localStorage.removeItem("tmm_current_store");
      localStorage.removeItem("tmm_current_store_id");
    } catch {}
    setSupabaseStoreHeader(id);
    qc.invalidateQueries();
    onImpersonate(id);
    setOpen(false);
    toast.success("מתחזה לחנות: " + (stores.find((s) => s.id === id)?.name || ""));
    // Hard reload so StoreProvider, theme, and SSR-resolved data fully rebind to the new store.
    setTimeout(() => { try { window.location.assign("/admin?store=" + id); } catch {} }, 150);
  }

  function exitImpersonation() {
    try {
      localStorage.removeItem("tmm_store_override");
      localStorage.removeItem("tmm_current_store");
      localStorage.removeItem("tmm_current_store_id");
    } catch {}
    setSupabaseStoreHeader(null);
    qc.invalidateQueries();
    onImpersonate(null);
    toast.success("חזרה למצב מנהל פלטפורמה");
  }

  return (
    <div className="sticky top-0 z-30 bg-gradient-to-l from-indigo-900 via-slate-900 to-indigo-900 text-white border-b border-indigo-700 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest font-black bg-white/15 px-2 py-0.5 rounded-full">Super Admin</span>
          <span className="text-sm font-bold hidden sm:inline">מצב מנהל פלטפורמה</span>
        </div>

        <div ref={ref} className="relative flex-1 min-w-[220px] max-w-md">
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-full text-right bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl px-3 py-1.5 text-sm flex items-center justify-between transition"
          >
            <span className="truncate">{current ? `מתחזה: ${current.name}` : "בחר חנות לניהול…"}</span>
            <Search size={14} className="opacity-70"/>
          </button>
          {open && (
            <div className="absolute z-40 mt-2 w-full bg-card text-foreground rounded-xl border border-border shadow-2xl overflow-hidden">
              <div className="p-2 border-b border-border">
                <input
                  autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="חיפוש לפי שם או סלאג…"
                  className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="max-h-72 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">לא נמצאו חנויות</div>
                ) : filtered.map((s) => (
                  <button key={s.id} onClick={() => impersonate(s.id)}
                    className={`w-full text-right px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2 ${impersonatedId === s.id ? "bg-primary/10" : ""}`}>
                    <span className="font-bold truncate">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground">/{s.slug}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {impersonatedId && (
          <button
            onClick={exitImpersonation}
            className="text-xs font-bold bg-white text-slate-900 hover:bg-white/90 rounded-xl px-3 py-1.5 flex items-center gap-1.5 transition"
          >
            <X size={13}/> יציאה מהתחזות
          </button>
        )}

        <button
          onClick={() => impersonate(PLATFORM_TEMPLATE_STORE_ID)}
          title="עריכת תבנית המערכת — שינויים יחולו על חנויות חדשות בלבד"
          className="text-xs font-bold bg-amber-400 text-slate-900 hover:bg-amber-300 rounded-xl px-3 py-1.5 flex items-center gap-1.5 transition mr-auto"
        >
          ✨ ערוך תבנית מערכת
        </button>
      </div>
    </div>
  );
}

/* ============ Platform Stores Panel ============ */
function PlatformStoresPanel({ onImpersonate }: { onImpersonate: (id: string) => void }) {
  const qc = useQueryClient();
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StoreLite | null>(null);
  const [suspending, setSuspending] = useState<StoreLite | null>(null);
  const [confirmText, setConfirmText] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("stores").select("id,name,slug,active,plan").order("created_at", { ascending: false });
    setStores((data as any[]) || []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  function enter(id: string) {
    try { localStorage.setItem("tmm_store_override", id); } catch {}
    try {
      localStorage.removeItem("tmm_current_store");
      localStorage.removeItem("tmm_current_store_id");
    } catch {}
    setSupabaseStoreHeader(id);
    qc.invalidateQueries();
    onImpersonate(id);
    setTimeout(() => { try { window.location.assign("/admin?store=" + id); } catch {} }, 150);
  }

  async function suspendStore(s: StoreLite) {
    const { error } = await supabase.from("stores").update({ active: false }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("החנות הושעתה");
    setSuspending(null); setConfirmText("");
    void load();
  }

  return (
    <div>
      <SectionHeader title="ניהול פלטפורמה" subtitle="כל החנויות במערכת — עריכה, השעיה והתחזות"/>
      {loading ? (
        <div className="text-center text-muted-foreground py-12">טוען חנויות…</div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-right px-4 py-3">חנות</th>
                <th className="text-right px-4 py-3">סלאג</th>
                <th className="text-right px-4 py-3">תוכנית</th>
                <th className="text-right px-4 py-3">סטטוס</th>
                <th className="text-right px-4 py-3">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id} className="border-t border-border hover:bg-muted/20 transition">
                  <td className="px-4 py-3 font-bold">{s.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">/{s.slug}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] uppercase font-bold bg-muted px-2 py-0.5 rounded-full">{s.plan}</span>
                  </td>
                  <td className="px-4 py-3">
                    {s.active
                      ? <span className="text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">פעיל</span>
                      : <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">מושהה</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => enter(s.id)} className="text-xs font-bold rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition">
                        כניסה לחנות
                      </button>
                      <button onClick={() => setEditing(s)} className="text-xs font-bold rounded-lg px-3 py-1.5 border border-border hover:bg-muted flex items-center gap-1 transition">
                        <Pencil size={12}/> ערוך
                      </button>
                      {s.active && (
                        <button onClick={() => { setSuspending(s); setConfirmText(""); }} className="text-xs font-bold rounded-lg px-3 py-1.5 border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center gap-1 transition">
                          <Trash2 size={12}/> השעה
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PlatformStoreEditor store={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }}/>
      )}

      {suspending && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSuspending(null)}>
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-lg text-destructive">השעיית חנות</h3>
            <p className="text-sm text-muted-foreground">פעולה זו תשבית את הגישה הציבורית לחנות <b>{suspending.name}</b>. ניתן לבטל את ההשעיה בכל עת.</p>
            <p className="text-sm">להמשך, הקלד את שם החנות: <b className="font-mono">{suspending.name}</b></p>
            <input
              value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              placeholder={suspending.name}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSuspending(null)} className="px-4 py-2 rounded-xl border border-border hover:bg-muted text-sm">ביטול</button>
              <button
                disabled={confirmText !== suspending.name}
                onClick={() => suspendStore(suspending)}
                className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                השעה לצמיתות
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlatformStoreEditor({ store, onClose, onSaved }: { store: StoreLite; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(store.name);
  const [slug, setSlug] = useState(store.slug);
  const [plan, setPlan] = useState(store.plan || "free");
  const [active, setActive] = useState(store.active);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !slug.trim()) return toast.error("שם וסלאג חובה");
    setSaving(true);
    const { error } = await supabase.from("stores").update({ name, slug, plan, active }).eq("id", store.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("נשמר");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-black">עריכת חנות</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X size={16}/></button>
        </header>
        <div className="p-5 space-y-3">
          <label className="block text-sm">
            <span className="block mb-1 text-muted-foreground">שם החנות</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"/>
          </label>
          <label className="block text-sm">
            <span className="block mb-1 text-muted-foreground">סלאג</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"/>
          </label>
          <label className="block text-sm">
            <span className="block mb-1 text-muted-foreground">תוכנית</span>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}/>
            פעיל
          </label>
        </div>
        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border hover:bg-muted text-sm">ביטול</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center gap-1">
            <Check size={14}/> {saving ? "שומר..." : "שמירה"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ============ Live Preview ============ */
/* ============ Section Header ============ */
function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start sm:items-end justify-between mb-4 md:mb-6 gap-2 sm:gap-4 flex-wrap">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg sm:text-2xl md:text-3xl font-black text-foreground truncate">{title}</h1>
        {subtitle && <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
function StatCard({ label, value, hint, color = "primary" }: { label: string; value: string | number; hint?: string; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`text-2xl font-black mt-1 text-${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="text-center py-12 text-muted-foreground text-sm">{text}</div>;
}

/* ============ Dashboard ============ */
function DashboardSection() {
  const { store: activeStore } = useStore();
  const storeId = activeStore?.id ?? null;
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      const [{ data: o }, { data: p }] = await Promise.all([
        supabase.from("orders").select("*").eq("store_id", storeId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
        supabase.from("products").select("id,name").eq("store_id", storeId).limit(200),
      ]);
      setOrders(o || []); setProducts(p || []);
    })();
  }, [storeId]);

  const today = new Date(); today.setHours(0,0,0,0);
  const last7 = new Date(); last7.setDate(last7.getDate() - 7);
  const todayOrders = orders.filter((o) => new Date(o.created_at) >= today);
  const weekOrders = orders.filter((o) => new Date(o.created_at) >= last7);
  const isPaid = (o: any) => o.status !== "cancelled";
  const todayRev = todayOrders.filter(isPaid).reduce((s, o) => s + Number(o.total || 0), 0);
  const weekRev = weekOrders.filter(isPaid).reduce((s, o) => s + Number(o.total || 0), 0);
  const pending = orders.filter((o) => ["pending","confirmed","preparing","out_for_delivery"].includes(o.status));
  const cancelledToday = todayOrders.filter((o) => o.status === "cancelled").length;
  const cancelledWeek = weekOrders.filter((o) => o.status === "cancelled").length;
  const deliveredToday = todayOrders.filter((o) => o.status === "delivered").length;

  // Last 14 days bar chart
  const days = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i)); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const dayOrders = orders.filter((o) => { const t = new Date(o.created_at); return t >= d && t < next; });
    return { day: format(d, "dd/MM", { locale: he }), הזמנות: dayOrders.filter(isPaid).length, הכנסות: dayOrders.filter(isPaid).reduce((s,o)=>s+Number(o.total||0),0) };
  });

  // Day-of-week heat
  const dowNames = ["א'","ב'","ג'","ד'","ה'","ו'","ש'"];
  const byDow = dowNames.map((n, i) => ({ day: n, הזמנות: orders.filter((o) => new Date(o.created_at).getDay() === i).length }));
  const peakDow = [...byDow].sort((a,b)=>b.הזמנות - a.הזמנות)[0];

  // Hour
  const byHour = Array.from({ length: 24 }).map((_, h) => ({ שעה: `${h}:00`, הזמנות: orders.filter((o) => new Date(o.created_at).getHours() === h).length }));
  const peakHour = [...byHour].sort((a,b)=>b.הזמנות - a.הזמנות)[0];

  return (
    <>
      <SectionHeader title="דוחות ומכירות" subtitle="איך החנות מתפקדת לאורך זמן"/>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="הזמנות היום" value={todayOrders.length} hint={cancelledToday ? `${cancelledToday} בוטלו` : undefined}/>
        <StatCard label="הכנסות היום" value={`₪${todayRev.toLocaleString()}`} hint="לא כולל ביטולים"/>
        <StatCard label="נמסרו היום" value={deliveredToday}/>
        <StatCard label="הזמנות בשבוע" value={weekOrders.length} hint={`₪${weekRev.toLocaleString()}`}/>
        <StatCard label="ממתינות לטיפול" value={pending.length} color="destructive"/>
        <StatCard label="ביטולים (שבוע)" value={cancelledWeek} color={cancelledWeek > 0 ? "destructive" : undefined}/>
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-card rounded-2xl border border-border p-4">
          <h3 className="font-bold mb-3">הזמנות ב-14 הימים האחרונים</h3>
          <div className="h-56">
            <ResponsiveContainer><BarChart data={days}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/><XAxis dataKey="day" tick={{ fontSize: 11 }}/><YAxis tick={{ fontSize: 11 }}/><Tooltip/><Bar dataKey="הזמנות" fill="hsl(var(--primary))" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>
          </div>
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <h3 className="font-bold mb-3">הכנסות יומיות</h3>
          <div className="h-56">
            <ResponsiveContainer><LineChart data={days}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/><XAxis dataKey="day" tick={{ fontSize: 11 }}/><YAxis tick={{ fontSize: 11 }}/><Tooltip/><Line type="monotone" dataKey="הכנסות" stroke="hsl(var(--primary))" strokeWidth={2}/></LineChart></ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-2xl border border-border p-4">
          <h3 className="font-bold mb-3">לפי יום בשבוע</h3>
          <div className="h-48">
            <ResponsiveContainer><BarChart data={byDow}><XAxis dataKey="day"/><YAxis/><Tooltip/><Bar dataKey="הזמנות" fill="hsl(var(--accent))" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>
          </div>
          {peakDow && <p className="text-xs text-muted-foreground mt-2">💡 היום הכי חזק: <b>יום {peakDow.day}</b> ({peakDow.הזמנות} הזמנות)</p>}
        </div>
        <div className="bg-card rounded-2xl border border-border p-4">
          <h3 className="font-bold mb-3">לפי שעה ביום</h3>
          <div className="h-48">
            <ResponsiveContainer><BarChart data={byHour}><XAxis dataKey="שעה" tick={{fontSize:9}} interval={2}/><YAxis/><Tooltip/><Bar dataKey="הזמנות" fill="hsl(var(--primary))" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>
          </div>
          {peakHour && <p className="text-xs text-muted-foreground mt-2">💡 השעה הכי חזקה: <b>{peakHour.שעה}</b> ({peakHour.הזמנות} הזמנות)</p>}
        </div>
      </div>
    </>
  );
}

/* ============ Orders ============ */
const STATUS_LABEL: Record<string, string> = {
  pending: "חדש", confirmed: "אושרה", preparing: "בהכנה", out_for_delivery: "בדרך", delivered: "נמסרה", cancelled: "בוטלה",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800", confirmed: "bg-blue-100 text-blue-800", preparing: "bg-purple-100 text-purple-800",
  out_for_delivery: "bg-indigo-100 text-indigo-800", delivered: "bg-emerald-100 text-emerald-800", cancelled: "bg-rose-100 text-rose-800",
};

function OrdersSection() {
  const [orders, setOrders] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const { store: activeStore } = useStore();
  const storeId = activeStore?.id ?? null;

  const load = async () => {
    if (!storeId) return;
    const { data } = await supabase.from("orders").select("*").eq("store_id", storeId).is("deleted_at", null).order("created_at", { ascending: false });
    setOrders(data || []);
  };
  useEffect(() => {
    if (!storeId) return;
    load();
    const ch = supabase.channel("admin-orders-" + storeId).on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [storeId]);

  const filtered = orders.filter((o) => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (from && o.created_at < from) return false;
    if (to && o.created_at > to + "T23:59:59") return false;
    if (search) {
      const s = search.toLowerCase();
      if (![o.order_number, o.customer_name, o.customer_phone].join(" ").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const today = new Date(); today.setHours(0,0,0,0);
  const todays = orders.filter((o) => new Date(o.created_at) >= today);
  const counts = {
    new: orders.filter((o) => o.status === "pending").length,
    inProgress: orders.filter((o) => ["confirmed","preparing","out_for_delivery"].includes(o.status)).length,
    delivered: todays.filter((o) => o.status === "delivered").length,
    revenue: todays.reduce((s,o) => s + Number(o.total||0), 0),
  };

  async function update(id: string, patch: any) {
    if (!storeId) return;
    const { error } = await supabase.from("orders").update(patch).eq("id", id).eq("store_id", storeId);
    if (error) toast.error(error.message); else toast.success("עודכן");
  }
  async function softDelete(id: string) {
    if (!confirm("להסיר את ההזמנה מהטבלה ומהסקירה?")) return;
    if (!storeId) return;
    const { error } = await supabase.from("orders").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("store_id", storeId);
    if (error) return toast.error(error.message);
    toast.success("הוסרה"); load();
  }

  return (
    <>
      <SectionHeader title="הזמנות" subtitle="ניהול וטיפול בכל ההזמנות"/>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="חדשות" value={counts.new} color="destructive"/>
        <StatCard label="בתהליך" value={counts.inProgress}/>
        <StatCard label="נמסרו היום" value={counts.delivered}/>
        <StatCard label="הכנסות היום" value={`₪${counts.revenue.toLocaleString()}`}/>
      </div>
      <div className="bg-card rounded-2xl border border-border p-4 mb-4 grid md:grid-cols-4 gap-2">
        <div className="md:col-span-2 relative">
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={16}/>
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="חיפוש שם / טלפון / מספר" className="w-full bg-background border border-input rounded-lg pr-9 pl-3 py-2 text-sm"/>
        </div>
        <select value={filterStatus} onChange={(e)=>setFilterStatus(e.target.value)} className="bg-background border border-input rounded-lg px-3 py-2 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="flex gap-2">
          <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="flex-1 bg-background border border-input rounded-lg px-2 py-2 text-xs"/>
          <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="flex-1 bg-background border border-input rounded-lg px-2 py-2 text-xs"/>
        </div>
      </div>
      {filtered.length === 0 ? <Empty text="אין הזמנות שתואמות לסינון"/> : (
        <div className="bg-card rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-right p-3 font-bold">מספר</th>
                <th className="text-right p-3 font-bold">לקוח</th>
                <th className="text-right p-3 font-bold">כתובת</th>
                <th className="text-right p-3 font-bold">סכום</th>
                <th className="text-right p-3 font-bold">סטטוס</th>
                <th className="text-right p-3 font-bold">תאריך</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3 font-bold">#{o.order_number}</td>
                  <td className="p-3"><div>{o.customer_name}</div><div className="text-xs text-muted-foreground">{o.customer_phone}</div></td>
                  <td className="p-3 text-xs max-w-44 truncate">{o.delivery_address}</td>
                  <td className="p-3 font-bold">₪{o.total}</td>
                  <td className="p-3">
                    <select value={o.status} onChange={(e)=>update(o.id, { status: e.target.value })} className={`text-xs rounded-full px-2 py-1 border-0 font-bold ${STATUS_COLOR[o.status]}`}>
                      {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{format(new Date(o.created_at), "dd/MM HH:mm")}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button onClick={()=>setSelected(o)} className="text-primary text-xs" title="פרטים"><Eye size={14}/></button>
                      <button onClick={()=>softDelete(o.id)} className="text-destructive text-xs" title="הסר מהטבלה"><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && <OrderDetail order={selected} onClose={()=>setSelected(null)} onUpdate={(patch: any)=>{ update(selected.id, patch); setSelected({...selected,...patch}); }}/>}
    </>
  );
}

function OrderDetail({ order, onClose, onUpdate }: any) {
  const [items, setItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data: it } = await supabase.from("order_items").select("*").eq("order_id", order.id);
      setItems(it || []);
      const { data: h } = await supabase.from("order_status_history").select("*").eq("order_id", order.id).order("created_at");
      setHistory(h || []);
    })();
  }, [order.id]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black">הזמנה #{order.order_number}</h2>
            <p className="text-xs text-muted-foreground">{format(new Date(order.created_at), "dd/MM/yyyy HH:mm")}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded-xl p-3"><p className="text-[11px] text-muted-foreground">לקוח</p><p className="font-bold">{order.customer_name}</p><p className="text-xs flex items-center gap-1 mt-1"><Phone size={11}/>{order.customer_phone}</p></div>
            <div className="bg-muted/50 rounded-xl p-3"><p className="text-[11px] text-muted-foreground">סכום</p><p className="font-black text-lg">₪{order.total}</p><p className="text-xs">משלוח: ₪{order.shipping}</p></div>
          </div>
          <div className="bg-muted/50 rounded-xl p-3"><p className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin size={11}/>כתובת</p><p className="text-sm">{order.delivery_address}</p>{order.delivery_notes && <p className="text-xs text-muted-foreground mt-1">📝 {order.delivery_notes}</p>}</div>
          <div>
            <p className="font-bold mb-2 text-sm">פריטים</p>
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="bg-muted/30 rounded-xl p-3 flex gap-3">
                  {it.product_image && <img src={it.product_image} className="w-12 h-12 rounded-lg object-cover"/>}
                  <div className="flex-1">
                    <p className="font-bold text-sm">{it.product_name} × {it.quantity}</p>
                    <p className="text-xs text-muted-foreground">₪{it.unit_price} ליחידה</p>
                    {it.card_text && <p className="text-xs italic text-muted-foreground mt-1">"{it.card_text}"</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="font-bold mb-2 text-sm">סטטוס</p>
            <div className="flex gap-2 flex-wrap">
              <select value={order.status} onChange={(e)=>onUpdate({ status: e.target.value })} className={`text-xs rounded-full px-3 py-1.5 font-bold ${STATUS_COLOR[order.status]}`}>
                {Object.entries(STATUS_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <p className="font-bold mb-2 text-sm">היסטוריית סטטוסים</p>
            <div className="space-y-1.5">
              {history.map((h)=>(
                <div key={h.id} className="flex items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${STATUS_COLOR[h.status]}`}>{STATUS_LABEL[h.status]}</span>
                  <span className="text-muted-foreground">{format(new Date(h.created_at), "dd/MM HH:mm")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ Products ============ */
function ProductThumb({ name, primary, gallery }: { name: string; primary?: string | null; gallery: string[] }) {
  const candidates = [primary, ...gallery].filter((u): u is string => !!u && u.trim() !== "");
  const [idx, setIdx] = useState(0);
  const letter = (name?.trim()[0] || "?").replace(/[<>&]/g, "");
  const fallback = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><rect width='80' height='80' fill='%23eee'/><text x='40' y='46' text-anchor='middle' font-family='system-ui' font-size='28' font-weight='800' fill='%23999'>${letter}</text></svg>`,
  )}`;
  const src = idx < candidates.length ? candidates[idx] : fallback;
  return (
    <img
      src={src}
      alt={name}
      className="w-20 h-20 rounded-xl object-cover bg-muted"
      onError={() => { if (idx < candidates.length) setIdx(idx + 1); }}
    />
  );
}

function ProductsSection() {
  const { store: activeStore } = useStore();
  const storeId = activeStore?.id || null;
  const [products, setProducts] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [galleryByProduct, setGalleryByProduct] = useState<Record<string, string[]>>({});

  const load = async () => {
    if (!storeId) { setProducts([]); setCats([]); return; }
    const [p, c] = await Promise.all([
      supabase.from("products").select("*").eq("store_id", storeId).order("display_order"),
      supabase.from("categories").select("*").eq("store_id", storeId).order("display_order"),
    ]);
    setProducts(p.data || []); setCats(c.data || []);
    const ids = (p.data || []).map((x: any) => x.id);
    if (ids.length) {
      const { data: imgs } = await supabase
        .from("product_images")
        .select("product_id,image_url,display_order")
        .in("product_id", ids)
        .order("display_order");
      const map: Record<string, string[]> = {};
      (imgs || []).forEach((r: any) => {
        (map[r.product_id] ||= []).push(r.image_url);
      });
      setGalleryByProduct(map);
    } else {
      setGalleryByProduct({});
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storeId]);

  async function save(p: any, gallery: string[], sizes: { id?: string; label: string; price: number; original_price: number | null }[], categoryIds: string[]) {
    if (!storeId) { toast.error("לא נבחרה חנות"); return; }
    const primaryCat = categoryIds[0] || null;
    const payload: any = { ...p, price: Number(p.price), stock: Number(p.stock), original_price: p.original_price ? Number(p.original_price) : null, display_order: Number(p.display_order || 0), category_id: primaryCat, store_id: storeId };
    delete payload.id_temp;
    delete (payload as any).gallery;
    delete (payload as any).category_ids;
    let productId = p.id;
    if (p.id) {
      const { error } = await supabase.from("products").update(payload).eq("id", p.id).eq("store_id", storeId);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      productId = data?.id;
    }
    if (productId) {
      // Defensive check: confirm the product really belongs to the active store
      // before touching its child rows. Prevents cross-store edits.
      const { data: owner } = await supabase.from("products").select("store_id").eq("id", productId).maybeSingle();
      if (!owner || owner.store_id !== storeId) {
        toast.error("שגיאת הקשר חנות — הפעולה בוטלה");
        return;
      }
      await supabase.from("product_images").delete().eq("product_id", productId);
      if (gallery.length) {
        await supabase.from("product_images").insert(
          gallery.map((url, i) => ({ product_id: productId, image_url: url, display_order: i }))
        );
      }
      await (supabase as any).from("product_sizes").delete().eq("product_id", productId);
      const cleanSizes = sizes.filter((s) => s.label.trim());
      if (cleanSizes.length) {
        await (supabase as any).from("product_sizes").insert(
          cleanSizes.map((s, i) => ({ product_id: productId, label: s.label.trim(), price: Number(s.price) || 0, original_price: s.original_price !== null && s.original_price !== undefined ? Number(s.original_price) : null, display_order: i }))
        );
      }
      await (supabase as any).from("product_categories").delete().eq("product_id", productId);
      if (categoryIds.length) {
        await (supabase as any).from("product_categories").insert(
          categoryIds.map((cid) => ({ product_id: productId, category_id: cid }))
        );
      }
    }
    toast.success("נשמר"); setEditing(null); load();
  }
  async function del(id: string) {
    if (!storeId) return;
    if (!confirm("למחוק את המוצר?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id).eq("store_id", storeId);
    if (error) return toast.error(error.message);
    load();
  }
  async function move(p: any, dir: -1 | 1) {
    if (!storeId) return;
    const sorted = [...products].sort((a,b)=>a.display_order - b.display_order);
    const idx = sorted.findIndex((x)=>x.id===p.id);
    const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    await supabase.from("products").update({ display_order: sorted[j].display_order }).eq("id", p.id).eq("store_id", storeId);
    await supabase.from("products").update({ display_order: sorted[idx].display_order }).eq("id", sorted[j].id).eq("store_id", storeId);
    load();
  }

  return (
    <>
      <SectionHeader title="מוצרים" subtitle={activeStore ? `חנות פעילה: ${activeStore.name}` : "טוען חנות…"} action={
        <button onClick={()=>setEditing({ name:"", description:"", price:0, stock:0, image_url:"", active:true, display_order: products.length })} className="bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm"><PlusIcon size={16}/><span className="hidden sm:inline">מוצר חדש</span></button>
      }/>
      {products.length === 0 ? <Empty text="עוד אין מוצרים. הוסף את הראשון!"/> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.sort((a,b)=>a.display_order-b.display_order).map((p, i, arr) => (
            <div key={p.id} className="bg-card border border-border rounded-2xl p-3 flex gap-3">
              <ProductThumb name={p.name} primary={p.image_url} gallery={galleryByProduct[p.id] || []} />
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">₪{p.price} · מלאי: {p.stock}</p>
                <p className="text-[10px] text-muted-foreground">{cats.find((c)=>c.id===p.category_id)?.name || "ללא קטגוריה"}</p>
                <div className="flex gap-1 mt-2">
                  <button onClick={()=>setEditing(p)} className="bg-muted hover:bg-muted/70 px-2 py-1 rounded-lg text-xs flex items-center gap-1"><Pencil size={10}/>ערוך</button>
                  <button onClick={()=>del(p.id)} className="text-destructive hover:bg-destructive/10 px-2 py-1 rounded-lg text-xs"><Trash2 size={10}/></button>
                  <button disabled={i===0} onClick={()=>move(p,-1)} className="bg-muted px-1.5 py-1 rounded-lg text-xs disabled:opacity-40"><ArrowUp size={10}/></button>
                  <button disabled={i===arr.length-1} onClick={()=>move(p,1)} className="bg-muted px-1.5 py-1 rounded-lg text-xs disabled:opacity-40"><ArrowDown size={10}/></button>
                  {!p.active && <span className="text-[10px] bg-muted text-muted-foreground px-2 py-1 rounded-full">מוסתר</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <ProductForm product={editing} cats={cats} onSave={save} onCancel={()=>setEditing(null)}/>}
    </>
  );
}

function ProductForm({ product, cats, onSave, onCancel }: any) {
  const [p, setP] = useState(product);
  const [gallery, setGallery] = useState<string[]>([]);
  const [sizes, setSizes] = useState<{ id?: string; label: string; price: number; original_price: number | null }[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>(product?.category_id ? [product.category_id] : []);
  useEffect(() => {
    if (!product?.id) { setGallery([]); return; }
    (async () => {
      const { data } = await supabase.from("product_images").select("image_url,display_order").eq("product_id", product.id).order("display_order");
      setGallery((data || []).map((r: any) => r.image_url as string));
      const { data: sz } = await (supabase as any).from("product_sizes").select("id,label,price,original_price,display_order").eq("product_id", product.id).order("display_order");
      setSizes(((sz || []) as any[]).map((r) => ({ id: r.id, label: r.label, price: Number(r.price), original_price: r.original_price !== null ? Number(r.original_price) : null })));
      const { data: pc } = await (supabase as any).from("product_categories").select("category_id").eq("product_id", product.id);
      const ids = ((pc || []) as any[]).map((r) => r.category_id as string);
      setCategoryIds(ids.length ? ids : (product.category_id ? [product.category_id] : []));
    })();
  }, [product?.id]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5" onClick={(e)=>e.stopPropagation()}>
        <h2 className="text-xl font-black mb-4">{p.id ? "עריכת מוצר" : "מוצר חדש"}</h2>
        <div className="space-y-3">
          <Field label="שם המוצר"><input value={p.name} onChange={(e)=>setP({...p, name: e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
          <Field label="תיאור"><textarea value={p.description||""} onChange={(e)=>setP({...p, description: e.target.value})} rows={2} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
          <ImageUpload value={p.image_url} onChange={(url)=>setP({...p, image_url: url})} label="תמונת המוצר" bucket="product-images"/>
          <MultiImageUpload values={gallery} onChange={setGallery} label="תמונות נוספות (גלריה - גלילה ולחיצה להגדלה)" bucket="product-images" max={12}/>
          <div className="grid grid-cols-3 gap-2">
            <Field label="מחיר ₪"><input type="number" value={p.price} onChange={(e)=>setP({...p, price: e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
            <Field label="מחיר מקורי"><input type="number" value={p.original_price||""} onChange={(e)=>setP({...p, original_price: e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
            <Field label="מלאי"><input type="number" value={p.stock} onChange={(e)=>setP({...p, stock: e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
          </div>
          <Field label="קטגוריות (אפשר לבחור כמה)">
            <div className="bg-background border border-input rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
              {cats.length === 0 && <p className="text-xs text-muted-foreground">אין קטגוריות עדיין</p>}
              {cats.map((c: any) => {
                const checked = categoryIds.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary/50 rounded px-1 py-0.5">
                    <input type="checkbox" checked={checked} onChange={(e) => {
                      if (e.target.checked) setCategoryIds([...categoryIds, c.id]);
                      else setCategoryIds(categoryIds.filter((x) => x !== c.id));
                    }}/>
                    <span>{c.name}</span>
                    {checked && categoryIds[0] === c.id && <span className="text-[10px] text-primary mr-auto">ראשית</span>}
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">הקטגוריה הראשונה משמשת כקטגוריה הראשית (תווית בכרטיס).</p>
          </Field>
          <Field label="תווית (badge - אופציונלי)"><input value={p.badge||""} onChange={(e)=>setP({...p, badge: e.target.value})} placeholder="חדש / מומלץ / מבצע" className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
          <Field label="הבלטה בעמוד הבית">
            <select value={p.highlight_size || 1} onChange={(e)=>setP({...p, highlight_size: Number(e.target.value)})} className="w-full bg-background border border-input rounded-lg px-3 py-2">
              <option value={1}>רגיל</option>
              <option value={2}>גדול / מובלט (תופס פי 2 רוחב)</option>
            </select>
          </Field>
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold">מחירון לפי גדלים (אופציונלי)</p>
              <button type="button" onClick={() => setSizes([...sizes, { label: "", price: 0, original_price: null }])} className="text-xs bg-muted hover:bg-muted/70 px-2 py-1 rounded-lg flex items-center gap-1"><PlusIcon size={11}/> הוסף גודל</button>
            </div>
            {sizes.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">אם אין גדלים, ישתמש במחיר הראשי למעלה</p>
            ) : (
              <div className="space-y-1.5">
                {sizes.map((s, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <input value={s.label} onChange={(e) => { const n=[...sizes]; n[i]={...n[i], label:e.target.value}; setSizes(n); }} placeholder="קטן / בינוני / גדול" className="flex-1 bg-background border border-input rounded-lg px-2 py-1.5 text-sm"/>
                    <input type="number" value={s.price} onChange={(e) => { const n=[...sizes]; n[i]={...n[i], price:Number(e.target.value)||0}; setSizes(n); }} placeholder="מחיר" className="w-20 bg-background border border-input rounded-lg px-2 py-1.5 text-sm"/>
                    <input type="number" value={s.original_price ?? ""} onChange={(e) => { const n=[...sizes]; n[i]={...n[i], original_price: e.target.value ? Number(e.target.value) : null}; setSizes(n); }} placeholder="מקורי" className="w-20 bg-background border border-input rounded-lg px-2 py-1.5 text-sm"/>
                    <button type="button" onClick={() => setSizes(sizes.filter((_, j) => j !== i))} className="text-destructive p-1.5"><Trash2 size={13}/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={p.active} onChange={(e)=>setP({...p, active: e.target.checked})}/> <span>מוצר פעיל בחנות</span></label>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={()=>onSave(p, gallery, sizes, categoryIds)} className="bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl flex-1">שמור</button>
          <button onClick={onCancel} className="text-muted-foreground px-4 py-2">ביטול</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><p className="text-sm font-medium mb-1">{label}</p>{children}</label>;
}

/* ============ Categories ============ */
function CategoriesSection() {
  const { store: activeStore } = useStore();
  const storeId = activeStore?.id ?? null;
  const [cats, setCats] = useState<any[]>([]);
  const [name, setName] = useState("");
  const load = async () => {
    if (!storeId) return;
    const { data } = await supabase.from("categories").select("*").eq("store_id", storeId).order("display_order");
    setCats(data || []);
  };
  useEffect(() => { load(); }, [storeId]);
  async function add() {
    if (!name.trim() || !storeId) return;
    await supabase.from("categories").insert({ name: name.trim(), display_order: cats.length, store_id: storeId });
    setName(""); load(); toast.success("נוספה");
  }
  async function rename(c: any) { if (!storeId) return; const n = prompt("שם חדש", c.name); if (n) { await supabase.from("categories").update({ name: n }).eq("id", c.id).eq("store_id", storeId); load(); } }
  async function del(id: string) { if (!storeId) return; if (!confirm("למחוק?")) return; await supabase.from("categories").delete().eq("id", id).eq("store_id", storeId); load(); }
  async function toggle(c: any) { if (!storeId) return; await supabase.from("categories").update({ active: !c.active }).eq("id", c.id).eq("store_id", storeId); load(); }
  async function move(c: any, dir: -1 | 1) {
    if (!storeId) return;
    const sorted = [...cats].sort((a,b)=>a.display_order - b.display_order);
    const idx = sorted.findIndex((x)=>x.id===c.id); const j = idx + dir;
    if (j < 0 || j >= sorted.length) return;
    await supabase.from("categories").update({ display_order: sorted[j].display_order }).eq("id", c.id).eq("store_id", storeId);
    await supabase.from("categories").update({ display_order: sorted[idx].display_order }).eq("id", sorted[j].id).eq("store_id", storeId);
    load();
  }
  async function updateStyle(c: any, patch: Record<string, any>) {
    if (!storeId) return;
    // Optimistic UI: update immediately so the color preview reacts.
    setCats((arr) => arr.map((x) => x.id === c.id ? { ...x, ...patch } : x));
    const { error } = await supabase
      .from("categories")
      .update(patch as any)
      .eq("id", c.id)
      .eq("store_id", storeId);
    if (error) {
      // Roll back the optimistic change and tell the user what happened —
      // typically RLS (editing a store you aren't a member of).
      toast.error(`לא ניתן לשמור צבע: ${error.message}`);
      setCats((arr) => arr.map((x) => x.id === c.id ? { ...x, ...Object.fromEntries(Object.keys(patch).map(k => [k, c[k]])) } : x));
    }
  }
  return (
    <>
      <SectionHeader title="קטגוריות" subtitle="קבע קטגוריות, סדר ורקע ויזואלי לכל אחת"/>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4 flex gap-2">
        <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="שם קטגוריה חדשה" className="flex-1 bg-background border border-input rounded-lg px-3 py-2"/>
        <button onClick={add} className="bg-primary text-primary-foreground font-bold px-5 py-2 rounded-xl">הוסף</button>
      </div>
      {cats.length === 0 ? <Empty text="אין קטגוריות עדיין"/> : (
        <div className="space-y-2">
          {cats.map((c, i, arr) => (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground w-6">{i+1}</span>
                <p className="flex-1 font-bold">{c.name}</p>
                {!c.active && <span className="text-[10px] bg-muted px-2 py-1 rounded-full">מוסתר</span>}
                <button disabled={i===0} onClick={()=>move(c,-1)} className="p-1.5 hover:bg-muted rounded-lg disabled:opacity-30"><ArrowUp size={14}/></button>
                <button disabled={i===arr.length-1} onClick={()=>move(c,1)} className="p-1.5 hover:bg-muted rounded-lg disabled:opacity-30"><ArrowDown size={14}/></button>
                <button onClick={()=>toggle(c)} className="text-xs px-2 py-1 hover:bg-muted rounded-lg">{c.active?"הסתר":"הצג"}</button>
                <button onClick={()=>rename(c)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil size={14}/></button>
                <button onClick={()=>del(c.id)} className="p-1.5 hover:bg-destructive/10 text-destructive rounded-lg"><Trash2 size={14}/></button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pr-8 text-xs">
                <span className="text-muted-foreground">רקע:</span>
                <label className="flex items-center gap-1">
                  <input type="color" value={c.bg_color || "#ffffff"} onChange={(e)=>updateStyle(c,{bg_color:e.target.value})} className="w-8 h-8 rounded cursor-pointer border border-border"/>
                  <span className="text-muted-foreground">ראשי</span>
                </label>
                <label className="flex items-center gap-1">
                  <input type="color" value={c.bg_color_to || "#ffffff"} onChange={(e)=>updateStyle(c,{bg_color_to:e.target.value})} className="w-8 h-8 rounded cursor-pointer border border-border"/>
                  <span className="text-muted-foreground">משני</span>
                </label>
                <select value={c.bg_effect || "none"} onChange={(e)=>updateStyle(c,{bg_effect:e.target.value})} className="bg-background border border-input rounded-lg px-2 py-1 text-xs">
                  <option value="none">ללא אפקט</option>
                  <option value="gradient">גרדיאנט</option>
                  <option value="halo">הילה</option>
                  <option value="both">גרדיאנט + הילה</option>
                </select>
                <button onClick={()=>updateStyle(c,{bg_color:"",bg_color_to:"",bg_effect:"none"})} className="text-muted-foreground hover:text-destructive">נקה</button>
                <div className="ml-auto w-16 h-8 rounded-lg border border-border" style={{
                  background: c.bg_effect === "gradient" || c.bg_effect === "both"
                    ? `linear-gradient(135deg, ${c.bg_color || "#fff"}, ${c.bg_color_to || c.bg_color || "#fff"})`
                    : (c.bg_color || "transparent")
                }}/>
              </div>
              <div className="pr-8">
                <ImageUpload value={c.bg_image_url} onChange={(url)=>updateStyle(c,{bg_image_url:url})} label="תמונת רקע לקטגוריה (אופציונלי)" bucket="site-assets"/>
              </div>
              <div className="pr-8 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <label className="block md:col-span-3">
                  <p className="text-muted-foreground mb-1">אופן תצוגה בדף הבית</p>
                  <select value={c.display_mode || "grid"} onChange={(e)=>updateStyle(c,{display_mode:e.target.value})} className="w-full bg-background border border-input rounded-lg px-2 py-1.5">
                    <option value="grid">רגיל למטה (חלק מהרשת)</option>
                    <option value="scroll">נגלל לצד (שורה אופקית)</option>
                  </select>
                </label>
                <label className="block">
                  <p className="text-muted-foreground mb-1">צורת רקע</p>
                  <select value={c.bg_shape || "fill"} onChange={(e)=>updateStyle(c,{bg_shape:e.target.value})} className="w-full bg-background border border-input rounded-lg px-2 py-1.5">
                    <option value="fill">מילוי מלא (ברירת מחדל)</option>
                    <option value="rounded">מלבן מעוגל</option>
                    <option value="square">ריבוע</option>
                    <option value="circle">עיגול</option>
                    <option value="pill">מלבן (גלולה)</option>
                  </select>
                </label>
                <label className="block">
                  <p className="text-muted-foreground mb-1">גודל ({c.bg_size ?? 60}%)</p>
                  <input type="range" min={10} max={100} step={5} value={c.bg_size ?? 60} onChange={(e)=>updateStyle(c,{bg_size:Number(e.target.value)})} className="w-full" disabled={(c.bg_shape||"fill")==="fill"}/>
                </label>
                <label className="block">
                  <p className="text-muted-foreground mb-1">מיקום</p>
                  <select value={c.bg_position || "center"} onChange={(e)=>updateStyle(c,{bg_position:e.target.value})} className="w-full bg-background border border-input rounded-lg px-2 py-1.5" disabled={(c.bg_shape||"fill")==="fill"}>
                    <option value="center">מרכז</option>
                    <option value="top">למעלה</option>
                    <option value="bottom">למטה</option>
                    <option value="left">שמאל</option>
                    <option value="right">ימין</option>
                    <option value="top-left">למעלה-שמאל</option>
                    <option value="top-right">למעלה-ימין</option>
                    <option value="bottom-left">למטה-שמאל</option>
                    <option value="bottom-right">למטה-ימין</option>
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ============ Add-ons ============ */
function AddonsSection() {
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const { store: activeStore } = useStore();
  const storeId = activeStore?.id ?? null;
  const load = async () => {
    if (!storeId) { setList([]); return; }
    const { data } = await supabase.from("add_ons").select("*").eq("store_id", storeId).order("display_order");
    setList(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storeId]);
  async function save(a: any) {
    if (!storeId) return toast.error("לא נבחרה חנות פעילה");
    const { id, ...rest } = a;
    const payload = { ...rest, price: Number(a.price), display_order: Number(a.display_order||0), store_id: storeId };
    setSupabaseStoreHeader(storeId);
    const { error } = id
      ? await supabase.from("add_ons").update(payload).eq("id", id).eq("store_id", storeId)
      : await supabase.from("add_ons").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("נשמר"); setEditing(null); load();
  }
  async function del(id: string) {
    if (!storeId) return;
    if (!confirm("למחוק?")) return;
    await supabase.from("add_ons").delete().eq("id", id).eq("store_id", storeId);
    load();
  }
  return (
    <>
      <SectionHeader title={`תוספות${activeStore?` · ${activeStore.name}`:""}`} subtitle="כרטיסי ברכה, שוקולד, בלונים..." action={<button onClick={()=>setEditing({name:"",price:0,image_url:"",active:true,display_order:list.length})} className="bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm"><PlusIcon size={16}/><span className="hidden sm:inline">תוספת חדשה</span></button>}/>
      {list.length === 0 ? <Empty text="אין תוספות"/> : (
        <div className="grid md:grid-cols-3 gap-3">
          {list.map((a) => (
            <div key={a.id} className="bg-card border border-border rounded-2xl p-3 flex gap-2">
              <img src={a.image_url||"https://via.placeholder.com/64"} className="w-16 h-16 rounded-lg object-cover bg-muted"/>
              <div className="flex-1">
                <p className="font-bold">{a.name}</p>
                <p className="text-xs text-muted-foreground">₪{a.price}</p>
                <div className="flex gap-1 mt-1">
                  <button onClick={()=>setEditing(a)} className="text-xs px-2 py-1 bg-muted rounded-lg">ערוך</button>
                  <button onClick={()=>del(a.id)} className="text-xs px-2 py-1 text-destructive">מחק</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={()=>setEditing(null)}>
          <div className="bg-card rounded-3xl max-w-md w-full p-5 space-y-3" onClick={(e)=>e.stopPropagation()}>
            <h2 className="text-xl font-black">{editing.id?"ערוך":"חדש"}</h2>
            <Field label="שם"><input value={editing.name} onChange={(e)=>setEditing({...editing, name:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
            <Field label="מחיר"><input type="number" value={editing.price} onChange={(e)=>setEditing({...editing, price:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
            <ImageUpload value={editing.image_url} onChange={(url)=>setEditing({...editing, image_url:url})} label="תמונה" bucket="product-images"/>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.active} onChange={(e)=>setEditing({...editing, active:e.target.checked})}/>פעיל</label>
            <div className="flex gap-2"><button onClick={()=>save(editing)} className="bg-primary text-primary-foreground font-bold px-5 py-2 rounded-xl flex-1">שמור</button><button onClick={()=>setEditing(null)} className="px-4">ביטול</button></div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============ Users (by email) ============ */
function UsersSection() {
  const { store: activeStore } = useStore();
  const storeId = activeStore?.id ?? null;
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"owner" | "staff">("staff");

  // Detect whether the current logged-in user is a platform super-admin.
  // Store owners only see the per-store team UI (store_members), while
  // platform admins keep the global user_roles management UI.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setIsPlatformAdmin(false); return; }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin");
      setIsPlatformAdmin(!!roles && roles.length > 0);
    })();
  }, []);

  const loadPlatformUsers = async () => {
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) toast.error(error.message); else setUsers(data || []);
  };
  const loadStoreMembers = async () => {
    if (!storeId) { setMembers([]); return; }
    const { data, error } = await supabase
      .from("store_members")
      .select("id,user_id,role,created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setMembers(data || []);
  };

  useEffect(() => {
    if (isPlatformAdmin === null) return;
    if (isPlatformAdmin) loadPlatformUsers();
    else loadStoreMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlatformAdmin, storeId]);

  async function assignPlatformAdmin() {
    if (!newEmail.trim()) return;
    const { data: uid, error } = await supabase.rpc("get_user_id_by_email", { _email: newEmail.trim() });
    if (error) return toast.error(error.message);
    if (!uid) return toast.error("המשתמש לא נמצא. בקש ממנו להירשם תחילה דרך מסך הכניסה.");
    const { error: e2 } = await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
    if (e2) return toast.error(e2.message);
    toast.success("התפקיד הוקצה"); setNewEmail(""); loadPlatformUsers();
  }

  async function addStoreMember() {
    if (!storeId) return toast.error("חנות לא נטענה");
    if (!newEmail.trim()) return;
    const { data: uid, error } = await supabase.rpc("get_user_id_by_email", { _email: newEmail.trim() });
    if (error) return toast.error(error.message);
    if (!uid) return toast.error("המשתמש לא נמצא. בקש ממנו להירשם תחילה דרך מסך הכניסה.");
    // Re-sync header defensively so RLS sees the active store on this INSERT.
    setSupabaseStoreHeader(storeId);
    const { error: e2 } = await supabase
      .from("store_members")
      .insert({ store_id: storeId, user_id: uid as string, role: newMemberRole });
    if (e2) return toast.error(e2.message);
    toast.success("נוסף לצוות החנות"); setNewEmail(""); loadStoreMembers();
  }

  async function removeRole(userId: string, role: string) {
    if (!confirm("להסיר תפקיד?")) return;
    await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as "admin" | "courier" | "customer");
    loadPlatformUsers();
  }
  async function removeMember(id: string) {
    if (!storeId) return;
    if (!confirm("להסיר מהצוות?")) return;
    setSupabaseStoreHeader(storeId);
    const { error } = await supabase.from("store_members").delete().eq("id", id).eq("store_id", storeId);
    if (error) return toast.error(error.message);
    loadStoreMembers();
  }

  if (isPlatformAdmin === null) return <Empty text="טוען…"/>;

  // ===== Store-owner view: per-store team via store_members =====
  if (!isPlatformAdmin) {
    return (
      <>
        <SectionHeader title="צוות החנות" subtitle="הוסיפו עובדים ומנהלים שיוכלו לערוך את החנות הזו"/>
        <div className="bg-card border border-border rounded-2xl p-4 mb-4 grid md:grid-cols-3 gap-2">
          <input value={newEmail} onChange={(e)=>setNewEmail(e.target.value)} placeholder="email@example.com" className="md:col-span-2 bg-background border border-input rounded-lg px-3 py-2"/>
          <div className="flex gap-2">
            <select value={newMemberRole} onChange={(e)=>setNewMemberRole(e.target.value as any)} className="flex-1 bg-background border border-input rounded-lg px-2 py-2 text-sm">
              <option value="staff">עובד</option>
              <option value="owner">מנהל חנות</option>
            </select>
            <button onClick={addStoreMember} className="bg-primary text-primary-foreground font-bold px-4 rounded-xl">הוסף</button>
          </div>
        </div>
        {members.length === 0 ? <Empty text="אין חברי צוות עדיין"/> : (
          <div className="bg-card rounded-2xl border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs"><tr><th className="text-right p-3">משתמש</th><th className="text-right p-3">תפקיד</th><th className="text-right p-3">נוסף</th><th className="text-right p-3"></th></tr></thead>
              <tbody>
                {members.map((m)=>(
                  <tr key={m.id} className="border-t border-border">
                    <td className="p-3 font-mono text-xs">{m.user_id}</td>
                    <td className="p-3"><span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">{m.role === "owner" ? "מנהל" : "עובד"}</span></td>
                    <td className="p-3 text-xs text-muted-foreground">{format(new Date(m.created_at), "dd/MM/yyyy")}</td>
                    <td className="p-3 text-left"><button onClick={()=>removeMember(m.id)} className="text-xs text-destructive">הסר</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  // ===== Platform-admin view: global user_roles management =====
  const filtered = users.filter((u) => !search || u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <SectionHeader title="משתמשים והרשאות" subtitle="הקצה תפקיד מנהל לפי כתובת מייל"/>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4 grid md:grid-cols-3 gap-2">
        <input value={newEmail} onChange={(e)=>setNewEmail(e.target.value)} placeholder="email@example.com" className="md:col-span-2 bg-background border border-input rounded-lg px-3 py-2"/>
        <div className="flex gap-2">
          <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground flex items-center">תפקיד: מנהל</div>
          <button onClick={assignPlatformAdmin} className="bg-primary text-primary-foreground font-bold px-4 rounded-xl">הוסף</button>
        </div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-3 mb-2">
        <div className="relative">
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={16}/>
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="חיפוש לפי מייל" className="w-full bg-background border border-input rounded-lg pr-9 pl-3 py-2 text-sm"/>
        </div>
      </div>
      {filtered.length === 0 ? <Empty text="אין משתמשים"/> : (
        <div className="bg-card rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs"><tr><th className="text-right p-3">מייל</th><th className="text-right p-3">הצטרף</th><th className="text-right p-3">תפקידים</th></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.user_id} className="border-t border-border">
                  <td className="p-3 font-medium flex items-center gap-2"><Mail size={12}/>{u.email}</td>
                  <td className="p-3 text-xs text-muted-foreground">{format(new Date(u.created_at), "dd/MM/yyyy")}</td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      {u.roles.length === 0 && <span className="text-xs text-muted-foreground">לקוח</span>}
                      {u.roles.map((r: string) => (
                        <span key={r} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full flex items-center gap-1">
                          {r === "admin" ? "מנהל" : r}
                          <button onClick={()=>removeRole(u.user_id, r)}><X size={10}/></button>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ============ Couriers ============ */
/* ============ Pricing rules ============ */
const DOW = ["א'","ב'","ג'","ד'","ה'","ו'","שבת"];
function PricingSection() {
  const { store: activeStore } = useStore();
  const storeId = activeStore?.id ?? null;
  const [rules, setRules] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const load = async () => {
    if (!storeId) return;
    const [{ data: r }, { data: c }, { data: p }] = await Promise.all([
      supabase.from("pricing_rules").select("*").eq("store_id", storeId).order("priority"),
      supabase.from("categories").select("id,name").eq("store_id", storeId),
      supabase.from("products").select("id,name").eq("store_id", storeId),
    ]);
    setRules(r||[]); setCats(c||[]); setProducts(p||[]);
  };
  useEffect(()=>{ load(); }, [storeId]);
  async function save(rule: any) {
    if (!storeId) return toast.error("חנות לא נטענה");
    const payload = { ...rule, store_id: storeId, adjustment_value: Number(rule.adjustment_value), priority: Number(rule.priority||0), weekdays: rule.weekdays?.length ? rule.weekdays : null, scope_id: rule.scope === "all" ? null : rule.scope_id, starts_at: rule.starts_at || null, ends_at: rule.ends_at || null };
    const { error } = rule.id ? await supabase.from("pricing_rules").update(payload).eq("id", rule.id).eq("store_id", storeId) : await supabase.from("pricing_rules").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("נשמר"); setEditing(null); load();
  }
  async function del(id: string) { if (!storeId) return; if (!confirm("למחוק חוק?")) return; await supabase.from("pricing_rules").delete().eq("id", id).eq("store_id", storeId); load(); }
  async function toggle(r: any) { if (!storeId) return; await supabase.from("pricing_rules").update({ active: !r.active }).eq("id", r.id).eq("store_id", storeId); load(); }
  function describe(r: any) {
    const sign = r.adjustment_value >= 0 ? "+" : "";
    const adj = r.adjustment_type === "percent" ? `${sign}${r.adjustment_value}%` : `${sign}₪${r.adjustment_value}`;
    const scope = r.scope === "all" ? "כל החנות" : r.scope === "category" ? `קטגוריה: ${cats.find((c)=>c.id===r.scope_id)?.name||"?"}` : `מוצר: ${products.find((p)=>p.id===r.scope_id)?.name||"?"}`;
    const days = r.weekdays?.length ? `בימים ${r.weekdays.map((d:number)=>DOW[d]).join(",")}` : "כל יום";
    const dates = r.starts_at || r.ends_at ? ` ${r.starts_at||""}↔${r.ends_at||""}` : "";
    return `${adj} על ${scope} ${days}${dates}`;
  }
  return (
    <>
      <SectionHeader title="תמחור דינמי" subtitle="העלה/הוריד מחירים אוטומטית לפי יום/תאריך/מוצר" action={
        <button onClick={()=>setEditing({ name:"", adjustment_type:"percent", adjustment_value:10, scope:"all", scope_id:null, weekdays:[], starts_at:"", ends_at:"", active:true, priority:0 })} className="bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm"><PlusIcon size={16}/><span className="hidden sm:inline">חוק חדש</span></button>
      }/>
      {rules.length === 0 ? <Empty text="אין חוקי תמחור. דוגמה: '+10% בשישי-שבת'"/> : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-bold">{r.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{describe(r)}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={()=>toggle(r)} className={`text-xs px-3 py-1 rounded-lg ${r.active?"bg-emerald-100 text-emerald-700":"bg-muted text-muted-foreground"}`}>{r.active?"פעיל":"כבוי"}</button>
                <button onClick={()=>setEditing(r)} className="p-2 hover:bg-muted rounded-lg"><Pencil size={14}/></button>
                <button onClick={()=>del(r.id)} className="p-2 hover:bg-destructive/10 text-destructive rounded-lg"><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={()=>setEditing(null)}>
          <div className="bg-card rounded-3xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto space-y-3" onClick={(e)=>e.stopPropagation()}>
            <h2 className="text-xl font-black">{editing.id?"ערוך חוק":"חוק חדש"}</h2>
            <Field label="שם תיאורי"><input value={editing.name} onChange={(e)=>setEditing({...editing, name:e.target.value})} placeholder="למשל: תוספת סופ״ש" className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="סוג שינוי"><select value={editing.adjustment_type} onChange={(e)=>setEditing({...editing, adjustment_type:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"><option value="percent">אחוזים %</option><option value="amount">סכום קבוע ₪</option></select></Field>
              <Field label="ערך (חיובי=ייקור, שלילי=הנחה)"><input type="number" value={editing.adjustment_value} onChange={(e)=>setEditing({...editing, adjustment_value:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
            </div>
            <Field label="חל על"><select value={editing.scope} onChange={(e)=>setEditing({...editing, scope:e.target.value, scope_id:null})} className="w-full bg-background border border-input rounded-lg px-3 py-2"><option value="all">כל החנות</option><option value="category">קטגוריה ספציפית</option><option value="product">מוצר ספציפי</option></select></Field>
            {editing.scope === "category" && <Field label="בחר קטגוריה"><select value={editing.scope_id||""} onChange={(e)=>setEditing({...editing, scope_id:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"><option value="">— בחר —</option>{cats.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
            {editing.scope === "product" && <Field label="בחר מוצר"><select value={editing.scope_id||""} onChange={(e)=>setEditing({...editing, scope_id:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"><option value="">— בחר —</option>{products.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
            <Field label="ימים בשבוע (ריק = כל יום)">
              <div className="flex gap-1 flex-wrap">
                {DOW.map((d, i) => {
                  const on = editing.weekdays?.includes(i);
                  return <button key={i} type="button" onClick={()=>{ const w = on ? editing.weekdays.filter((x:number)=>x!==i) : [...(editing.weekdays||[]), i]; setEditing({...editing, weekdays: w}); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${on?"bg-primary text-primary-foreground":"bg-muted"}`}>{d}</button>;
                })}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="מתאריך"><input type="date" value={editing.starts_at||""} onChange={(e)=>setEditing({...editing, starts_at:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
              <Field label="עד תאריך"><input type="date" value={editing.ends_at||""} onChange={(e)=>setEditing({...editing, ends_at:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.active} onChange={(e)=>setEditing({...editing, active:e.target.checked})}/>פעיל</label>
            <div className="flex gap-2"><button onClick={()=>save(editing)} className="bg-primary text-primary-foreground font-bold px-5 py-2 rounded-xl flex-1">שמור</button><button onClick={()=>setEditing(null)} className="px-4">ביטול</button></div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============ Popups ============ */
function PopupsSection() {
  const { store: activeStore } = useStore();
  const storeId = activeStore?.id ?? null;
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const load = async () => {
    if (!storeId) return;
    const { data } = await supabase.from("site_popups").select("*").eq("store_id", storeId).order("display_order");
    setList(data || []);
    const { data: c } = await supabase.from("categories").select("id,name").eq("store_id", storeId).eq("active", true).order("display_order");
    setCats((c as any) || []);
  };
  useEffect(()=>{ load(); }, [storeId]);
  async function save(p: any) {
    if (!storeId) return toast.error("חנות לא נטענה");
    const payload = {
      ...p,
      store_id: storeId,
      auto_close_seconds: p.auto_close_seconds ? Number(p.auto_close_seconds) : null,
      rotate_seconds: p.rotate_seconds ? Number(p.rotate_seconds) : null,
      starts_at: p.starts_at || null,
      ends_at: p.ends_at || null,
      display_order: Number(p.display_order||0),
      overlay_opacity: Number(p.overlay_opacity ?? 0.5),
      trigger_category_ids: Array.isArray(p.trigger_category_ids) ? p.trigger_category_ids : [],
    };
    const { error } = p.id ? await supabase.from("site_popups").update(payload).eq("id", p.id).eq("store_id", storeId) : await supabase.from("site_popups").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("נשמר"); setEditing(null); load();
  }
  async function del(id: string) { if (!storeId) return; if (!confirm("למחוק?")) return; await supabase.from("site_popups").delete().eq("id", id).eq("store_id", storeId); load(); }
  async function toggle(p: any) { if (!storeId) return; await supabase.from("site_popups").update({ active: !p.active }).eq("id", p.id).eq("store_id", storeId); load(); }
  function newDraft() {
    return {
      title:"", body:"", image_url:"", bg_video_url:"",
      bg_color:"#ffffff", text_color:"#111111",
      cta_label:"", cta_url:"",
      auto_close_seconds:null, rotate_seconds:null,
      starts_at:"", ends_at:"", active:true, display_order:list.length,
      trigger_type:"immediate", trigger_value:"", trigger_category_ids:[],
      size:"md", shape:"rounded", position:"center", animation:"fade",
      overlay_opacity:0.5,
    };
  }
  return (
    <>
      <SectionHeader title="פופ-אפים והתראות" subtitle="הצג הודעות מעוצבות ללקוחות עם טריגרים מתקדמים" action={<button onClick={()=>setEditing(newDraft())} className="bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm"><PlusIcon size={16}/><span className="hidden sm:inline">פופ-אפ חדש</span></button>}/>
      {list.length === 0 ? <Empty text="אין פופ-אפים"/> : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border overflow-hidden" style={{ backgroundColor: p.bg_color, color: p.text_color }}>
              {p.image_url && <img src={p.image_url} className="w-full h-28 object-cover"/>}
              <div className="p-4">
                <p className="font-black">{p.title || "(ללא כותרת)"}</p>
                <p className="text-xs opacity-80 line-clamp-2">{p.body}</p>
                <p className="text-[11px] opacity-70 mt-1">טריגר: {triggerLabel(p)}</p>
                <div className="flex gap-1 mt-3">
                  <button onClick={()=>setEditing(p)} className="text-xs px-3 py-1 bg-black/10 rounded-lg">ערוך</button>
                  <button onClick={()=>toggle(p)} className="text-xs px-3 py-1 bg-black/10 rounded-lg">{p.active?"כבה":"הפעל"}</button>
                  <button onClick={()=>del(p.id)} className="text-xs px-3 py-1 bg-rose-500/20 rounded-lg">מחק</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <PopupEditor draft={editing} setDraft={setEditing} onSave={save} onCancel={()=>setEditing(null)} cats={cats}/>
      )}
    </>
  );
}

function triggerLabel(p: any) {
  const t = p.trigger_type || "immediate";
  if (t === "immediate") return "מיד";
  if (t === "delay") return `אחרי ${p.trigger_value||3} שניות`;
  if (t === "scroll") return `גלילה ${p.trigger_value||50}%`;
  if (t === "exit_intent") return "ניסיון יציאה";
  if (t === "click") return `לחיצה על ${p.trigger_value||"?"}`;
  if (t === "category") return `כניסה לקטגוריה (${(p.trigger_category_ids||[]).length})`;
  return t;
}

const TRIGGER_OPTIONS: { value: string; label: string; help?: string }[] = [
  { value: "immediate", label: "מיד עם כניסה" },
  { value: "delay", label: "אחרי X שניות", help: "הזן מספר שניות" },
  { value: "scroll", label: "אחרי גלילה של X%", help: "1-100" },
  { value: "exit_intent", label: "כשהמשתמש מנסה לצאת" },
  { value: "click", label: "לחיצה על אלמנט (CSS selector)", help: "לדוגמה: .buy-btn או #promo" },
  { value: "category", label: "כניסה לקטגוריה" },
];

function PopupEditor({ draft, setDraft, onSave, onCancel, cats }: {
  draft: any; setDraft: (p:any)=>void; onSave:(p:any)=>void; onCancel:()=>void;
  cats: { id: string; name: string }[];
}) {
  const [previewKey, setPreviewKey] = useState(0);
  const previewPopup: PopupT = {
    id: "preview",
    title: draft.title || "כותרת",
    body: draft.body || "תוכן ההודעה לתצוגה",
    image_url: draft.image_url || null,
    bg_video_url: draft.bg_video_url || null,
    bg_color: draft.bg_color || "#ffffff",
    text_color: draft.text_color || "#111111",
    cta_label: draft.cta_label || null,
    cta_url: draft.cta_url || null,
    auto_close_seconds: null,
    rotate_seconds: null,
    starts_at: null,
    ends_at: null,
    active: true,
    trigger_type: draft.trigger_type || "immediate",
    trigger_value: draft.trigger_value || "",
    trigger_category_ids: draft.trigger_category_ids || [],
    size: draft.size || "md",
    shape: draft.shape || "rounded",
    position: draft.position || "center",
    animation: draft.animation || "fade",
    overlay_opacity: Number(draft.overlay_opacity ?? 0.5),
    bg_opacity: Number(draft.bg_opacity ?? 1),
    layout: draft.layout || "image-top",
    text_align: draft.text_align || "center",
    content_padding: Number(draft.content_padding ?? 24),
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card rounded-3xl max-w-5xl w-full p-5 max-h-[92vh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black">{draft.id?"ערוך פופ-אפ":"פופ-אפ חדש"}</h2>
          <button onClick={onCancel} className="p-2 hover:bg-muted rounded-lg"><X size={18}/></button>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {/* LEFT: Form */}
          <div className="space-y-4">
            <div className="bg-muted/40 rounded-2xl p-3 space-y-3">
              <p className="text-xs font-bold text-muted-foreground">תוכן</p>
              <Field label="כותרת"><input value={draft.title} onChange={(e)=>setDraft({...draft, title:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
              <Field label="תוכן"><textarea value={draft.body} onChange={(e)=>setDraft({...draft, body:e.target.value})} rows={3} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
              <ImageUpload value={draft.image_url} onChange={(url)=>setDraft({...draft, image_url:url})} label="תמונה (אופציונלי)" bucket="site-assets"/>
              <ImageUpload value={draft.bg_video_url} onChange={(url)=>setDraft({...draft, bg_video_url:url})} label="וידאו רקע (אופציונלי)" bucket="site-assets" kind="video" accept="video/*"/>
              <div className="grid grid-cols-2 gap-2">
                <Field label="כפתור (טקסט)"><input value={draft.cta_label||""} onChange={(e)=>setDraft({...draft, cta_label:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
                <Field label="כפתור (קישור)"><input value={draft.cta_url||""} onChange={(e)=>setDraft({...draft, cta_url:e.target.value})} placeholder="/cart" className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
              </div>
            </div>

            <div className="bg-muted/40 rounded-2xl p-3 space-y-3">
              <p className="text-xs font-bold text-muted-foreground">עיצוב ותצוגה</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="צבע רקע"><input type="color" value={draft.bg_color} onChange={(e)=>setDraft({...draft, bg_color:e.target.value})} className="w-full h-10 bg-background border border-input rounded-lg"/></Field>
                <Field label="צבע טקסט"><input type="color" value={draft.text_color} onChange={(e)=>setDraft({...draft, text_color:e.target.value})} className="w-full h-10 bg-background border border-input rounded-lg"/></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="גודל"><select value={draft.size||"md"} onChange={(e)=>setDraft({...draft, size:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2">
                  <option value="sm">קטן</option><option value="md">בינוני</option><option value="lg">גדול</option><option value="xl">ענק</option><option value="full">רוחב מלא</option>
                </select></Field>
                <Field label="צורה"><select value={draft.shape||"rounded"} onChange={(e)=>setDraft({...draft, shape:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2">
                  <option value="rounded">מעוגל</option><option value="square">ריבועי</option><option value="pill">כדור-עיגול</option><option value="circle">עיגול מלא</option>
                </select></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="מיקום על המסך"><select value={draft.position||"center"} onChange={(e)=>setDraft({...draft, position:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2">
                  <option value="center">מרכז</option><option value="top">למעלה</option><option value="bottom">למטה</option><option value="corner">פינה</option>
                </select></Field>
                <Field label="אנימציית כניסה"><select value={draft.animation||"fade"} onChange={(e)=>setDraft({...draft, animation:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2">
                  <option value="fade">דעיכה</option><option value="zoom">זום</option><option value="slide-up">החלקה מלמטה</option><option value="slide-down">החלקה מלמעלה</option><option value="bounce">קפיצה</option>
                </select></Field>
              </div>
              <Field label={`שקיפות רקע: ${Math.round((draft.overlay_opacity ?? 0.5)*100)}%`}>
                <input type="range" min={0} max={1} step={0.05} value={draft.overlay_opacity ?? 0.5} onChange={(e)=>setDraft({...draft, overlay_opacity: Number(e.target.value)})} className="w-full"/>
              </Field>
              <Field label={`שקיפות הכרטיס: ${Math.round((draft.bg_opacity ?? 1)*100)}% (0% = רקע שקוף לחלוטין)`}>
                <input type="range" min={0} max={1} step={0.05} value={draft.bg_opacity ?? 1} onChange={(e)=>setDraft({...draft, bg_opacity: Number(e.target.value)})} className="w-full"/>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="פריסת תוכן">
                  <select value={draft.layout||"image-top"} onChange={(e)=>setDraft({...draft, layout:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2">
                    <option value="image-only">התמונה היא הפופ-אפ (ללא מסגרת/חיתוך)</option>
                    <option value="image-top">תמונה למעלה · טקסט למטה</option>
                    <option value="image-bottom">טקסט למעלה · תמונה למטה</option>
                    <option value="image-right">תמונה מימין · טקסט משמאל</option>
                    <option value="image-left">תמונה משמאל · טקסט מימין</option>
                    <option value="image-bg">תמונה כרקע מלא</option>
                    <option value="text-only">טקסט בלבד (ללא תמונה)</option>
                  </select>
                </Field>
                <Field label="יישור טקסט">
                  <select value={draft.text_align||"center"} onChange={(e)=>setDraft({...draft, text_align:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2">
                    <option value="right">לימין</option>
                    <option value="center">למרכז</option>
                    <option value="left">לשמאל</option>
                  </select>
                </Field>
              </div>
              <Field label={`ריווח פנימי: ${draft.content_padding ?? 24}px`}>
                <input type="range" min={0} max={64} step={2} value={draft.content_padding ?? 24} onChange={(e)=>setDraft({...draft, content_padding: Number(e.target.value)})} className="w-full"/>
              </Field>
            </div>

            <div className="bg-muted/40 rounded-2xl p-3 space-y-3">
              <p className="text-xs font-bold text-muted-foreground">מתי לקפוץ (טריגר)</p>
              <Field label="סוג טריגר">
                <select value={draft.trigger_type||"immediate"} onChange={(e)=>setDraft({...draft, trigger_type:e.target.value, trigger_value:""})} className="w-full bg-background border border-input rounded-lg px-3 py-2">
                  {TRIGGER_OPTIONS.map((o)=>(<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              </Field>
              {(draft.trigger_type === "delay" || draft.trigger_type === "scroll" || draft.trigger_type === "click") && (
                <Field label={TRIGGER_OPTIONS.find((o)=>o.value===draft.trigger_type)?.help || ""}>
                  <input
                    type={draft.trigger_type === "click" ? "text" : "number"}
                    value={draft.trigger_value||""}
                    onChange={(e)=>setDraft({...draft, trigger_value:e.target.value})}
                    placeholder={draft.trigger_type==="click"?".my-button":"3"}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2"
                  />
                </Field>
              )}
              {draft.trigger_type === "category" && (
                <div>
                  <p className="text-xs font-medium mb-1">בחר קטגוריות</p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {cats.map((c) => {
                      const sel = (draft.trigger_category_ids||[]).includes(c.id);
                      return (
                        <button key={c.id} type="button" onClick={()=>{
                          const cur: string[] = draft.trigger_category_ids||[];
                          setDraft({...draft, trigger_category_ids: sel ? cur.filter((x)=>x!==c.id) : [...cur, c.id]});
                        }} className={`px-3 py-1 rounded-full text-xs border ${sel?"bg-primary text-primary-foreground border-primary":"bg-background border-border"}`}>{c.name}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              <Field label="סגירה אוטומטית אחרי (שניות, ריק = ידני)"><input type="number" value={draft.auto_close_seconds||""} onChange={(e)=>setDraft({...draft, auto_close_seconds:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
              <Field label="זמן החלפה בין כרטיסים (שניות)"><input type="number" value={draft.rotate_seconds||""} onChange={(e)=>setDraft({...draft, rotate_seconds:e.target.value})} placeholder="6" className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="מתאריך"><input type="datetime-local" value={draft.starts_at?draft.starts_at.slice(0,16):""} onChange={(e)=>setDraft({...draft, starts_at:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs"/></Field>
                <Field label="עד תאריך"><input type="datetime-local" value={draft.ends_at?draft.ends_at.slice(0,16):""} onChange={(e)=>setDraft({...draft, ends_at:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs"/></Field>
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={draft.active} onChange={(e)=>setDraft({...draft, active:e.target.checked})}/>פעיל</label>
            </div>
          </div>

          {/* RIGHT: Live preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">תצוגה חיה כפי שזה יראה לגולש</p>
              <button onClick={()=>setPreviewKey((k)=>k+1)} className="text-xs px-3 py-1.5 bg-muted rounded-lg flex items-center gap-1"><RefreshCw size={12}/>הפעל אנימציה שוב</button>
            </div>
            <div
              dir="rtl"
              className={`relative rounded-2xl border border-border overflow-hidden h-[520px] flex p-4 ${POSITION_CLASS[previewPopup.position]}`}
              style={{
                backgroundImage: "linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%)",
                backgroundColor: "#1a1a2e",
              }}
            >
              <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${previewPopup.overlay_opacity})` }}/>
              <div className="relative z-10 w-full flex justify-center">
                <div key={previewKey} className="w-full flex justify-center">
                  <PopupCard popup={previewPopup} onClose={()=>setPreviewKey((k)=>k+1)} onCta={()=>setPreviewKey((k)=>k+1)}/>
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-xl p-3">
              <p className="font-bold mb-1">סיכום הגדרות:</p>
              <p>טריגר: {triggerLabel(draft)}</p>
              <p>גודל: {draft.size||"md"} · צורה: {draft.shape||"rounded"} · מיקום: {draft.position||"center"} · אנימציה: {draft.animation||"fade"}</p>
              {draft.auto_close_seconds && <p>⏱ ייסגר אחרי {draft.auto_close_seconds} שניות</p>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={()=>onSave(draft)} className="bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl flex-1">שמור</button>
          <button onClick={onCancel} className="px-4">ביטול</button>
        </div>
      </div>
    </div>
  );
}

/* ============ Broadcasts ============ */
function BroadcastsSection() {
  const [list, setList] = useState<any[]>([]);
  const [draft, setDraft] = useState<any>({ subject:"", body:"", channel:"email", audience:"customers" });
  const { store: activeStore } = useStore();
  const storeId = activeStore?.id ?? null;
  const load = async () => {
    if (!storeId) return;
    const { data } = await supabase.from("broadcasts").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
    setList(data || []);
  };
  useEffect(()=>{ load(); }, [storeId]);
  async function save() {
    if (!draft.subject || !draft.body) return toast.error("חסר נושא או תוכן");
    if (!storeId) return toast.error("חנות לא נטענה");
    const { error } = await supabase.from("broadcasts").insert({ ...draft, status: "draft", store_id: storeId });
    if (error) return toast.error(error.message);
    toast.success("נשמר כטיוטה. שליחה בפועל דורשת חיבור שירות מייל/SMS — נטפל בזה בשלב הבא.");
    setDraft({ subject:"", body:"", channel:"email", audience:"customers" }); load();
  }
  return (
    <>
      <SectionHeader title="הודעות לכולם" subtitle="כתוב הודעה ושלח ללקוחות במייל ו-SMS"/>
      <div className="bg-card border border-border rounded-2xl p-5 mb-4 space-y-3">
        <Field label="נושא"><input value={draft.subject} onChange={(e)=>setDraft({...draft, subject:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
        <Field label="תוכן ההודעה"><textarea value={draft.body} onChange={(e)=>setDraft({...draft, body:e.target.value})} rows={5} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ערוץ"><select value={draft.channel} onChange={(e)=>setDraft({...draft, channel:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"><option value="email">מייל</option><option value="sms">SMS</option><option value="both">שניהם</option></select></Field>
          <Field label="קהל יעד"><select value={draft.audience} onChange={(e)=>setDraft({...draft, audience:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"><option value="customers">לקוחות</option><option value="admins">מנהלים</option><option value="all">כולם</option></select></Field>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
          ℹ️ שליחה בפועל דורשת הגדרת דומיין מייל / חיבור Twilio ל-SMS. ההודעה תישמר עכשיו כטיוטה — נחבר את השירותים בסבב הבא.
        </div>
        <button onClick={save} className="bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl">שמור הודעה</button>
      </div>
      <h3 className="font-bold mb-2">היסטוריה</h3>
      {list.length === 0 ? <Empty text="עדיין אין הודעות"/> : (
        <div className="space-y-2">
          {list.map((b) => (
            <div key={b.id} className="bg-card border border-border rounded-2xl p-3">
              <div className="flex items-center justify-between">
                <p className="font-bold">{b.subject}</p>
                <span className="text-xs bg-muted px-2 py-1 rounded-full">{b.status==="draft"?"טיוטה":b.status==="sent"?"נשלחה":"נכשלה"}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{b.channel} · {b.audience} · {format(new Date(b.created_at), "dd/MM HH:mm")}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ============ Settings ============ */
const SETTING_FIELDS: { key: string; label: string; type: "text" | "number" | "tel" | "textarea"; placeholder?: string }[] = [
  { key: "store_name", label: "שם החנות", type: "text", placeholder: "שם החנות שלך" },
  { key: "store_tagline", label: "כותרת משנה", type: "text", placeholder: "כותרת משנה / סלוגן" },
  { key: "store_phone", label: "טלפון לעסק", type: "tel", placeholder: "050-0000000" },
  { key: "whatsapp_business", label: "וואטסאפ עסקי (לקבלת הזמנות)", type: "tel", placeholder: "972500000000" },
  { key: "store_address", label: "כתובת העסק", type: "text", placeholder: "כתובת העסק" },
  { key: "shipping_price", label: "מחיר משלוח (₪)", type: "number", placeholder: "25" },
];

type ShippingZone = { id: string; area: string; price: number; eta: string };
type DayHours = { open: string; close: string; closed: boolean };
const DAYS: { key: string; label: string }[] = [
  { key: "sun", label: "ראשון" },
  { key: "mon", label: "שני" },
  { key: "tue", label: "שלישי" },
  { key: "wed", label: "רביעי" },
  { key: "thu", label: "חמישי" },
  { key: "fri", label: "שישי" },
  { key: "sat", label: "שבת" },
];
const DEFAULT_HOURS: Record<string, DayHours> = Object.fromEntries(
  DAYS.map((d) => [d.key, { open: "09:00", close: "18:00", closed: d.key === "sat" }])
) as Record<string, DayHours>;

function SettingsSection({ part = "business" }: { part?: "business" | "delivery" | "design" }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [hours, setHours] = useState<Record<string, DayHours>>(DEFAULT_HOURS);
  const [savingZones, setSavingZones] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  // Single source of truth — StoreProvider already resolves the active store
  // for both store owners (by hostname/membership) and Super-Admin impersonation
  // (by tmm_store_override). Reading from there keeps SettingsSection perfectly
  // in sync with the rest of the app and removes the previous duplicate
  // resolution path that could desync from the live x-store-id header.
  const { store: currentStore } = useStore();
  const storeId = currentStore?.id ?? null;

  const load = async () => {
    if (!storeId) return;
    // NEVER sign the user out on a settings fetch failure — just surface
    // the issue. RLS may legitimately deny access while we resolve the
    // store id; an empty form is fine.
    const { data, error } = await supabase
      .from("site_settings")
      .select("key,value")
      .eq("store_id", storeId);
    if (error) {
      console.warn("[settings] load failed", error.message);
      toast.error("טעינת ההגדרות נכשלה — נשארת בעמוד");
      return;
    }
    const map: Record<string, string> = {};
    for (const r of data || []) {
      const v: any = (r as any).value;
      const k = (r as any).key;
      if (k === "shipping_zones" && Array.isArray(v)) {
        setZones(v as ShippingZone[]);
        continue;
      }
      if (k === "operating_hours" && v && typeof v === "object") {
        setHours({ ...DEFAULT_HOURS, ...(v as Record<string, DayHours>) });
        continue;
      }
      map[k] = typeof v === "string" ? v : v == null ? "" : String(v);
    }
    setValues(map);
  };
  useEffect(() => { load(); }, [storeId]);

  async function saveAll() {
    if (!storeId) return toast.error("לא ניתן לשמור — חנות לא נטענה");
    setSaving("all");
    const rows = SETTING_FIELDS.map((f) => {
      const raw = values[f.key] ?? "";
      const v: any = f.type === "number" ? (raw === "" ? 0 : Number(raw)) : raw;
      return { store_id: storeId, key: f.key, value: v };
    });
    const { error } = await supabase.from("site_settings").upsert(rows, { onConflict: "store_id,key" });
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success("נשמר");
  }

  async function saveZones() {
    if (!storeId) return toast.error("לא ניתן לשמור — חנות לא נטענה");
    setSavingZones(true);
    const clean = zones
      .filter((z) => z.area.trim())
      .map((z) => ({ ...z, price: Number(z.price) || 0, area: z.area.trim(), eta: z.eta.trim() }));
    const { error } = await supabase
      .from("site_settings")
      .upsert({ store_id: storeId, key: "shipping_zones", value: clean as any }, { onConflict: "store_id,key" });
    setSavingZones(false);
    if (error) return toast.error(error.message);
    toast.success("מחירון משלוחים נשמר");
  }

  async function saveHours() {
    if (!storeId) return toast.error("לא ניתן לשמור — חנות לא נטענה");
    setSavingHours(true);
    const { error } = await supabase
      .from("site_settings")
      .upsert({ store_id: storeId, key: "operating_hours", value: hours as any }, { onConflict: "store_id,key" });
    setSavingHours(false);
    if (error) return toast.error(error.message);
    toast.success("שעות פעילות נשמרו");
  }

  function addZone() {
    setZones([...zones, { id: crypto.randomUUID(), area: "", price: 25, eta: "" }]);
  }
  function updateZone(id: string, patch: Partial<ShippingZone>) {
    setZones(zones.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  }
  function removeZone(id: string) {
    setZones(zones.filter((z) => z.id !== id));
  }

  return (
    <>
      <div className="space-y-6 max-w-3xl">
        {part === "design" && (<>
        <StoreBrandingSection />
        <ThemeColorEditor />
        </>)}
        {/* General info */}
        {part === "business" && (
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <header className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary p-2 rounded-xl"><SettingsIcon size={18}/></div>
            <div>
              <h3 className="font-black text-base">פרטי העסק</h3>
              <p className="text-xs text-muted-foreground">מופיעים בעמוד הבית, בקופה ובוואטסאפ</p>
            </div>
          </header>
          {SETTING_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-sm font-bold mb-1.5 block">{f.label}</label>
              <div>
                {f.type === "textarea" ? (
                  <textarea
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    rows={3}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-sm"
                  />
                ) : (
                  <input
                    type={f.type}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2.5 text-sm"
                  />
                )}
              </div>
            </div>
          ))}
          <button onClick={saveAll} disabled={saving === "all"} className="h-11 px-6 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50">
            {saving === "all" ? "שומר…" : "שמירה"}
          </button>
        </section>
        )}
        {part === "delivery" && (<>

        {/* Shipping zones */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <header className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="bg-emerald-500/10 text-emerald-600 p-2 rounded-xl"><Truck size={18}/></div>
              <div>
                <h3 className="font-black text-base">מחירון משלוחים</h3>
                <p className="text-xs text-muted-foreground">קבעו מחיר וזמן הגעה לפי איזור / יישוב</p>
              </div>
            </div>
            <button onClick={addZone} className="bg-muted hover:bg-muted/70 font-bold px-3 py-2 rounded-lg text-sm flex items-center gap-1">
              <PlusIcon size={14}/> הוסף איזור
            </button>
          </header>

          {zones.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8 bg-muted/30 rounded-xl border border-dashed border-border">
              עדיין לא הוגדרו איזורי משלוח. לחצו על "הוסף איזור" כדי להתחיל.
            </div>
          ) : (
            <div className="space-y-2">
              {zones.map((z) => (
                <div key={z.id} className="grid grid-cols-[1fr_120px_1fr_auto] gap-2 items-center bg-background border border-border rounded-xl p-2">
                  <input
                    aria-label="איזור / יישוב"
                    value={z.area}
                    onChange={(e) => updateZone(z.id, { area: e.target.value })}
                    placeholder="לדוגמה: תל אביב"
                    className="bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary rounded-lg"
                  />
                  <div className="relative">
                    <input
                      aria-label="מחיר"
                      type="number"
                      value={z.price}
                      onChange={(e) => updateZone(z.id, { price: Number(e.target.value) })}
                      className="w-full bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary rounded-lg pr-7 text-end"
                    />
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₪</span>
                  </div>
                  <input
                    aria-label="זמן הגעה"
                    value={z.eta}
                    onChange={(e) => updateZone(z.id, { eta: e.target.value })}
                    placeholder="זמן הגעה (לדוגמה: עד 24 שעות)"
                    className="bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary rounded-lg"
                  />
                  <button
                    onClick={() => removeZone(z.id)}
                    aria-label="הסר איזור"
                    className="text-destructive hover:bg-destructive/10 p-2 rounded-lg"
                  >
                    <Trash2 size={16}/>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={saveZones} disabled={savingZones} className="bg-primary text-primary-foreground font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-1">
              <Check size={14}/> שמור מחירון
            </button>
          </div>
        </section>

        {/* Operating hours */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <header className="flex items-center gap-2">
            <div className="bg-amber-500/10 text-amber-600 p-2 rounded-xl"><Clock size={18}/></div>
            <div>
              <h3 className="font-black text-base">שעות פעילות</h3>
              <p className="text-xs text-muted-foreground">סמנו את הימים שבהם החנות סגורה (כברירת מחדל שבת סגורה)</p>
            </div>
          </header>

          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {DAYS.map((d) => {
              const h = hours[d.key] || { open: "09:00", close: "18:00", closed: false };
              return (
                <div key={d.key} className="grid grid-cols-[100px_1fr_auto_1fr] items-center gap-3 px-3 py-2.5 bg-background">
                  <span className="font-bold text-sm">{d.label}</span>
                  <input
                    type="time"
                    aria-label={`שעת פתיחה ${d.label}`}
                    value={h.open}
                    disabled={h.closed}
                    onChange={(e) => setHours({ ...hours, [d.key]: { ...h, open: e.target.value } })}
                    className="bg-muted/40 border border-input rounded-lg px-2 py-1.5 text-sm disabled:opacity-40"
                  />
                  <span className="text-muted-foreground text-xs">עד</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      aria-label={`שעת סגירה ${d.label}`}
                      value={h.close}
                      disabled={h.closed}
                      onChange={(e) => setHours({ ...hours, [d.key]: { ...h, close: e.target.value } })}
                      className="flex-1 bg-muted/40 border border-input rounded-lg px-2 py-1.5 text-sm disabled:opacity-40"
                    />
                    <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer select-none whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={h.closed}
                        onChange={(e) => setHours({ ...hours, [d.key]: { ...h, closed: e.target.checked } })}
                        className="accent-primary h-4 w-4"
                      />
                      סגור
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={saveHours} disabled={savingHours} className="bg-primary text-primary-foreground font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-1">
              <Check size={14}/> שמור שעות
            </button>
          </div>
        </section>
        </>)}
      </div>
    </>
  );
}

/* ============ Hero Slides ============ */
function HeroSlidesSection() {
  const { store: activeStore } = useStore();
  const storeId = activeStore?.id ?? null;
  const [list, setList] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const load = async () => {
    if (!storeId) return;
    const { data } = await (supabase as any).from("hero_slides").select("*").eq("store_id", storeId).order("display_order");
    setList(data || []);
  };
  useEffect(() => { load(); }, [storeId]);
  async function save(s: any) {
    if (!storeId) return toast.error("חנות לא נטענה");
    setSupabaseStoreHeader(storeId);
    const payload = {
      store_id: storeId,
      title: s.title || "", subtitle: s.subtitle || "",
      media_url: s.media_url || "", media_type: s.media_type || "image",
      bg_color: s.bg_color || "", text_color: s.text_color || "#ffffff",
      cta_label: s.cta_label || "", cta_url: s.cta_url || "",
      coupon_code: s.coupon_code || "",
      autoplay_seconds: Number(s.autoplay_seconds || 6),
      display_order: Number(s.display_order || 0),
      active: !!s.active,
      starts_at: s.starts_at || null, ends_at: s.ends_at || null,
    };
    const { error } = s.id ? await (supabase as any).from("hero_slides").update(payload).eq("id", s.id).eq("store_id", storeId) : await (supabase as any).from("hero_slides").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("נשמר"); setEditing(null); load();
  }
  async function del(id: string) { if (!storeId) return; if (!confirm("למחוק?")) return; await (supabase as any).from("hero_slides").delete().eq("id", id).eq("store_id", storeId); load(); }
  async function toggle(s: any) { if (!storeId) return; await (supabase as any).from("hero_slides").update({ active: !s.active }).eq("id", s.id).eq("store_id", storeId); load(); }
  return (
    <>
      <SectionHeader title="באנרים בעמוד הבית" subtitle="כרטיסי קרוסלה שמתחלפים בטיימינג, ניתן להוסיף תמונה/וידאו וקוד הנחה להעתקה" action={
        <button onClick={() => setEditing({ title:"", subtitle:"", media_url:"", media_type:"image", bg_color:"", text_color:"#ffffff", cta_label:"", cta_url:"", coupon_code:"", autoplay_seconds:6, display_order:list.length, active:true, starts_at:"", ends_at:"" })}
          className="bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm"><PlusIcon size={16}/><span className="hidden sm:inline">באנר חדש</span></button>
      }/>
      {list.length === 0 ? <Empty text="אין באנרים — לחצו 'באנר חדש'"/> : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.map((s) => (
            <div key={s.id} className="rounded-2xl border border-border overflow-hidden bg-card">
              <div className="relative h-28" style={{ background: s.bg_color || "var(--gradient-hero)" }}>
                {s.media_type === "video" && s.media_url ? <video src={s.media_url} muted loop autoPlay playsInline className="absolute inset-0 w-full h-full object-cover opacity-70"/> : s.media_url ? <img src={s.media_url} className="absolute inset-0 w-full h-full object-cover opacity-70"/> : null}
                <div className="relative p-3" style={{ color: s.text_color }}>
                  <p className="font-black">{s.title || "(ללא כותרת)"}</p>
                  <p className="text-xs opacity-80 line-clamp-1">{s.subtitle}</p>
                </div>
              </div>
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                  {s.coupon_code && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-mono">{s.coupon_code}</span>}
                  <span>⏱ {s.autoplay_seconds}s</span>
                  {!s.active && <span className="text-rose-500">כבוי</span>}
                </div>
                <div className="flex gap-1">
                  <button onClick={()=>setEditing(s)} className="text-xs px-3 py-1 bg-muted rounded-lg">ערוך</button>
                  <button onClick={()=>toggle(s)} className="text-xs px-3 py-1 bg-muted rounded-lg">{s.active?"כבה":"הפעל"}</button>
                  <button onClick={()=>del(s.id)} className="text-xs px-3 py-1 bg-rose-500/20 rounded-lg">מחק</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={()=>setEditing(null)}>
          <div className="bg-card rounded-3xl max-w-2xl w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
            <h2 className="text-xl font-black mb-4">{editing.id?"ערוך באנר":"באנר חדש"}</h2>
            <div className="space-y-3">
              <Field label="כותרת"><input value={editing.title} onChange={(e)=>setEditing({...editing, title:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
              <Field label="כותרת משנה"><input value={editing.subtitle} onChange={(e)=>setEditing({...editing, subtitle:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
              <Field label="סוג מדיה">
                <select value={editing.media_type} onChange={(e)=>setEditing({...editing, media_type:e.target.value, media_url:""})} className="w-full bg-background border border-input rounded-lg px-3 py-2">
                  <option value="image">תמונה</option>
                  <option value="video">וידאו</option>
                </select>
              </Field>
              {editing.media_type === "video"
                ? <ImageUpload value={editing.media_url} onChange={(url)=>setEditing({...editing, media_url:url})} label="קובץ וידאו" bucket="site-assets" kind="video" accept="video/*"/>
                : <ImageUpload value={editing.media_url} onChange={(url)=>setEditing({...editing, media_url:url})} label="תמונה" bucket="site-assets"/>}
              <div className="grid grid-cols-2 gap-2">
                <Field label="צבע רקע (אופציונלי)"><input type="color" value={editing.bg_color || "#ffffff"} onChange={(e)=>setEditing({...editing, bg_color:e.target.value})} className="w-full h-10 bg-background border border-input rounded-lg"/></Field>
                <Field label="צבע טקסט"><input type="color" value={editing.text_color} onChange={(e)=>setEditing({...editing, text_color:e.target.value})} className="w-full h-10 bg-background border border-input rounded-lg"/></Field>
              </div>
              <Field label="קוד קופון (יוצג ככפתור העתקה)"><input value={editing.coupon_code} onChange={(e)=>setEditing({...editing, coupon_code:e.target.value.toUpperCase()})} placeholder="LOVE20" className="w-full bg-background border border-input rounded-lg px-3 py-2 font-mono"/></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="כפתור (טקסט)"><input value={editing.cta_label} onChange={(e)=>setEditing({...editing, cta_label:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
                <Field label="כפתור (קישור)"><input value={editing.cta_url} onChange={(e)=>setEditing({...editing, cta_url:e.target.value})} placeholder="/?filter=sale" className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="זמן הצגה (שניות)"><input type="number" min={2} value={editing.autoplay_seconds} onChange={(e)=>setEditing({...editing, autoplay_seconds:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
                <Field label="סדר הצגה"><input type="number" value={editing.display_order} onChange={(e)=>setEditing({...editing, display_order:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2"/></Field>
                <label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={editing.active} onChange={(e)=>setEditing({...editing, active:e.target.checked})}/>פעיל</label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="מתאריך (אופציונלי)"><input type="datetime-local" value={editing.starts_at?String(editing.starts_at).slice(0,16):""} onChange={(e)=>setEditing({...editing, starts_at:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs"/></Field>
                <Field label="עד תאריך (אופציונלי)"><input type="datetime-local" value={editing.ends_at?String(editing.ends_at).slice(0,16):""} onChange={(e)=>setEditing({...editing, ends_at:e.target.value})} className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs"/></Field>
              </div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={()=>save(editing)} className="bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl flex-1">שמור</button><button onClick={()=>setEditing(null)} className="px-4">ביטול</button></div>
          </div>
        </div>
      )}
    </>
  );
}
/* ============ Legal Documents ============ */
function LegalSection() {
  return (
    <>
      <SectionHeader title="תקנון ופרטיות" subtitle="ערוך את התקנון ומדיניות הפרטיות שמופיעים באתר ובעת רכישה"/>
      <LegalEditor />
    </>
  );
}

/* ============ Store branding (logo + favicon upload) ============ */
function StoreBrandingSection() {
  const { store, refresh } = useStore();
  const [logo, setLogo] = useState(store?.logo_url ?? "");
  const [favicon, setFavicon] = useState(store?.favicon_url ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setLogo(store?.logo_url ?? "");
    setFavicon(store?.favicon_url ?? "");
  }, [store?.id, store?.logo_url, store?.favicon_url]);

  async function persist(patch: { logo_url?: string; favicon_url?: string }) {
    if (!store?.id) return toast.error("חנות לא נטענה");
    setSaving(true);
    const { error } = await supabase.from("stores").update(patch).eq("id", store.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("עוצב נשמר");
    refresh?.();
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <header className="flex items-center gap-2">
        <div className="bg-primary/10 text-primary p-2 rounded-xl"><ImageIcon size={18}/></div>
        <div>
          <h3 className="font-black text-base">לוגו ופאביקון</h3>
          <p className="text-xs text-muted-foreground">העלאה ישירה מהמחשב — מופיע בכותרת ובלשונית הדפדפן</p>
        </div>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <ImageUpload
            value={logo}
            onChange={(url) => { setLogo(url); persist({ logo_url: url }); }}
            label="לוגו החנות (PNG/SVG מומלץ)"
            bucket="store-assets"
          />
        </div>
        <div>
          <ImageUpload
            value={favicon}
            onChange={(url) => { setFavicon(url); persist({ favicon_url: url }); }}
            label="פאביקון (אייקון לשונית)"
            bucket="store-assets"
          />
        </div>
      </div>
      {saving && <p className="text-xs text-muted-foreground">שומר…</p>}
    </section>
  );
}

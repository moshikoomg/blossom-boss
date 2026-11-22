import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef, Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, Plus, SlidersHorizontal, X, MessageCircle, ZoomIn, Download, Settings } from "lucide-react";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";
import { flyToCart } from "@/lib/fly-to-cart";
import { validateCoupon } from "@/lib/coupons";
import { ProductDetail, ProductDetailPanel } from "@/components/ProductDetail";
import { CartPanel } from "@/components/CartPanel";
import { SalesChatBot } from "@/components/SalesChatBot";
import { PriceStrike } from "@/components/PriceStrike";
import { useIsMobile } from "@/hooks/use-mobile";
import { categoryBg, categoryHaloClass, categoryShapeStyle } from "@/lib/category-style";
import { Slider } from "@/components/ui/slider";
import { HeroCarousel } from "@/components/HeroCarousel";
import logoImg from "@/assets/logo.png";
import { useStore } from "@/lib/store-context";
import { SaasLanding } from "@/components/SaasLanding";
import { PreviewBanner } from "@/components/PreviewBanner";
import { PLATFORM_TEMPLATE_STORE_ID } from "@/lib/platform-template";
import { getPreviewDisplayName, getStorefrontUrlSignature, isLazyPreviewMode } from "@/lib/preview-mode";
import { awaitSafeSession, clearOAuthStart, isOAuthOnboardingReturn } from "@/lib/oauth-flow";
import {
  ONBOARDING_EVENT,
  WhatsAppFlyIn,
  isPwaEnabled,
  PWA_CHANGED_EVENT,
  SEQUENCE_DONE_FLAG,
  WA_FLY_EVENT,
} from "@/components/OnboardingSequencer";
import { celebrate } from "@/lib/celebrate";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      // NOTE: title / og: / canonical / JSON-LD are intentionally NOT set here.
      // Each store has its own brand, name and domain — those are written
      // imperatively at runtime by `ThemeLoader` / `StoreProvider` based on
      // the currently-resolved store. If we set a static <title> here,
      // TanStack's HeadContent reconciles it back on every navigation and
      // overrides the store's real name (e.g. "פרחי גן" became
      // generic project name in the browser tab). Leaving meta empty here lets the
      // store-driven imperative title win.
      { name: "description", content: "חנות פרחים — זרים, עציצים ומתנות עם משלוח." },
    ],
    links: [],
    scripts: [],
  }),
  component: IndexGate,
});

function IndexGate() {
  const [showLanding, setShowLanding] = useState<null | boolean>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [autoOpenOnboarding, setAutoOpenOnboarding] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const isOAuthReturn = isOAuthOnboardingReturn();
    let hasActiveStore = !!url.searchParams.get("store");
    if (!hasActiveStore && typeof localStorage !== "undefined") {
      try {
        hasActiveStore =
          !!localStorage.getItem("tmm_store_override") ||
          !!localStorage.getItem("tmm_current_store_id");
      } catch {
        /* ignore */
      }
    }
    setIsPreview(url.searchParams.get("preview") === "1");
    const wantsOnboarding = url.searchParams.get("openOnboarding") === "1" || isOAuthReturn;
    // Show the SaaS landing whenever there is no active store context for
    // this visitor — regardless of host. When the visitor returns from
    // Google OAuth with ?openOnboarding=1 or #access_token we FORCE the
    // landing (even if a stale store override exists in localStorage) so the
    // wizard dialog can resume instead of silently routing them to the storefront.
    setShowLanding(wantsOnboarding ? true : !hasActiveStore);
    if (wantsOnboarding) {
      setAutoOpenOnboarding(true);
      // Do NOT strip ?openOnboarding or #access_token here. The auth client
      // must be allowed to parse the OAuth callback URL first, otherwise new
      // users can lose the freshly-returned session and fall back to the bare landing.
    }
    // After auth hydration, signed-in users with no store must stay on the
    // landing and get the onboarding popup immediately — even if the auth SDK
    // already cleaned the callback URL before React's effect ran.
    if (wantsOnboarding || !hasActiveStore) {
      (async () => {
        const session = await awaitSafeSession(supabase, { maxMs: 10_000 });
        if (!session) return;
        const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } as any }));
        const user = data.user;
        if (!user) return;
        clearOAuthStart();
        const { data: memberships } = await supabase
          .from("store_members")
          .select("store_id")
          .eq("user_id", user.id)
          .limit(1);
        if (!memberships || memberships.length === 0) {
          try {
            localStorage.removeItem("tmm_store_override");
            localStorage.removeItem("tmm_current_store");
            localStorage.removeItem("tmm_current_store_id");
          } catch {}
          setShowLanding(true);
          setAutoOpenOnboarding(true);
        }
      })();
    }
    // Post-onboarding hand-off from the admin "View site" popup: kick off
    // the WhatsApp fly-in → AI offer → PWA offer → "back to edit" sequence.
    if (url.searchParams.get("postOnboardView") === "1") {
      try { localStorage.removeItem(SEQUENCE_DONE_FLAG); } catch {}
      try { celebrate({ brand: true }); } catch {}
      window.setTimeout(() => {
        try { window.dispatchEvent(new Event(WA_FLY_EVENT)); } catch {}
        try { window.dispatchEvent(new Event(ONBOARDING_EVENT)); } catch {}
      }, 600);
      // Strip the one-shot param so reload doesn't re-trigger.
      url.searchParams.delete("postOnboardView");
      window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams.toString()}` : ""));
    }
  }, []);
  if (showLanding === null) {
    // First-paint skeleton instead of a blank screen.
    return (
      <div dir="rtl" className="min-h-screen bg-background animate-pulse">
        <div className="h-16 border-b border-border bg-card" />
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
          <div className="h-48 rounded-3xl bg-muted" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-2xl bg-muted" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (showLanding) return <SaasLanding autoOpen={autoOpenOnboarding} />;
  return (
    <>
      {isPreview && <PreviewBanner />}
      <Index />
    </>
  );
}

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  original_price: number | null;
  image_url: string;
  rating: number;
  badge: string | null;
  badge_color: string | null;
  stock: number;
  category_id: string | null;
  highlight_size?: number;
};
type Category = { id: string; name: string; bg_color?: string; bg_color_to?: string; bg_effect?: string; bg_image_url?: string; bg_shape?: string; bg_size?: number; bg_position?: string };
type CategoryEx = Category & { display_mode?: string };
type Settings = Record<string, unknown>;

function Index() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [galleryMap, setGalleryMap] = useState<Record<string, string[]>>({});
  const [minSizeMap, setMinSizeMap] = useState<Record<string, number>>({});
  const [activeImg, setActiveImg] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<Settings>({});
  const [activeCat, setActiveCat] = useState<string>("הכל");
  const [saleOnly, setSaleOnly] = useState(false);
  const [filterIds, setFilterIds] = useState<string[] | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]);
  const [priceBounds, setPriceBounds] = useState<[number, number]>([0, 0]);
  const [priceTouched, setPriceTouched] = useState(false);
  const [productCats, setProductCats] = useState<Record<string, string[]>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [plusBurst, setPlusBurst] = useState<Record<string, number>>({});
  const [urlSignature, setUrlSignature] = useState(() => getStorefrontUrlSignature());
  const { add, count, setCoupon } = useCart();
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const isMobile = useIsMobile();
  const splitOpen = !!sheetId && !isMobile;
  const { store: currentStore } = useStore();
  const isPreview = isLazyPreviewMode();
  const storeIdForQueries = isPreview ? PLATFORM_TEMPLATE_STORE_ID : currentStore?.id;

  useEffect(() => {
    const updateSignature = () => setUrlSignature(getStorefrontUrlSignature());
    updateSignature();
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    window.history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      window.dispatchEvent(new Event("tmm:storefront-url-change"));
      return result;
    };
    window.history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      window.dispatchEvent(new Event("tmm:storefront-url-change"));
      return result;
    };
    window.addEventListener("popstate", updateSignature);
    window.addEventListener("tmm:storefront-url-change", updateSignature);
    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", updateSignature);
      window.removeEventListener("tmm:storefront-url-change", updateSignature);
    };
  }, []);

  useEffect(() => {
    setProducts([]);
    setCategories([]);
    setSettings({});
    setGalleryMap({});
    setMinSizeMap({});
    setProductCats({});
    setActiveImg({});
    setActiveCat("הכל");
    setSaleOnly(false);
    setFilterIds(null);
    setSearch("");
    setFiltersOpen(false);
    setPriceRange([0, 0]);
    setPriceBounds([0, 0]);
    setPriceTouched(false);
    setSheetId(null);
  }, [urlSignature, storeIdForQueries]);

  useEffect(() => {
    if (!storeIdForQueries) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [p, c, s] = await Promise.all([
        supabase.from("products").select("*").eq("store_id", storeIdForQueries).eq("active", true).order("display_order"),
        supabase.from("categories").select("id,name,bg_color,bg_color_to,bg_effect,bg_image_url,bg_shape,bg_size,bg_position,display_mode").eq("store_id", storeIdForQueries).eq("active", true).order("display_order"),
        // Explicit store_id filter — eliminates header-race during impersonation switches.
        supabase.from("site_settings").select("key,value").eq("store_id", storeIdForQueries),
      ]);
      if (cancelled) return;
      if (p.data) setProducts(p.data as Product[]);
      if (p.data && p.data.length) {
        const prices = (p.data as Product[]).map((x) => Number(x.price)).filter((n) => !isNaN(n));
        const min = Math.floor(Math.min(...prices));
        const max = Math.ceil(Math.max(...prices));
        setPriceBounds([min, max]);
        // Default: full range. Snaps to start at 65 only after the user interacts with the slider.
        setPriceRange([min, max]);
      }
      if (c.data) {
        const cats = c.data as Category[];
        // Strict de-dup: never render two tabs with the same name.
        const uniqueCategories = cats.filter(
          (value, index, self) => self.findIndex((c) => c.name === value.name) === index,
        );
        setCategories(uniqueCategories);
      }
      if (s.data) {
        const map: Settings = {};
        for (const row of s.data) map[row.key as string] = (row as { value: unknown }).value;
        setSettings(map);
      }
      if (p.data && p.data.length) {
        const ids = (p.data as Product[]).map((x) => x.id);
        const { data: imgs } = await supabase.from("product_images").select("product_id,image_url,display_order").in("product_id", ids).order("display_order");
        if (cancelled) return;
        const m: Record<string, string[]> = {};
        for (const row of (imgs || []) as any[]) {
          (m[row.product_id] ||= []).push(row.image_url);
        }
        setGalleryMap(m);
        const { data: szs } = await (supabase as any).from("product_sizes").select("product_id,price").in("product_id", ids);
        if (cancelled) return;
        const sm: Record<string, number> = {};
        for (const row of (szs || []) as any[]) {
          const cur = sm[row.product_id];
          const v = Number(row.price);
          if (cur === undefined || v < cur) sm[row.product_id] = v;
        }
        setMinSizeMap(sm);
        const { data: pcs } = await (supabase as any).from("product_categories").select("product_id,category_id").in("product_id", ids);
        if (cancelled) return;
        const pcMap: Record<string, string[]> = {};
        for (const row of (pcs || []) as any[]) {
          (pcMap[row.product_id] ||= []).push(row.category_id);
        }
        // Fall back to single category_id when no junction rows exist
        for (const pr of p.data as Product[]) {
          if (!pcMap[pr.id] && pr.category_id) pcMap[pr.id] = [pr.category_id];
        }
        setProductCats(pcMap);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [storeIdForQueries, urlSignature]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      if (roles?.some((r) => r.role === "admin")) {
        setIsAdmin(true);
        return;
      }
      // Also show the settings gear to store OWNERS (not only platform admins),
      // so the person who just created the store can jump into /admin.
      if (storeIdForQueries) {
        const { data: membership } = await supabase
          .from("store_members")
          .select("store_id")
          .eq("store_id", storeIdForQueries)
          .eq("user_id", data.user.id)
          .maybeSingle();
        if (membership) setIsAdmin(true);
      }
    })();
  }, [storeIdForQueries]);

  // Auto-apply coupon from ?coupon=XXXX share link
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("coupon");
    const filter = url.searchParams.get("filter");
    const ids = url.searchParams.get("ids");
    if (filter === "sale") setSaleOnly(true);
    if (ids) setFilterIds(ids.split(",").filter(Boolean));
    if (!code) return;
    (async () => {
      const r = await validateCoupon(code, 99999);
      if (r.valid) {
        setCoupon({ code: r.code, discount: r.discount, coupon_id: r.coupon_id });
        toast.success(`קוד הנחה ${r.code} הוחל!`, { description: "יחושב בעמוד הסל" });
      }
    })();
  }, [setCoupon]);

  const get = (k: string, fb = "") => (settings[k] as string) ?? fb;
  const displayStoreName = getPreviewDisplayName(get("store_name", currentStore?.name || "החנות"));
  const catById = (id: string | null) => (id ? categories.find((c) => c.id === id) : undefined);
  const catsOfProduct = (p: Product) => productCats[p.id] || (p.category_id ? [p.category_id] : []);
  // Notify popup system when active category changes (for category-based triggers)
  useEffect(() => {
    const obj = categories.find((c) => c.name === activeCat);
    if (!obj) return;
    window.dispatchEvent(new CustomEvent("tmm:category-enter", { detail: { id: obj.id, name: obj.name } }));
  }, [activeCat, categories]);
  let filtered = products;
  if (filterIds && filterIds.length) {
    filtered = filtered.filter((p) => filterIds.includes(p.id));
  } else {
    if (saleOnly) filtered = filtered.filter((p) => p.original_price && p.original_price > p.price);
    if (activeCat !== "הכל") {
      const activeCatObj = categories.find((c) => c.name === activeCat);
      if (activeCatObj) filtered = filtered.filter((p) => catsOfProduct(p).includes(activeCatObj.id));
    }
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(q) || (p.description||"").toLowerCase().includes(q));
  }
  if (priceBounds[1] > priceBounds[0]) {
    filtered = filtered.filter((p) => Number(p.price) >= priceRange[0] && Number(p.price) <= priceRange[1]);
  }

  const priceFilterActive = priceTouched && (priceRange[0] !== priceBounds[0] || priceRange[1] !== priceBounds[1]);
  const activeFiltersCount = (search?1:0) + (priceFilterActive?1:0);

  // Hide categories that have no (visible) products
  const productCountByCat: Record<string, number> = {};
  for (const pr of products) for (const cid of catsOfProduct(pr)) productCountByCat[cid] = (productCountByCat[cid]||0) + 1;
  const visibleCategories = categories.filter((c) => (productCountByCat[c.id] || 0) > 0);

  // Split into scroll-rows vs grid categories
  const scrollCats = visibleCategories.filter((c) => (c as CategoryEx).display_mode === "scroll");
  const scrollCatIds = new Set(scrollCats.map((c) => c.id));
  const showScrollSections = activeCat === "הכל" && !filterIds && !saleOnly && !search && !priceFilterActive && scrollCats.length > 0;
  const gridProducts = showScrollSections
    ? filtered.filter((p) => !catsOfProduct(p).some((cid) => scrollCatIds.has(cid)))
    : filtered;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border px-3 sm:px-4 md:px-8 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <img src={currentStore?.logo_url || logoImg} alt={`לוגו ${currentStore?.name || "החנות"}`} className="w-10 h-10 rounded-2xl object-contain bg-primary/5 shrink-0"/>
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-semibold text-foreground leading-tight tracking-tight truncate">{displayStoreName}</h1>
            <p className="text-[10px] md:text-xs text-muted-foreground truncate">{get("store_tagline", currentStore?.description || "")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <Link
              to="/admin"
              aria-label="הגדרות החנות"
              title="הגדרות החנות"
              className="p-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/15 transition"
            >
              <Settings size={18} />
            </Link>
          )}
          {isMobile ? (
            <Link to="/cart" id="cart-icon" aria-label="פתח עגלת קניות" className="relative p-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/15 transition" title="עגלה">
              <ShoppingCart size={18} />
              {count > 0 && <span className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{count}</span>}
            </Link>
          ) : (
            <button id="cart-icon" onClick={() => setCartOpen(true)} aria-label="פתח עגלת קניות" className="relative p-2.5 rounded-full bg-primary/10 text-primary hover:bg-primary/15 transition" title="עגלה">
              <ShoppingCart size={18} />
              {count > 0 && <span className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{count}</span>}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Banner area renders ONLY when active slides exist; no empty placeholders. */}
        <HeroCarousel />

        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 pt-1 -mx-1 px-1">
          {(saleOnly || filterIds) && (
            <button onClick={() => { setSaleOnly(false); setFilterIds(null); const u = new URL(window.location.href); u.searchParams.delete("filter"); u.searchParams.delete("ids"); window.history.replaceState({}, "", u.toString()); }}
              className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap bg-rose-50 text-rose-600 border border-rose-200">
              ✕ נקה סינון {saleOnly ? "מבצעים" : "מותאם"}
            </button>
          )}
          {["הכל", ...visibleCategories.map((c) => c.name)].map((cat, idx) => {
            const catObj = cat === "הכל" ? null : visibleCategories.find((c) => c.name === cat);
            const c1 = catObj?.bg_color || "";
            const c2 = catObj?.bg_color_to || c1;
            const hasColor = !!c1;
            const isActive = activeCat === cat;
            const chipStyle: React.CSSProperties = hasColor
              ? isActive
                ? { background: c2 && c2 !== c1 ? `linear-gradient(135deg, ${c1}, ${c2})` : c1, borderColor: c1, color: "#111" }
                : { background: `color-mix(in oklab, ${c1} 22%, transparent)`, borderColor: `color-mix(in oklab, ${c1} 55%, transparent)`, color: "inherit" }
              : {};
            return (
            <Fragment key={cat}>
              <button
                onClick={() => setActiveCat(cat)}
                style={chipStyle}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition border ${
                  hasColor
                    ? (isActive ? "shadow-[var(--shadow-soft)] font-semibold" : "hover:brightness-95")
                    : (isActive
                        ? "bg-primary text-primary-foreground border-transparent shadow-[var(--shadow-soft)]"
                        : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-primary/30")
                }`}
              >
                {cat}
              </button>
              {idx === 0 && (
                <button
                  onClick={() => setFiltersOpen((v) => !v)}
                  className={`relative flex items-center justify-center w-10 h-10 rounded-full whitespace-nowrap transition border flex-shrink-0 ${filtersOpen||activeFiltersCount>0 ? "bg-primary/10 text-primary border-primary/30" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
                  title="סינונים"
                  aria-label="סינונים"
                >
                  <SlidersHorizontal size={16}/>
                  {activeFiltersCount>0 && <span className="absolute -top-1 -left-1 bg-primary text-primary-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center">{activeFiltersCount}</span>}
                </button>
              )}
            </Fragment>
            );
          })}
        </div>

        {filtersOpen && (
          <div className="bg-card border border-border rounded-2xl p-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <input type="search" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="חיפוש מוצר..." aria-label="חיפוש מוצר" className="w-full bg-secondary/50 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"/>
            </div>
            {activeFiltersCount>0 && (
              <button onClick={()=>{setSearch("");setPriceRange(priceBounds);setPriceTouched(false);}} className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-destructive">
                <X size={12}/> נקה
              </button>
            )}
            </div>
            {priceBounds[1] > priceBounds[0] && (
              <div className="px-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>טווח מחירים</span>
                  <span className="font-medium text-foreground">₪{priceRange[0]} – ₪{priceRange[1]}</span>
                </div>
                <Slider
                  min={priceBounds[0]}
                  max={priceBounds[1]}
                  step={1}
                  value={priceRange}
                  onValueChange={(v) => {
                    if (!priceTouched) {
                      // First interaction: snap the lower handle to 65 (or min, whichever is higher)
                      setPriceTouched(true);
                      const lo = Math.max(priceBounds[0], 65);
                      setPriceRange([Math.min(lo, priceBounds[1]), priceBounds[1]]);
                    } else {
                      setPriceRange([v[0], v[1]] as [number, number]);
                    }
                  }}
                  className="my-2"
                />
              </div>
            )}
          </div>
        )}

        <div className={splitOpen ? "grid grid-cols-1 lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_26rem] gap-5" : ""}>
          <div className="space-y-6">
          {showScrollSections && scrollCats.map((sc) => {
            const list = filtered.filter((p) => catsOfProduct(p).includes(sc.id));
            if (!list.length) return null;
            return (
              <section key={sc.id} className="space-y-2">
                <div className="flex items-baseline justify-between px-1">
                  <h3 className="text-lg font-bold tracking-tight">{sc.name}</h3>
                  <button onClick={() => setActiveCat(sc.name)} className="text-xs text-primary hover:underline">הצג הכל ←</button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x scrollbar-hide">
                  {list.map((p) => (
                    <div key={p.id} className="flex-shrink-0 w-[160px] md:w-[200px] snap-start">
                      <CardItem p={p} cat={catById(p.category_id)}
                        minSizePrice={minSizeMap[p.id]}
                        gallery={[p.image_url, ...(galleryMap[p.id] || []).filter((u) => u !== p.image_url)].filter((u): u is string => !!u && typeof u === "string" && u.trim() !== "")}
                        activeIdx={activeImg[p.id] || 0}
                        setActiveIdx={(i) => setActiveImg((s) => ({ ...s, [p.id]: i }))}
                        onOpen={() => setSheetId(p.id)}
                        active={sheetId === p.id}
                        onZoom={(src) => setZoomImg(src)}
                        onAdd={(el) => {
                          flyToCart({ src: p.image_url, startEl: el });
                          add({ productId: p.id, name: p.name, price: Number(p.price), image: p.image_url, qty: 1 });
                          setPlusBurst((s) => ({ ...s, [p.id]: (s[p.id] || 0) + 1 }));
                          setTimeout(() => setPlusBurst((s) => { const n = { ...s }; n[p.id] = Math.max(0, (n[p.id] || 1) - 1); return n; }), 900);
                        }}
                        burst={plusBurst[p.id] || 0}
                      />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          <div className={`grid gap-3 md:gap-5 auto-rows-min grid-flow-dense items-start content-start ${splitOpen ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4" : "grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"}`}>
            {loading && products.length === 0
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-card rounded-2xl p-2.5 border border-border/70 shadow-[var(--shadow-card)] flex flex-col">
                    <div className="aspect-square rounded-2xl shimmer mb-2" />
                    <div className="h-3 rounded shimmer mb-2 w-3/4" />
                    <div className="flex items-end justify-between mt-1">
                      <div className="h-4 w-12 rounded shimmer" />
                      <div className="h-8 w-8 rounded-xl shimmer" />
                    </div>
                  </div>
                ))
              : gridProducts.length === 0
              ? null
              : gridProducts.map((p, gi) => (
              <CardItem key={p.id} p={p} cat={catById(p.category_id)}
                priority={gi < 4}
                spanClass={(p.highlight_size || 1) >= 2 ? "col-span-2" : ""}
                minSizePrice={minSizeMap[p.id]}
                gallery={[p.image_url, ...(galleryMap[p.id] || []).filter((u) => u !== p.image_url)].filter((u): u is string => !!u && typeof u === "string" && u.trim() !== "")}
                activeIdx={activeImg[p.id] || 0}
                setActiveIdx={(i) => setActiveImg((s) => ({ ...s, [p.id]: i }))}
                onOpen={() => setSheetId(p.id)}
                active={sheetId === p.id}
                onZoom={(src) => setZoomImg(src)}
                onAdd={(el) => {
                  flyToCart({ src: p.image_url, startEl: el });
                  add({ productId: p.id, name: p.name, price: Number(p.price), image: p.image_url, qty: 1 });
                  setPlusBurst((s) => ({ ...s, [p.id]: (s[p.id] || 0) + 1 }));
                  setTimeout(() => setPlusBurst((s) => { const n = { ...s }; n[p.id] = Math.max(0, (n[p.id] || 1) - 1); return n; }), 900);
                }}
                burst={plusBurst[p.id] || 0}
              />
            ))}
          </div>
          {!loading && gridProducts.length === 0 && (
            <div className="bg-card border border-border rounded-3xl p-10 text-center space-y-3">
              {products.length === 0 ? (
                <>
                  <div className="text-4xl">🌷</div>
                  <h3 className="text-lg font-black">עדיין אין מוצרים בחנות</h3>
                  <p className="text-sm text-muted-foreground">
                    {isAdmin ? "הוסף את המוצר הראשון שלך כדי שלקוחות יוכלו להזמין." : "החנות בהקמה — חזרו בקרוב לקטלוג מלא."}
                  </p>
                  {isAdmin && (
                    <Link to="/admin" className="inline-block mt-2 bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl">
                      הוסף מוצר ראשון ←
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <div className="text-3xl">🔎</div>
                  <h3 className="text-base font-black">אין תוצאות לסינון הנוכחי</h3>
                  <button
                    onClick={() => { setSearch(""); setActiveCat("הכל"); setSaleOnly(false); setFilterIds(null); setPriceRange(priceBounds); setPriceTouched(false); }}
                    className="inline-block mt-2 text-sm text-primary font-bold hover:underline"
                  >
                    נקה את כל הסינונים
                  </button>
                </>
              )}
            </div>
          )}
          </div>
          {splitOpen && (
            <div className="hidden lg:block">
              <ProductDetailPanel productId={sheetId} onClose={() => setSheetId(null)} />
            </div>
          )}
        </div>

        <footer className="text-center text-sm text-muted-foreground py-8 border-t border-border">
          <p className="font-bold">{displayStoreName} · {get("store_phone", currentStore?.contact_phone || "")}</p>
          <p className="mt-1">{get("store_address", "")} · {get("store_hours", "")}</p>
          <p className="mt-1 text-xs">{get("delivery_info", "")}</p>
        </footer>
      </main>
      <ProductDetail productId={sheetId} open={!!sheetId} onOpenChange={(v) => !v && setSheetId(null)} />
      <CartPanel open={cartOpen} onClose={() => setCartOpen(false)} />
      <WhatsAppFloater phone={get("whatsapp_business", currentStore?.whatsapp_business || "") as string} />
      <OnboardingPrompt
        storeId={currentStore?.id || null}
        existingPhone={get("whatsapp_business", currentStore?.whatsapp_business || "") as string}
        onPhoneSaved={(phone) => setSettings((s) => ({ ...s, store_phone: phone, whatsapp_business: phone }))}
      />
      <InstallPWAButton />
      <WhatsAppFlyIn />
      <SalesChatBot />
      {zoomImg && (
        <div
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setZoomImg(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setZoomImg(null); }}
            aria-label="סגור"
            className="absolute top-4 left-4 p-2 rounded-full bg-white/95 text-foreground shadow-lg hover:scale-105 transition"
          >
            <X size={20} />
          </button>
          <img
            src={zoomImg}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-2xl shadow-2xl animate-in zoom-in-95"
          />
        </div>
      )}
    </div>
  );
}

function WhatsAppFloater({ phone }: { phone: string }) {
  const digits = (phone || "").replace(/\D/g, "");
  const { store } = useStore();
  const [isOwner, setIsOwner] = useState(false);
  // Note: we intentionally do NOT hide in preview mode anymore — once an
  // owner has entered a WhatsApp number we want them to SEE the live
  // floater locked in place (the gamified fly-in animation lands exactly
  // on this widget's position).

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!store?.id) return;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { if (!cancelled) setIsOwner(false); return; }
      const { data: m } = await supabase
        .from("store_members")
        .select("role")
        .eq("store_id", store.id)
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!cancelled) setIsOwner(!!m);
    })();
    return () => { cancelled = true; };
  }, [store?.id]);

  if (!digits) return null;
  const intl = digits.startsWith("0") ? "972" + digits.slice(1) : digits;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const dashboardUrl = `${origin}/admin${store?.id ? `?store=${store.id}` : ""}`;
  const ownerMsg = `היי! זה הקישור הרשמי לדאשבורד הניהול של החנות שלך לעריכות עתידיות: ${dashboardUrl}. שמור את הקישור הזה!`;
  const customerMsg = "היי, הגעתי מהאתר שלכם ואשמח לקבל פרטים נוספים!";
  const text = encodeURIComponent(isOwner ? ownerMsg : customerMsg);

  return (
    <a
      href={`https://wa.me/${intl}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={isOwner ? "שלח לעצמך את קישור הניהול" : "צור קשר בוואטסאפ"}
      title={isOwner ? "שלח לעצמך את קישור הניהול" : "וואטסאפ"}
      className="pop-bounce-in fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_rgba(37,211,102,0.45)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
    >
      <MessageCircle size={26} className="fill-white" />
    </a>
  );
}

/**
 * After a fresh signup (?onboarded=1), wait 5s then offer to deep-link the
 * new owner into the contact/WhatsApp settings tab. The "endowment effect":
 * they see their live, styled store first, then we ask them to wire up
 * orders.
 */
function OnboardingPrompt({
  storeId,
  existingPhone,
  onPhoneSaved,
}: {
  storeId: string | null;
  existingPhone: string;
  onPhoneSaved: (phone: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const onboarded = url.searchParams.get("onboarded") === "1";
    const preview = url.searchParams.get("preview") === "1";
    if (!onboarded && !preview) return;
    if (onboarded) {
      url.searchParams.delete("onboarded");
      window.history.replaceState({}, "", url.toString());
    }
    // Skip if phone already configured (e.g. re-entry).
    if (existingPhone && existingPhone.trim()) return;
    // In preview mode fire faster so visitors see the sequence immediately;
    // post-signup we wait so the new owner gets to admire the live store first.
    const delay = preview ? 1500 : 5000;
    const t = window.setTimeout(() => setShow(true), delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-focus the phone input as soon as the modal opens, so mobile users
  // get the keyboard immediately without an extra tap.
  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 100);
    return () => window.clearTimeout(t);
  }, [show]);

  async function submit() {
    const digits = phone.replace(/\D/g, "");
    // Optional field — if the user typed nothing, just dismiss (treat as skip).
    if (!digits) {
      setShow(false);
      return;
    }
    // In lazy-preview mode we are on the platform template store — do not
    // persist anything. Just fire the celebratory chain so the visitor sees
    // the next steps before they actually create their store.
    const inPreview = typeof window !== "undefined" &&
      new URL(window.location.href).searchParams.get("preview") === "1";
    if (!inPreview) {
      if (!storeId) {
        toast.error("החנות עדיין נטענת — נסה שוב");
        return;
      }
      setSaving(true);
      const { error } = await supabase
        .from("site_settings")
        .upsert(
          [
            { store_id: storeId, key: "store_phone", value: digits as any },
            { store_id: storeId, key: "whatsapp_business", value: digits as any },
          ],
          { onConflict: "store_id,key" },
        );
      setSaving(false);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    // Always notify the parent so the WhatsAppFloater renders immediately,
    // even in lazy-preview mode where nothing is persisted yet.
    onPhoneSaved(digits);
    toast.success("מצוין! כפתור הוואטסאפ מופיע עכשיו בחנות");
    setShow(false);
    // Brand-themed confetti + start the AI-bot / next-action chain.
    try { celebrate({ brand: true }); } catch {}
    try { window.dispatchEvent(new Event(ONBOARDING_EVENT)); } catch {}
  }

  if (!show) return null;
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in"
      onClick={() => setShow(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-card border-2 border-primary/30 shadow-2xl rounded-3xl p-5 sm:p-6 animate-in slide-in-from-bottom-6 sm:zoom-in-95"
      >
        <button
          onClick={() => setShow(false)}
          aria-label="סגור"
          className="absolute top-3 left-3 p-1.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted"
        >
          <X size={18} />
        </button>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#25D366] to-emerald-600 flex items-center justify-center text-white shrink-0">
            <MessageCircle size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-black text-foreground text-base sm:text-lg mb-1">החנות שלך באוויר! ✨</h4>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              הזן מספר וואטסאפ עסקי (אופציונלי) — לקוחות יוכלו לפנות אליך בלחיצה אחת.
            </p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <input
            ref={inputRef}
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-1234567"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground bg-muted/40 border border-border/60 rounded-xl px-3 py-2.5">
            בלחיצה על <span className="font-bold text-foreground">סיום</span> הנך מאשר/ת את{" "}
            <Link to="/terms" target="_blank" className="underline hover:text-primary">תנאי השימוש</Link>
            {" "}ו
            <Link to="/privacy" target="_blank" className="underline hover:text-primary">מדיניות הפרטיות</Link>
            {" "}של האתר, ומסכים/ה לקבלת עדכונים, הודעות דיוור ותכנים שיווקיים מדי פעם מהמערכת
            (ניתן להסיר את עצמך בכל עת).
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => setShow(false)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              דלג בינתיים
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-[#25D366] text-white font-bold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "שומר…" : phone.trim() ? "שמור והפעל" : "סיים"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Install-PWA button — only visible when the browser fires
 * `beforeinstallprompt`. Clicking it triggers the native install dialog
 * with exactly one click (`deferredPrompt.prompt()`).
 */
function InstallPWAButton() {
  const [deferred, setDeferred] = useState<any>(null);
  // Visibility is controlled by the merchant via the onboarding PWA card.
  // Default to false — storefronts never advertise install until opted in.
  const [enabled, setEnabled] = useState<boolean>(() => isPwaEnabled());
  useEffect(() => {
    const sync = () => setEnabled(isPwaEnabled());
    window.addEventListener(PWA_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PWA_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt as any);
    const onInstalled = () => setDeferred(null);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt as any);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!enabled || !deferred) return null;
  return (
    <button
      onClick={async () => {
        try {
          await deferred.prompt();
          const choice = await deferred.userChoice;
          if (choice?.outcome === "accepted") setDeferred(null);
        } catch {
          setDeferred(null);
        }
      }}
      aria-label="התקן את האפליקציה"
      className="pop-bounce-in fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 bg-foreground text-background font-bold px-4 py-3 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-transform"
    >
      <Download size={18} />
      <span className="text-sm">התקן אפליקציה</span>
    </button>
  );
}

function normalizeProductImageUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeProductImageUrl(parsed.find((item) => typeof item === "string" && item.trim()));
      return normalizeProductImageUrl(parsed);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function CardItem({ p, cat, gallery, activeIdx, setActiveIdx, onOpen, onZoom, onAdd, active, minSizePrice, burst, spanClass, priority }: {
  p: Product; cat?: Category; gallery: string[]; activeIdx: number;
  setActiveIdx: (i: number) => void; onOpen: () => void; onZoom: (src: string) => void;
  onAdd: (el: HTMLElement | null) => void;
  active?: boolean;
  minSizePrice?: number;
  burst?: number;
  spanClass?: string;
  priority?: boolean;
}) {
  const bgStyle = categoryBg(cat);
  const halo = categoryHaloClass(cat);
  const shapeStyle = categoryShapeStyle(cat);
  const safeGallery = gallery.map(normalizeProductImageUrl).filter((url): url is string => !!url);
  const primaryImage = normalizeProductImageUrl(p.image_url);
  const images = safeGallery.length ? safeGallery : (primaryImage ? [primaryImage] : []);
  const main = images[activeIdx] || images[0] || primaryImage;
  if (!main) return null;
  const isMobile = useIsMobile();
  const hasMulti = images.length > 1;
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [hovering, setHovering] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const go = (n: number) => setActiveIdx(((n % images.length) + images.length) % images.length);
  const goAndScroll = (n: number) => {
    const next = ((n % images.length) + images.length) % images.length;
    setActiveIdx(next);
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !hasMulti) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== activeIdx) setActiveIdx(((i % images.length) + images.length) % images.length);
  };
  return (
    <article className={`bg-card rounded-2xl p-2.5 border shadow-[var(--shadow-card)] flex flex-col hover:-translate-y-1 hover:shadow-[var(--shadow-soft)] transition-all relative ${active ? "border-primary ring-2 ring-primary/30" : "border-border/70"} ${spanClass || ""}`}>
              {p.badge && (
                <span className="absolute m-2 z-10 text-[10px] font-semibold text-primary-foreground bg-primary px-2 py-0.5 rounded-full">{p.badge}</span>
              )}
      <div
        style={bgStyle}
        className={`aspect-square rounded-2xl mb-2 relative block w-full text-right overflow-hidden group ${halo}`}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {shapeStyle && <span aria-hidden style={shapeStyle} />}
        <span aria-hidden className="absolute inset-3 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary)_45%,transparent),transparent_65%)] blur-2xl z-[1] pointer-events-none" />
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="absolute inset-0 z-[2] flex overflow-x-auto snap-x snap-mandatory scrollbar-hide rounded-2xl"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={onOpen}
              aria-label={`פתח ${p.name}`}
              className="relative flex-shrink-0 w-full h-full snap-center snap-always block text-right"
            >
              {!loaded[src] && (
                <span aria-hidden className="absolute inset-0 rounded-2xl bg-muted animate-pulse" />
              )}
              <img
                src={src}
                alt={p.name}
                width={400}
                height={400}
                loading={priority && i === 0 ? "eager" : "lazy"}
                fetchPriority={priority && i === 0 ? "high" : "auto"}
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={() => setLoaded((s) => ({ ...s, [src]: true }))}
                className="absolute inset-0 w-full h-full object-cover rounded-2xl"
              />
            </button>
          ))}
        </div>
        {!isMobile && hasMulti && hovering && (
          <>
            <span
              role="button"
              tabIndex={-1}
              aria-label="הבא"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goAndScroll(activeIdx + 1); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-card/85 backdrop-blur text-foreground flex items-center justify-center shadow z-[3] hover:bg-card cursor-pointer"
            >
              ›
            </span>
            <span
              role="button"
              tabIndex={-1}
              aria-label="הקודם"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goAndScroll(activeIdx - 1); }}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-card/85 backdrop-blur text-foreground flex items-center justify-center shadow z-[3] hover:bg-card cursor-pointer"
            >
              ‹
            </span>
          </>
        )}
        {hasMulti && (
          <span aria-hidden className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1 z-[3] pointer-events-none">
            {images.slice(0, 8).map((_, i) => (
              <span key={i} className={`rounded-full transition-all ${i === activeIdx ? "bg-white w-2.5 h-1.5" : "bg-white/60 w-1.5 h-1.5"} shadow-[0_0_2px_rgba(0,0,0,0.3)]`} />
            ))}
          </span>
        )}
                <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onZoom(main); }}
          className="absolute top-2 left-2 p-1.5 bg-card/90 backdrop-blur rounded-full shadow-sm z-[2]"
                  aria-label="הגדל תמונה"
                >
          <ZoomIn size={14} className="text-muted-foreground" />
                </button>
                {p.stock <= 5 && p.stock > 0 && (
          <span className="absolute bottom-2 right-2 text-[10px] font-medium bg-card/90 backdrop-blur text-foreground px-2 py-0.5 rounded-full z-[3]">
                    נשארו {p.stock}
                  </span>
                )}
                {p.stock === 0 && (
          <span className="absolute inset-0 bg-foreground/40 flex items-center justify-center text-card font-semibold z-[3] pointer-events-none">אזל</span>
                )}
              </div>
              <div className="px-1 flex flex-col flex-1">
        <button onClick={onOpen} className="font-semibold text-sm text-foreground line-clamp-1 hover:text-primary tracking-tight text-right">{p.name}</button>
                <div className="flex items-end justify-between mt-2 pt-1">
                  <div className="flex flex-col leading-tight">
                    {minSizePrice !== undefined && (
                      <span className="text-[9px] text-muted-foreground">החל מ-</span>
                    )}
                    {p.original_price && p.original_price > (minSizePrice ?? p.price) && (
                      <PriceStrike value={p.original_price} className="text-[10px]" />
                    )}
                    <span className="font-bold text-primary text-[15px]">₪{minSizePrice !== undefined ? minSizePrice : p.price}</span>
                  </div>
                  <button
                  disabled={p.stock === 0}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
                    className="relative bg-primary text-primary-foreground p-2 rounded-xl hover:bg-primary/90 disabled:opacity-40 transition shadow-sm"
                    aria-label="פתח פרטי מוצר"
                  >
                    <Plus size={16} className="stroke-[2.5]" />
                    {burst ? (
                      <span key={burst} className="absolute -top-1 -left-2 text-primary bg-card border border-primary rounded-full text-[10px] font-black px-1 py-0 animate-in zoom-in fade-in duration-200 plus-burst">
                        +{burst}
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>
    </article>
  );
}

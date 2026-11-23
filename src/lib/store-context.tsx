import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
import { supabase } from "@/integrations/supabase/client";
import { PLATFORM_TEMPLATE_STORE_ID } from "@/lib/platform-template";
import { getStorefrontUrlSignature, isLazyPreviewMode } from "@/lib/preview-mode";

// Public storefront columns only. Anon role has been revoked on
// `owner_user_id` and `contact_email`, so `select("*")` fails for guests
// (which broke the Lazy Preview). Keep this list aligned with the grants
// in the latest stores migration.
const STORE_PUBLIC_COLUMNS =
  "id,slug,name,description,primary_domain,extra_domains,active,plan,logo_url,favicon_url,theme,contact_phone,whatsapp_business,created_at,updated_at";

export type StoreTheme = Partial<{
  primary: string;
  primary_foreground: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  font_heading: string;
  font_body: string;
}>;

export type Store = {
  id: string;
  slug: string;
  name: string;
  description: string;
  primary_domain: string | null;
  extra_domains: string[];
  logo_url: string;
  favicon_url: string;
  theme: StoreTheme;
  contact_email: string;
  contact_phone: string;
  whatsapp_business: string;
  plan: string;
  active: boolean;
};

type Ctx = {
  store: Store | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const StoreContext = createContext<Ctx>({ store: null, loading: false, error: null, refresh: async () => {} });

const LS_STORE_CACHE = "tmm_current_store";
const LS_STORE_ID = "tmm_current_store_id";
const LS_URL_SIGNATURE = "tmm_storefront_url_signature";

function syncDefaultStoreId(): string | null {
  if (typeof window === "undefined") return null;
  // Preview mode ALWAYS resolves to the platform template store, regardless
  // of any cached/sticky override from previous visits.
  if (isLazyPreviewMode()) return PLATFORM_TEMPLATE_STORE_ID;
  // 1) Explicit override via ?store=<uuid>
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("store");
    if (fromUrl && /^[0-9a-f-]{36}$/i.test(fromUrl)) return fromUrl;
    // 2) Sticky override (set by demo / store-create flow)
    const sticky = localStorage.getItem("tmm_store_override");
    if (sticky && /^[0-9a-f-]{36}$/i.test(sticky)) return sticky;
    // 3) Cached resolution from a previous visit on the same host
    const cachedId = localStorage.getItem(LS_STORE_ID);
    if (cachedId && /^[0-9a-f-]{36}$/i.test(cachedId)) return cachedId;
  } catch {}
  return null;
}

/**
 * Inject `x-store-id` into all subsequent Supabase requests synchronously.
 *
 * ARCHITECTURAL ROLE — single source of truth during pre-hydration.
 * Every Supabase RLS policy that scopes by store calls `current_store_id()`,
 * which reads this header. This function is therefore the ONLY place that
 * decides which tenant the client is talking to before React mounts. It runs:
 *   1. synchronously at module load (`SYNC_STORE_ID` below), so the very
 *      first SELECT after page boot already carries the correct store id;
 *   2. inside `StoreProvider.load()` once we resolve the store by hostname;
 *   3. inside Super-Admin impersonation handlers (admin.tsx / PlatformPanel),
 *      so a single localStorage override re-routes every subsequent query.
 * Do not bypass this helper — direct `supabase.headers` writes will desync
 * the cached `__TMM_STORE_ID__` global from the live header set.
 */
export function setSupabaseStoreHeader(storeId: string | null) {
  try {
    if (typeof window !== "undefined") {
      if (storeId) (window as any).__TMM_STORE_ID__ = storeId;
      else delete (window as any).__TMM_STORE_ID__;
    }
    const c: any = supabase;
    c.global ||= {};
    c.global.headers ||= {};
    c.headers ||= {};

    const targets = [
      c.global.headers,
      c.headers,
      c.rest?.headers,
      c.storage?.headers,
      c.functions?.headers,
      c.realtime?.headers,
    ].filter(Boolean);

    for (const headers of targets) {
      if (storeId) headers["x-store-id"] = storeId;
      else delete headers["x-store-id"];
    }
  } catch {}
}

function installStoreFetchHeader() {
  if (typeof window === "undefined" || (window as any).__TMM_STORE_FETCH_PATCHED__) return;
  (window as any).__TMM_STORE_FETCH_PATCHED__ = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const liveStoreId = (window as any).__TMM_STORE_ID__ as string | undefined;
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (liveStoreId) headers.set("x-store-id", liveStoreId);
    else headers.delete("x-store-id");
    return originalFetch(input, { ...init, headers });
  };
}

const SYNC_STORE_ID = syncDefaultStoreId();

if (typeof window !== "undefined") {
  try {
    const signature = getStorefrontUrlSignature();
    const previousSignature = localStorage.getItem(LS_URL_SIGNATURE);
    // Hard reset on the post-signup landing — the visitor just transitioned
    // from the template preview to their freshly cloned store, and any cached
    // template store/theme would override the new brand identity on first paint.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("onboarded") === "1") {
        localStorage.removeItem(LS_STORE_CACHE);
        localStorage.removeItem("tmm_theme_colors");
        localStorage.removeItem("tmm_store_override");
        const explicit = url.searchParams.get("store");
        if (explicit && /^[0-9a-f-]{36}$/i.test(explicit)) {
          localStorage.setItem(LS_STORE_ID, explicit);
        }
      }
    } catch {}
    if (signature !== previousSignature) {
      localStorage.removeItem(LS_STORE_CACHE);
      if (isLazyPreviewMode()) {
        localStorage.removeItem("tmm_store_override");
        localStorage.removeItem(LS_STORE_ID);
      }
      localStorage.setItem(LS_URL_SIGNATURE, signature);
    }
    if (SYNC_STORE_ID) {
      (window as any).__TMM_STORE_ID__ = SYNC_STORE_ID;
      setSupabaseStoreHeader(SYNC_STORE_ID);
      if (!isLazyPreviewMode()) localStorage.setItem(LS_STORE_ID, SYNC_STORE_ID);
    }
    installStoreFetchHeader();
  } catch {}
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // Start empty on both server and client so hydration matches, then fill
  // from the cached store before the first paint (layout effect).
  const [store, setStore] = useState<Store | null>(null);
  useIsomorphicLayoutEffect(() => {
    // In preview mode never hydrate from a cached real store — that's what
    // caused the empty product squares (cached "previous" store id leaking in).
    if (isLazyPreviewMode()) return;
    try {
      const cached = localStorage.getItem(LS_STORE_CACHE);
      if (cached) {
        const s = JSON.parse(cached) as Store;
        setSupabaseStoreHeader(s.id);
        setStore((cur) => cur ?? s);
      }
    } catch {
      /* storage blocked */
    }
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    let storeId = SYNC_STORE_ID || store?.id;
    if (isLazyPreviewMode()) storeId = PLATFORM_TEMPLATE_STORE_ID;
    // If we don't know the store yet, resolve it from the current hostname.
    // Hosts (preview, custom domains, published slug) are matched against a
    // store by `primary_domain` or `slug`.
    if (!storeId && typeof window !== "undefined") {
      const host = (window.location.hostname || "").toLowerCase();
      if (host) {
        try {
          const { data: byDomain } = await (supabase as any)
            .from("stores")
            .select("id")
            .or(`primary_domain.eq.${host},slug.eq.${host}`)
            .eq("active", true)
            .maybeSingle();
          if (byDomain?.id) storeId = byDomain.id as string;
        } catch {}
      }
    }
    if (!storeId) return;
    setSupabaseStoreHeader(storeId);
    try {
      const { data: s, error } = await (supabase as any)
        .from("stores")
        .select(STORE_PUBLIC_COLUMNS)
        .eq("id", storeId)
        .maybeSingle();
      if (error) throw error;
      if (s) {
        setSupabaseStoreHeader(s.id);
        // contact_email is not readable by anon; fill in empty so the type is satisfied.
        setStore({ ...(s as any), contact_email: (s as any).contact_email ?? "" } as unknown as Store);
        if (!isLazyPreviewMode()) {
          try {
            localStorage.setItem(LS_STORE_CACHE, JSON.stringify(s));
            localStorage.setItem(LS_STORE_ID, s.id);
          } catch {}
        }
      }
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to resolve store");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StoreContext.Provider value={{ store, loading, error, refresh: load }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}

/**
 * Inline script: rehydrates a cached store id from localStorage on first
 * paint so anon SELECTs can carry the x-store-id header before React runs.
 * Crucially this is store-agnostic — no UUID is hardcoded. The actual
 * mapping from hostname → store happens in `StoreProvider.load()`.
 */
export const STORE_PREHYDRATE_SCRIPT = `(function(){try{var u=new URL(window.location.href);var preview=u.searchParams.get('preview')==='1';var id=preview?'${PLATFORM_TEMPLATE_STORE_ID}':localStorage.getItem('${LS_STORE_ID}');if(id&&/^[0-9a-f-]{36}$/i.test(id)){window.__TMM_STORE_ID__=id;}}catch(e){}})();`;

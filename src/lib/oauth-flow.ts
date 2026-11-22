// Public origin of the deployed app. Set VITE_PUBLIC_APP_ORIGIN in your env
// (e.g. https://blossom-boss.example.com). Falls back to the current origin.
export const PUBLIC_APP_ORIGIN: string =
  (import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined) ||
  (typeof window !== "undefined" ? window.location.origin : "https://blossom-boss.lovable.app");

export function isEmbeddedPreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/** Preview hosts that cannot complete OAuth themselves (kept for iframe embeds). */
export function isPreviewOAuthHost(): boolean {
  return false;
}

export function shouldUsePublishedOAuth(): boolean {
  return isEmbeddedPreview() || isPreviewOAuthHost();
}

export function publishedUrl(pathAndSearch: string): string {
  const safePath = pathAndSearch.startsWith("/") ? pathAndSearch : `/${pathAndSearch}`;
  return `${PUBLIC_APP_ORIGIN}${safePath}`;
}

export function markOAuthStart(targetPath: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("tmm_oauth_pending_until", String(Date.now() + 90_000));
    sessionStorage.setItem("tmm_oauth_target", targetPath);
  } catch {}
}

export function hasRecentOAuthStart(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const until = Number(sessionStorage.getItem("tmm_oauth_pending_until") || "0");
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

export function clearOAuthStart() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("tmm_oauth_pending_until");
    sessionStorage.removeItem("tmm_oauth_target");
  } catch {}
}

/** True when the current URL explicitly asks the app to open the onboarding flow. */
export function hasOpenOnboardingParam(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URL(window.location.href).searchParams.get("openOnboarding") === "1";
  } catch {
    return false;
  }
}

/** True while the browser is carrying an OAuth return payload that the auth SDK must parse. */
export function hasOAuthCallbackPayload(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
    return (
      hash.has("access_token") ||
      hash.has("refresh_token") ||
      hash.has("provider_token") ||
      hash.has("error") ||
      url.searchParams.has("code")
    );
  } catch {
    return false;
  }
}

export function isOAuthOnboardingReturn(): boolean {
  return hasOpenOnboardingParam() || hasOAuthCallbackPayload() || hasRecentOAuthStart();
}

/**
 * Resolve the current Supabase session with a small grace period.
 *
 * Right after a Google OAuth redirect the session token may take a moment to
 * land in localStorage / be visible to the SDK. We poll briefly so callers
 * don't make a "no session" decision against a transient null. Returns the
 * session object (or null) — does NOT throw.
 */
export async function awaitSafeSession(
  supabaseClient: {
    auth: { getSession: () => Promise<{ data: { session: unknown } }> };
  },
  opts: { maxMs?: number; intervalMs?: number } = {},
): Promise<unknown | null> {
  const maxMs = opts.maxMs ?? (hasRecentOAuthStart() || hasOAuthCallbackPayload() ? 10_000 : 1_500);
  const intervalMs = opts.intervalMs ?? 200;
  const start = Date.now();
  while (true) {
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data?.session) return data.session;
    } catch {
      // ignore transient errors — caller decides what to do on null
    }
    if (Date.now() - start >= maxMs) return null;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

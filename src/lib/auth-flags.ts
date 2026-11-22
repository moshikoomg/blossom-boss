// Google sign-in needs the Google provider enabled in Supabase Auth.
// Until then the Google buttons are hidden, and Google calls go to the
// email + password form at /auth. Set VITE_GOOGLE_AUTH_ENABLED=true in
// .env.production once the provider is on.
export const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";

/** Same-origin path (with query) to continue to after login, or null. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    if (u.pathname.startsWith("/auth")) return null;
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

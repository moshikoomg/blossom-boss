import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import {
  awaitSafeSession,
  clearOAuthStart,
  hasOpenOnboardingParam,
  markOAuthStart,
  publishedUrl,
  shouldUsePublishedOAuth,
} from "@/lib/oauth-flow";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "כניסה" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  // If a Google-authenticated user lands here (e.g. via a stale link),
  // skip re-auth entirely and forward them to admin — their session is
  // already valid, no need to make them sign in again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // If we explicitly came here for onboarding (or returned to /auth with
      // ?openOnboarding=1 after Google), bounce to the landing onboarding flow
      // instead of forcing /admin.
      if (hasOpenOnboardingParam()) {
        window.location.replace("/?openOnboarding=1");
        return;
      }
      // Wait briefly for a session to land (post-OAuth hydration) before
      // showing the login form, so we don't ask an authenticated user to log
      // in again on a transient null read.
      const session = await awaitSafeSession(supabase);
      if (!cancelled && session) {
        clearOAuthStart();
        // Authenticated, but maybe no store yet. Check memberships; if none,
        // send them to onboarding rather than to the "no admin role" gate.
        try {
          const { data: u } = await supabase.auth.getUser();
          if (u.user) {
            const { data: memberships } = await supabase
              .from("store_members")
              .select("store_id")
              .eq("user_id", u.user.id)
              .limit(1);
            if (!memberships || memberships.length === 0) {
              window.location.replace("/?openOnboarding=1");
              return;
            }
          }
        } catch {
          /* fall through to /admin — the admin gate will handle it */
        }
        navigate({ to: "/admin", replace: true });
      }
    })();
    // Also flip to /admin the moment a session lands (e.g. inline OAuth).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        clearOAuthStart();
        if (hasOpenOnboardingParam()) {
          window.location.replace("/?openOnboarding=1");
        } else {
          navigate({ to: "/admin", replace: true });
        }
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setLoading(true);
    const fn = mode === "in"
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    const { error } = await fn;
    setLoading(false);
    if (error) { setErr(error.message); return; }
    navigate({ to: "/admin" });
  }

  async function googleSignIn() {
    setErr(""); setLoading(true);
    // Preview/live editor OAuth can return to a different sandbox origin and
    // look like a sign-out loop. Always complete Google auth on the public app.
    if (shouldUsePublishedOAuth()) {
      try {
        window.open(publishedUrl("/auth"), "_blank", "noopener");
      } catch {
        setErr("פתח את האתר הפומבי בכרטיסייה חדשה כדי להתחבר");
      }
      setLoading(false);
      return;
    }
    try {
      markOAuthStart("/admin");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/admin",
      });
      if ((result as { error?: { message?: string } }).error) {
        const msg = (result as { error?: { message?: string } }).error?.message;
        setErr(msg || "ההתחברות עם Google נכשלה. נסה שוב.");
        setLoading(false);
        return;
      }
      if ((result as { redirected?: boolean }).redirected) return;
      // Inline-token path (no full redirect) — force the navigation.
      navigate({ to: "/admin", replace: true });
    } catch (e) {
      console.warn("[auth] google signin failed", e);
      setErr("ההתחברות עם Google נכשלה. נסה שוב.");
      setLoading(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-card rounded-3xl border border-border p-8 shadow-[var(--shadow-soft)] space-y-4">
        <h1 className="text-2xl font-black text-foreground text-center">{mode === "in" ? "כניסה" : "הרשמה"}</h1>
        <p className="text-sm text-muted-foreground text-center">כניסת מנהלים ושליחים</p>
        {err && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">{err}</div>}
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="אימייל" className="w-full bg-background border border-input rounded-xl px-4 py-3 outline-none focus:border-primary" />
        <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="סיסמה" className="w-full bg-background border border-input rounded-xl px-4 py-3 outline-none focus:border-primary" />
        <button disabled={loading} type="submit" className="w-full bg-primary text-primary-foreground font-black py-3 rounded-xl hover:bg-primary/90 disabled:opacity-50">
          {loading ? "..." : mode === "in" ? "כניסה" : "צור חשבון"}
        </button>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="flex-1 h-px bg-border"/>או<div className="flex-1 h-px bg-border"/></div>
        <button type="button" onClick={googleSignIn} disabled={loading} className="w-full bg-card border border-border text-foreground font-bold py-3 rounded-xl hover:bg-accent flex items-center justify-center gap-2">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C41.2 35.7 44 30.3 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          המשך עם Google
        </button>
        <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="w-full text-sm text-muted-foreground hover:text-foreground">
          {mode === "in" ? "אין לך חשבון? הרשמה" : "כבר רשום? כניסה"}
        </button>
      </form>
    </div>
  );
}

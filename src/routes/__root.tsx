import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import appCss from "../styles.css?url";
import { CartProvider } from "@/lib/cart";
import { Toaster } from "@/components/ui/sonner";
import { AccessibilityWidget } from "@/components/AccessibilityWidget";
import { useRouterState } from "@tanstack/react-router";
import { FlyLayer } from "@/lib/fly-to-cart";
import { SitePopups } from "@/lib/popups";
import { CookieConsent } from "@/components/CookieConsent";
import { ThemeLoader, THEME_PREHYDRATE_SCRIPT } from "@/lib/theme-loader";
import { StoreProvider, STORE_PREHYDRATE_SCRIPT, setSupabaseStoreHeader } from "@/lib/store-context";
import { StoreHead } from "@/components/StoreHead";
import { OnboardingSequencer } from "@/components/OnboardingSequencer";
import { awaitSafeSession, hasOpenOnboardingParam } from "@/lib/oauth-flow";

function NotFoundComponent() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">הדף לא נמצא</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          ייתכן שהקישור שגוי או שהדף הועבר.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            לדף הבית
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          הדף לא נטען
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          משהו השתבש אצלנו. אפשר לנסות שוב או לחזור לדף הבית.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            לנסות שוב
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            לדף הבית
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#2f7a4a" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
    scripts: [],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: STORE_PREHYDRATE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_PREHYDRATE_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthLifecycle />
      <GlobalErrorSoftener />
      <StoreProvider>
        <CartProvider>
          <Outlet />
          <ThemeLoader />
          <StoreHead />
          <Toaster position="top-center" richColors duration={1400} closeButton={false} />
          <AccessibilityGate />
          <FlyLayer />
          <StorefrontOnly>
            <SitePopups />
            <CookieConsent />
            <OnboardingSequencer />
          </StorefrontOnly>
        </CartProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
}

function AuthLifecycle() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Only react to identity-changing events. INITIAL_SESSION and
      // TOKEN_REFRESHED fire on every mount / ~hourly and would otherwise
      // thrash router + query cache right after a Google OAuth return,
      // which can look like "Lovable signed me out".
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") {
        return;
      }
      if (event === "SIGNED_OUT") {
        try {
          localStorage.removeItem("tmm_store_override");
          localStorage.removeItem("tmm_current_store");
          localStorage.removeItem("tmm_current_store_id");
        } catch {}
        setSupabaseStoreHeader(null);
      }
      router.invalidate();
      // On sign-out the cleared session would 401-storm the refetch — skip.
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

/** Shopper-facing overlays stay off the admin, super-admin and sign-in screens. */
function isBackOffice(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/super-admin") || pathname.startsWith("/auth");
}
function StorefrontOnly({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return isBackOffice(pathname) ? null : <>{children}</>;
}

function AccessibilityGate() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Accessibility widget is for end-customers on the storefront only.
  // Hide it inside admin / super-admin / auth flows.
  if (pathname.startsWith("/admin") || pathname.startsWith("/super-admin") || pathname.startsWith("/auth")) {
    return null;
  }
  return <AccessibilityWidget />;
}

/**
 * Soft global error handler.
 *
 * Catches unhandled promise rejections and runtime errors (typical sources:
 * Supabase fetches, server-fn calls, third-party SDKs) and decides what to do:
 *   - HTTP 401 / explicit "JWT expired" → the session is truly dead, push the
 *     user to /auth so they can sign in again.
 *   - Anything else (403 RLS denials, network timeouts, transient errors) →
 *     show a friendly toast and leave the user exactly where they are.
 *
 * This replaces the previous behaviour where any caught error in admin/settings
 * pages could destroy the session and bounce the user to login.
 */
function GlobalErrorSoftener() {
  useEffect(() => {
    const looksLike401 = (err: unknown): boolean => {
      if (!err || typeof err !== "object") return false;
      const anyErr = err as { status?: number; statusCode?: number; code?: string | number; message?: string };
      if (anyErr.status === 401 || anyErr.statusCode === 401) return true;
      if (anyErr.code === 401 || anyErr.code === "401") return true;
      const msg = String(anyErr.message ?? "").toLowerCase();
      return msg.includes("jwt expired") || msg.includes("invalid jwt");
    };

    const handle = async (err: unknown) => {
      if (looksLike401(err)) {
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
          // NEVER bounce to /auth while onboarding is requested — the user is
          // mid-flow and a stale 401 from a background fetch must not destroy it.
          if (hasOpenOnboardingParam()) {
            console.warn("[global-error] ignored 401 — onboarding flow in progress", err);
            return;
          }
          // Give the session a moment to hydrate before deciding it's truly gone
          // (Google OAuth return + tab focus often produce a brief null window).
          const session = await awaitSafeSession(supabase, { maxMs: 1_500 });
          if (!session) {
            // Authenticated user without a store should NOT be sent to /auth —
            // route them to onboarding. Unauthenticated users go to /auth.
            const { data } = await supabase.auth
              .getUser()
              .catch(() => ({ data: { user: null } as any }));
            if (data.user) {
              console.warn("[global-error] ignored stale 401 — user is valid", err);
              return;
            }
            toast.error("פג תוקף החיבור — נדרשת התחברות מחדש");
            window.location.assign("/auth");
          } else {
            console.warn("[global-error] ignored stale auth error while session is valid", err);
            // Silent: noisy toast on transient 401 was itself part of the loop UX.
          }
        }
        return;
      }
      const msg = String((err as any)?.message ?? "");
      // Skip noisy benign errors (e.g. ResizeObserver loop warnings).
      if (msg.includes("ResizeObserver")) return;
      console.warn("[global-error]", err);
      toast.error("אירעה שגיאה — נשארת בעמוד. נסה שוב");
    };

    const onRejection = (e: PromiseRejectionEvent) => handle(e.reason);
    const onError = (e: ErrorEvent) => handle(e.error ?? e.message);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}

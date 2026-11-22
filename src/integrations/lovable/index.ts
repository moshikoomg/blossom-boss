// Compatibility shim: this used to call Lovable's hosted OAuth broker.
// It now uses Supabase Auth's native OAuth (configure Google in Supabase
// Dashboard -> Authentication -> Providers). Callers keep the same API.
import { supabase } from "../supabase/client";
import { GOOGLE_AUTH_ENABLED, safeNextPath } from "@/lib/auth-flags";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple" | "microsoft" | "lovable", opts?: SignInOptions) => {
      if (!GOOGLE_AUTH_ENABLED && typeof window !== "undefined") {
        // Google provider not enabled yet: use the email + password form.
        const next = safeNextPath(opts?.redirect_uri);
        window.location.assign("/auth" + (next ? "?next=" + encodeURIComponent(next) : ""));
        return { redirected: true as const, url: "/auth" };
      }
      const mapped = provider === "microsoft" ? "azure" : provider === "lovable" ? "google" : provider;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: mapped as "google" | "apple" | "azure",
        options: {
          redirectTo: opts?.redirect_uri,
          queryParams: opts?.extraParams,
        },
      });
      if (error) return { error, redirected: false as const };
      return { redirected: true as const, url: data.url };
    },
  },
};

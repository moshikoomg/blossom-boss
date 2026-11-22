import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * The standalone `/onboarding` page has been retired — the wizard now lives
 * inside a Dialog on the landing page. This route exists only as a safety
 * net for stale links, deep-link bookmarks, and external referrers.
 */
export const Route = createFileRoute("/onboarding")({
  component: OnboardingRedirect,
  head: () => ({
    meta: [
      { title: "התחלת עבודה — Blossom Boss" },
      {
        name: "description",
        content: "פותח חנות פרחים בשתי לחיצות — בלי טפסים, בלי קוד.",
      },
    ],
  }),
});

function OnboardingRedirect() {
  // Plain window redirect avoids TanStack's JSON-quoted search serialization
  // (which produced `?openOnboarding=%221%22` and prevented the dialog opening).
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.location.replace("/?openOnboarding=1");
    }
  }, []);
  return null;
}

import { useEffect } from "react";
import { useStore } from "@/lib/store-context";

import { PUBLIC_APP_ORIGIN } from "@/lib/oauth-flow";

const PLATFORM_HOST = new URL(PUBLIC_APP_ORIGIN).host;
const PLATFORM_TITLE = "Blossom Boss — פלטפורמת המסחר למשתלות וחנויות פרחים";
const PLATFORM_DESC = "פלטפורמת SaaS לבניית חנות פרחים מקצועית בדקות.";

function setMeta(selector: string, attr: string, attrValue: string, content: string) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  if (typeof document === "undefined") return;
  let link = document.head.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

/**
 * Single source of truth for the page title and OG metadata.
 *
 * Why imperative + MutationObserver:
 *   TanStack Router's <HeadContent /> reconciles head tags on every navigation
 *   based on each route's `head()` output. Some routes set a static title
 *   (e.g. admin) that would otherwise leak across stores on the platform host.
 *   This component owns the title at runtime and re-applies it whenever
 *   something else mutates the <title> node.
 */
export function StoreHead() {
  const { store } = useStore();

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const url = new URL(window.location.href);
    const host = window.location.hostname.toLowerCase();
    let hasOverride = !!url.searchParams.get("store");
    try {
      hasOverride = hasOverride || !!localStorage.getItem("tmm_store_override");
    } catch {}
    const isPlatform = host === PLATFORM_HOST && !hasOverride;

    const desiredTitle = isPlatform
      ? PLATFORM_TITLE
      : (store?.name?.trim() || PLATFORM_TITLE);
    const desiredDesc = isPlatform
      ? PLATFORM_DESC
      : ((store as any)?.description?.trim?.() || PLATFORM_DESC);
    const canonical = `${window.location.origin}${window.location.pathname}`;

    const apply = () => {
      if (document.title !== desiredTitle) document.title = desiredTitle;
      setMeta("meta[property='og:title']", "property", "og:title", desiredTitle);
      setMeta("meta[property='og:description']", "property", "og:description", desiredDesc);
      setMeta("meta[name='description']", "name", "description", desiredDesc);
      setCanonical(canonical);
    };

    apply();

    // Guard: if HeadContent re-writes <title> during navigation/hydration,
    // restore our value immediately.
    const titleEl = document.querySelector("title");
    if (!titleEl) return;
    const observer = new MutationObserver(() => {
      if (document.title !== desiredTitle) document.title = desiredTitle;
    });
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [store?.id, store?.name, (store as any)?.description]);

  return null;
}

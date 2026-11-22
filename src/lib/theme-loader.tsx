import { useEffect } from "react";
import { useStore, type StoreTheme } from "@/lib/store-context";

type ThemeColors = StoreTheme;

const KEYS: Array<[keyof ThemeColors, string]> = [
  ["primary", "--primary"],
  ["primary_foreground", "--primary-foreground"],
  ["secondary", "--secondary"],
  ["accent", "--accent"],
  ["background", "--background"],
  ["foreground", "--foreground"],
];

const LS_KEY = "tmm_theme_colors";

/** Read the preview ptheme override from the URL, if present.
 * The platform landing's demo flow sends visitors to
 * `/?store=<template>&preview=1&ptheme=<base64>`; in that mode the live
 * preview MUST reflect the colors the visitor picked, NOT the template
 * store's saved theme. Otherwise the brand mint-green silently becomes
 * whatever the template store happens to have in DB. */
function readPreviewTheme(): ThemeColors | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("preview") !== "1") return null;
    const raw = url.searchParams.get("ptheme");
    if (!raw) return null;
    const json = decodeURIComponent(escape(atob(raw)));
    return JSON.parse(json) as ThemeColors;
  } catch {
    return null;
  }
}

/** Applies the current store's theme to documentElement as CSS variables. */
export function ThemeLoader() {
  const { store } = useStore();
  useEffect(() => {
    if (!store) return;
    // Preview override wins — the visitor's picked colors must render in
    // the live preview iframe, even though the underlying store row is the
    // shared template.
    const preview = readPreviewTheme();
    const v = (preview || store.theme || {}) as ThemeColors;
    applyThemeColors(v);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(v));
    } catch {}
    // NOTE: document.title is owned by <StoreHead /> (single source of truth).
    // We only update favicon here.
    if (typeof document !== "undefined") {
      const iconUrl = store.favicon_url || store.logo_url || "";
      if (iconUrl) {
        for (const rel of ["icon", "shortcut icon", "apple-touch-icon"]) {
          let link = document.querySelector(`link[rel='${rel}']`) as HTMLLinkElement | null;
          if (!link) {
            link = document.createElement("link");
            link.rel = rel;
            document.head.appendChild(link);
          }
          link.href = iconUrl;
        }
      }
      // Sync the browser chrome / PWA theme-color with the store's primary color.
      const primary = v.primary;
      if (primary) {
        let meta = document.querySelector("meta[name='theme-color']") as HTMLMetaElement | null;
        if (!meta) {
          meta = document.createElement("meta");
          meta.name = "theme-color";
          document.head.appendChild(meta);
        }
        meta.content = primary;
      }
    }
  }, [store]);
  return null;
}

export function applyThemeColors(v: ThemeColors) {
  if (typeof document === "undefined") return;
  for (const [k, css] of KEYS) {
    const val = v[k];
    if (val) document.documentElement.style.setProperty(css, val);
  }
}

/** Inline script: apply cached theme colors before first paint to avoid FOUC. */
export const THEME_PREHYDRATE_SCRIPT = `(function(){try{var v=JSON.parse(localStorage.getItem('${LS_KEY}')||'null');if(!v)return;var m={primary:'--primary',primary_foreground:'--primary-foreground',secondary:'--secondary',accent:'--accent',background:'--background',foreground:'--foreground'};for(var k in m){if(v[k])document.documentElement.style.setProperty(m[k],v[k]);}}catch(e){}})();`;

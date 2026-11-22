import { PLATFORM_TEMPLATE_STORE_ID } from "@/lib/platform-template";

export function isLazyPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URL(window.location.href).searchParams.get("preview") === "1";
  } catch {
    return false;
  }
}

export function previewCatalogStoreId(): string | null {
  return isLazyPreviewMode() ? PLATFORM_TEMPLATE_STORE_ID : null;
}

export function getStorefrontUrlSignature(): string {
  if (typeof window === "undefined") return "";
  try {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    return ["preview", "store", "pname", "pcity", "ptheme"]
      .map((key) => `${key}=${params.get(key) || ""}`)
      .join("&");
  } catch {
    return "";
  }
}

export function getPreviewDisplayName(fallback: string): string {
  if (!isLazyPreviewMode() || typeof window === "undefined") return fallback;
  try {
    return new URL(window.location.href).searchParams.get("pname")?.trim() || fallback;
  } catch {
    return fallback;
  }
}

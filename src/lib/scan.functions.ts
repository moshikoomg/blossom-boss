import { supabase } from "@/integrations/supabase/client";

export interface DiscoveredProduct {
  name: string;
  price?: number | string;
  image_url?: string;
  description?: string;
  images?: string[];
  price_variations?: Array<{ label: string; price: number | string; original_price?: number | string | null }>;
  addons?: Array<{ name: string; price?: number | string; image_url?: string | null }>;
  category?: string | null;
}

export interface DiscoveredPalette {
  primary?: string;
  secondary?: string;
  bg?: string;
  [k: string]: string | undefined;
}

export interface DiscoveredSite {
  title: string;
  url: string;
  favicon?: string | null;
  snippet?: string | null;
  phone_match?: boolean;
}

export interface DiscoveredAddon {
  name: string;
  price?: number | string;
  image_url?: string | null;
}

export interface DiscoveredWorkingHour {
  day: string;
  open?: string | null;
  close?: string | null;
  closed?: boolean;
  note?: string | null;
}

export interface ScanRow {
  id: string;
  scan_token: string;
  source_url: string;
  status: "pending" | "scanning" | "ready" | "failed";
  discovered_phone: string | null;
  discovered_business_name: string | null;
  discovered_logo_url: string | null;
  discovered_palette: DiscoveredPalette;
  discovered_products: DiscoveredProduct[];
  discovered_categories: string[];
  discovered_sites?: DiscoveredSite[];
  discovered_addons?: DiscoveredAddon[];
  discovered_working_hours?: DiscoveredWorkingHour[];
  store_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Fetch wrapper with an AbortController-based timeout. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 25_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(t);
  }
}

export interface StartScanInput {
  business_name?: string;
  phone?: string | null;
  source_url?: string;
  mode?: "search" | "url";
}

/** Kick off a scan via Make.com. Returns the scan token to track progress. */
export async function startScan(
  input: StartScanInput | string,
  phone?: string | null,
): Promise<{ scan_token: string; scan_failed?: boolean; reason?: string; make_status?: number; make_body?: string }> {
  const body: Record<string, unknown> =
    typeof input === "string"
      ? { source_url: input, phone: phone ?? null }
      : { ...input };
  const res = await fetchWithTimeout("/api/public/start-scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let detail = txt;
    try {
      const j = JSON.parse(txt) as {
        error?: string;
        make_status?: number;
        make_body?: string;
      };
      detail = `${j.error ?? "error"}${
        j.make_status ? ` (make ${j.make_status})` : ""
      }${j.make_body ? `: ${j.make_body}` : ""}`;
    } catch {
      /* keep raw txt */
    }
    throw new Error(`start-scan failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function sendOtp(
  scan_token: string,
  channel: "whatsapp" | "sms" = "sms",
  phone?: string,
): Promise<void> {
  const res = await fetchWithTimeout("/api/public/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scan_token, channel, phone }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`send-otp failed (${res.status}): ${txt}`);
  }
}

/**
 * Fire-and-forget the heavy Firecrawl + Gemini scrape. The browser keeps
 * the request in flight even though we don't await the response, so the
 * server completes the work normally. The wizard polls `lead_scans` to
 * learn when the scan is ready.
 */
export function runScrapeInBackground(scan_token: string, source_url: string): void {
  void fetch("/api/public/run-scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scan_token, source_url }),
    keepalive: true,
  }).catch((err) => {
    console.warn("runScrapeInBackground: fetch failed", err);
  });
}

export async function verifyOtp(
  scan_token: string,
  code: string,
): Promise<{ ok: true }> {
  const res = await fetchWithTimeout("/api/public/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scan_token, code }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`verify-otp failed (${res.status}): ${txt}`);
  }
  return res.json();
}

/** Fetch a scan row by token via the secure RPC (no auth required). */
export async function getScanByToken(scan_token: string): Promise<ScanRow | null> {
  const { data, error } = await supabase.rpc("get_scan_by_token", {
    p_token: scan_token,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  const raw = row as Record<string, unknown>;
  return {
    ...row,
    discovered_palette: (row.discovered_palette ?? {}) as unknown as DiscoveredPalette,
    discovered_products: (row.discovered_products ?? []) as unknown as DiscoveredProduct[],
    discovered_categories: (row.discovered_categories ?? []) as unknown as string[],
    discovered_sites: (raw.discovered_sites ?? []) as unknown as DiscoveredSite[],
    discovered_addons: (raw.discovered_addons ?? []) as unknown as DiscoveredAddon[],
    discovered_working_hours: (raw.discovered_working_hours ?? []) as unknown as DiscoveredWorkingHour[],
  } as ScanRow;
}

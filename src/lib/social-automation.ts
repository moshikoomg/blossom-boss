/**
 * Premium social automation — Phase 5 future-expansion stubs.
 *
 * This module is intentionally inert. It defines the types and unlock
 * helpers that the Pro/Business tier will use to schedule automated
 * posts to external social channels (Facebook groups, Instagram,
 * WhatsApp broadcast). No real publishing happens here yet — only the
 * contract surface so future wiring can drop into a stable shape.
 */
import { supabase } from "@/integrations/supabase/client";

export type SocialChannel =
  | "facebook_group"
  | "instagram"
  | "whatsapp_broadcast";

export type SocialSchedule = {
  channel: SocialChannel;
  /** 1-31. If omitted with `weekday`, runs weekly. */
  dayOfMonth?: number;
  /** 0-6, Sun=0. */
  weekday?: number;
  /** 0-23, store-local time. */
  hour?: number;
  /** Optional product to feature in the auto-post. */
  productId?: string;
};

/** Always returns false until the feature flag ships in `store_features`. */
export async function isSocialAutomationUnlocked(storeId: string): Promise<boolean> {
  if (!storeId) return false;
  try {
    const { data } = await supabase
      .from("store_features")
      .select("enabled, expires_at")
      .eq("store_id", storeId)
      .eq("feature_key", "social_automation")
      .maybeSingle();
    if (!data?.enabled) return false;
    if (data.expires_at && new Date(data.expires_at) <= new Date()) return false;
    return true;
  } catch {
    return false;
  }
}

/** Stub — wire to a server function once the publisher integrations exist. */
export async function scheduleSocialPost(_schedule: SocialSchedule): Promise<{ ok: boolean }> {
  console.warn("[social-automation] scheduleSocialPost stub — feature locked");
  return { ok: false };
}

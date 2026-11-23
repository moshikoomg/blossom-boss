import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// The owner's guided setup: a short tour of the admin, then styling the
// storefront, then putting products on the shelves. Saved per store in
// site_settings ("owner_setup") so it continues on any device.
export type SetupStep = "tour" | "front" | "products" | "done";
export const SETUP_STEPS: { id: Exclude<SetupStep, "done">; label: string }[] = [
  { id: "tour", label: "היכרות" },
  { id: "front", label: "עיצוב החזית" },
  { id: "products", label: "מוצרים למדפים" },
];
export const SETUP_EVENT = "tmm:owner-setup";
const KEY = "owner_setup";
const isStep = (v: unknown): v is SetupStep =>
  v === "tour" || v === "front" || v === "products" || v === "done";

export function stepIndex(s: SetupStep) {
  return s === "done" ? SETUP_STEPS.length : SETUP_STEPS.findIndex((x) => x.id === s);
}

export async function saveSetupStep(storeId: string, step: SetupStep) {
  window.dispatchEvent(new CustomEvent(SETUP_EVENT, { detail: { storeId, step } }));
  await supabase
    .from("site_settings")
    .upsert({ store_id: storeId, key: KEY, value: step as never }, { onConflict: "store_id,key" });
}

/** Current setup step for a store. Stores made before this flow count as done. */
export function useSetupStep(storeId: string | null | undefined) {
  const [step, setStep] = useState<SetupStep | null>(null);
  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    void supabase
      .from("site_settings")
      .select("value")
      .eq("store_id", storeId)
      .eq("key", KEY)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const v = (data as { value?: unknown } | null)?.value;
        setStep(isStep(v) ? v : "done");
      });
    const onEvt = (e: Event) => {
      const d = (e as CustomEvent<{ storeId: string; step: SetupStep }>).detail;
      if (d?.storeId === storeId) setStep(d.step);
    };
    window.addEventListener(SETUP_EVENT, onEvt);
    return () => {
      cancelled = true;
      window.removeEventListener(SETUP_EVENT, onEvt);
    };
  }, [storeId]);
  const update = useCallback(
    async (next: SetupStep) => {
      setStep(next);
      if (storeId) await saveSetupStep(storeId, next);
    },
    [storeId],
  );
  return [step, update] as const;
}

// Storefront mode for the owner: "edit" shows the editing tools, "view" is
// exactly what customers see. Kept for the browser tab only.
export type OwnerMode = "edit" | "view";
const MODE_KEY = "tmm_owner_mode";
export function readOwnerMode(): OwnerMode | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("edit") === "1") return "edit";
    if (url.searchParams.get("view") === "1") return "view";
    const v = sessionStorage.getItem(MODE_KEY);
    return v === "edit" || v === "view" ? v : null;
  } catch {
    return null;
  }
}
export function writeOwnerMode(m: OwnerMode) {
  try {
    sessionStorage.setItem(MODE_KEY, m);
  } catch {
    /* storage blocked */
  }
}

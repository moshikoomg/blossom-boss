import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";

export type PlanFeature = {
  id: string;
  key: string;
  name: string;
  description: string;
  monthly_price: number;
  currency: string;
  category: string;
  display_order: number;
};

export type StoreFeatureRow = {
  feature_key: string;
  enabled: boolean;
  expires_at: string | null;
};

export type FeatureView = PlanFeature & {
  enabled: boolean;
  expires_at: string | null;
};

export type StoreSubscription = {
  plan_key: string;
  status: string;
  current_period_end: string | null;
};

export function useStoreFeatures() {
  const { store } = useStore();
  const storeId = store?.id ?? null;

  return useQuery({
    queryKey: ["store-features", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      if (!storeId) return { features: [] as FeatureView[], subscription: null };
      const [feats, mine, sub] = await Promise.all([
        supabase.from("plan_features").select("*").eq("active", true).order("display_order"),
        supabase.from("store_features").select("feature_key,enabled,expires_at").eq("store_id", storeId),
        supabase.from("store_subscriptions").select("plan_key,status,current_period_end").eq("store_id", storeId).maybeSingle(),
      ]);
      const list = (feats.data || []) as PlanFeature[];
      const map = new Map<string, StoreFeatureRow>();
      for (const r of (mine.data || []) as StoreFeatureRow[]) map.set(r.feature_key, r);
      const view: FeatureView[] = list.map((f) => {
        const m = map.get(f.key);
        const notExpired = !m?.expires_at || new Date(m.expires_at) > new Date();
        return {
          ...f,
          enabled: !!m?.enabled && notExpired,
          expires_at: m?.expires_at ?? null,
        };
      });
      return {
        features: view,
        subscription: (sub.data ?? null) as StoreSubscription | null,
      };
    },
    staleTime: 60_000,
  });
}

export function hasFeature(view: FeatureView[] | undefined, key: string): boolean {
  return !!view?.find((f) => f.key === key && f.enabled);
}

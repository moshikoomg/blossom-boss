import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MarketplaceStore = {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo_url: string;
  primary_domain: string | null;
  theme: Record<string, string> | null;
  products: { id: string; name: string; image_url: string; price: number }[];
};

export const getMarketplacePreview = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ stores: MarketplaceStore[] }> => {
    const { data: stores } = await supabaseAdmin
      .from("stores")
      .select("id,name,slug,description,logo_url,primary_domain,theme")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(12);

    const list = (stores ?? []) as any[];
    if (list.length === 0) return { stores: [] };

    const ids = list.map((s) => s.id);
    const { data: prods } = await supabaseAdmin
      .from("products")
      .select("id,name,image_url,price,store_id,display_order")
      .in("store_id", ids)
      .eq("active", true)
      .order("display_order");

    const grouped: Record<string, MarketplaceStore["products"]> = {};
    for (const p of (prods ?? []) as any[]) {
      (grouped[p.store_id] ||= []).push({
        id: p.id,
        name: p.name,
        image_url: p.image_url,
        price: Number(p.price),
      });
    }

    return {
      stores: list.map((s) => ({
        ...s,
        products: (grouped[s.id] || []).slice(0, 6),
      })),
    };
  },
);

export const getStorePreview = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ storeId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: store } = await supabaseAdmin
      .from("stores")
      .select("id,name,slug,description,logo_url,primary_domain,theme")
      .eq("id", data.storeId)
      .maybeSingle();
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id,name,image_url,price,original_price,badge")
      .eq("store_id", data.storeId)
      .eq("active", true)
      .order("display_order")
      .limit(6);
    return { store, products: products ?? [] };
  });

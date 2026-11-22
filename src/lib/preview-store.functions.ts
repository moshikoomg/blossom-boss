import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  store_id: z.string().uuid(),
});

export type PreviewProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  image_url: string | null;
  rating: number | null;
  stock: number | null;
  category_id: string | null;
  display_order: number | null;
};

export type PreviewCategory = {
  id: string;
  name: string;
};

export type PreviewStore = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  theme: Record<string, string> | null;
  contact_phone: string | null;
  whatsapp_business: string | null;
};

export type PreviewBundle = {
  store: PreviewStore | null;
  categories: PreviewCategory[];
  products: PreviewProduct[];
};

/**
 * Public, auth-free fetcher for the post-onboarding storefront preview.
 * Uses the admin client so anonymous visitors can render their freshly
 * created store without hitting any login gate or RLS surprise.
 * Only safe, public columns are projected.
 */
export const getPreviewBundle = createServerFn({ method: "GET" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<PreviewBundle> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: store }, { data: categories }, { data: products }] = await Promise.all([
      supabaseAdmin
        .from("stores")
        .select("id,name,slug,logo_url,theme,contact_phone,whatsapp_business")
        .eq("id", data.store_id)
        .maybeSingle(),
      supabaseAdmin
        .from("categories")
        .select("id,name")
        .eq("store_id", data.store_id)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("products")
        .select("id,name,description,price,original_price,image_url,rating,stock,category_id,display_order")
        .eq("store_id", data.store_id)
        .eq("active", true)
        .order("display_order", { ascending: true })
        .limit(200),
    ]);

    return {
      store: (store as PreviewStore | null) ?? null,
      categories: (categories as PreviewCategory[] | null) ?? [],
      products: (products as PreviewProduct[] | null) ?? [],
    };
  });

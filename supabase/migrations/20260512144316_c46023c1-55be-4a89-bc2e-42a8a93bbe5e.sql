-- Multi-category support per product
CREATE TABLE IF NOT EXISTS public.product_categories (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_categories readable by everyone"
  ON public.product_categories FOR SELECT USING (true);

CREATE POLICY "product_categories admins can insert"
  ON public.product_categories FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "product_categories admins can delete"
  ON public.product_categories FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "product_categories admins can update"
  ON public.product_categories FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_product_categories_category ON public.product_categories(category_id);

-- Backfill from existing single category_id
INSERT INTO public.product_categories (product_id, category_id)
SELECT id, category_id FROM public.products
WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;

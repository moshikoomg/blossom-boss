DROP POLICY IF EXISTS "anon can read current store products" ON public.products;
CREATE POLICY "anon can read current store products"
ON public.products
AS PERMISSIVE
FOR SELECT
TO anon
USING (store_id = public.current_store_id() AND active = true);

DROP POLICY IF EXISTS "anon can read current store categories" ON public.categories;
CREATE POLICY "anon can read current store categories"
ON public.categories
AS PERMISSIVE
FOR SELECT
TO anon
USING (store_id = public.current_store_id() AND active = true);

DROP POLICY IF EXISTS "anon can read current store hero slides" ON public.hero_slides;
CREATE POLICY "anon can read current store hero slides"
ON public.hero_slides
AS PERMISSIVE
FOR SELECT
TO anon
USING (store_id = public.current_store_id() AND active = true);

DROP POLICY IF EXISTS "anon can read current store popups" ON public.site_popups;
CREATE POLICY "anon can read current store popups"
ON public.site_popups
AS PERMISSIVE
FOR SELECT
TO anon
USING (store_id = public.current_store_id() AND active = true);

DROP POLICY IF EXISTS "anon can read current store legal documents" ON public.legal_documents;
CREATE POLICY "anon can read current store legal documents"
ON public.legal_documents
AS PERMISSIVE
FOR SELECT
TO anon
USING (store_id = public.current_store_id());

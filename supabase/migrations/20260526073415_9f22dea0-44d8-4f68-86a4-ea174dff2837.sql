
-- PRODUCTS: when impersonation header is set, admin sees only that store.
DROP POLICY IF EXISTS "store-scoped read products" ON public.products;
CREATE POLICY "store-scoped read products" ON public.products
FOR SELECT TO public
USING (
  (store_id = current_store_id())
  OR (current_store_id() IS NULL AND has_role(auth.uid(), 'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);

DROP POLICY IF EXISTS "store-scoped manage products" ON public.products;
CREATE POLICY "store-scoped manage products" ON public.products
FOR ALL TO authenticated
USING (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
)
WITH CHECK (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);

-- CATEGORIES
DROP POLICY IF EXISTS "store-scoped read categories" ON public.categories;
CREATE POLICY "store-scoped read categories" ON public.categories
FOR SELECT TO public
USING (
  (store_id = current_store_id())
  OR (current_store_id() IS NULL AND has_role(auth.uid(), 'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);
DROP POLICY IF EXISTS "store-scoped manage categories" ON public.categories;
CREATE POLICY "store-scoped manage categories" ON public.categories
FOR ALL TO authenticated
USING (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
)
WITH CHECK (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);

-- ADD_ONS
DROP POLICY IF EXISTS "store-scoped read addons" ON public.add_ons;
CREATE POLICY "store-scoped read addons" ON public.add_ons
FOR SELECT TO public
USING (
  (store_id = current_store_id())
  OR (current_store_id() IS NULL AND has_role(auth.uid(), 'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);
DROP POLICY IF EXISTS "store-scoped manage addons" ON public.add_ons;
CREATE POLICY "store-scoped manage addons" ON public.add_ons
FOR ALL TO authenticated
USING (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
)
WITH CHECK (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);

-- SITE_SETTINGS
DROP POLICY IF EXISTS "store-scoped read settings" ON public.site_settings;
CREATE POLICY "store-scoped read settings" ON public.site_settings
FOR SELECT TO public
USING (
  (store_id = current_store_id())
  OR (current_store_id() IS NULL AND has_role(auth.uid(), 'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);
DROP POLICY IF EXISTS "store-scoped manage settings" ON public.site_settings;
CREATE POLICY "store-scoped manage settings" ON public.site_settings
FOR ALL TO authenticated
USING (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
)
WITH CHECK (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);

-- HERO SLIDES
DROP POLICY IF EXISTS "store-scoped read hero_slides" ON public.hero_slides;
CREATE POLICY "store-scoped read hero_slides" ON public.hero_slides
FOR SELECT TO public
USING (
  (store_id = current_store_id())
  OR (current_store_id() IS NULL AND has_role(auth.uid(), 'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);
DROP POLICY IF EXISTS "store-scoped manage hero_slides" ON public.hero_slides;
CREATE POLICY "store-scoped manage hero_slides" ON public.hero_slides
FOR ALL TO authenticated
USING (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
)
WITH CHECK (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);

-- SITE_POPUPS
DROP POLICY IF EXISTS "store-scoped read popups" ON public.site_popups;
CREATE POLICY "store-scoped read popups" ON public.site_popups
FOR SELECT TO public
USING (
  (store_id = current_store_id())
  OR (current_store_id() IS NULL AND has_role(auth.uid(), 'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);
DROP POLICY IF EXISTS "store-scoped manage popups" ON public.site_popups;
CREATE POLICY "store-scoped manage popups" ON public.site_popups
FOR ALL TO authenticated
USING (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
)
WITH CHECK (
  (current_store_id() IS NOT NULL AND store_id = current_store_id() AND has_role(auth.uid(),'admin'::app_role))
  OR (current_store_id() IS NULL AND has_role(auth.uid(),'admin'::app_role))
  OR is_store_member(store_id, auth.uid())
);

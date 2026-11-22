-- Public read for the platform template store across catalog/content tables.
-- Template store id is hardcoded via public.platform_template_store_id().

-- stores: template store has active=false, so existing "active=true" policy hides it.
CREATE POLICY "anyone reads template store"
ON public.stores FOR SELECT TO anon, authenticated
USING (id = public.platform_template_store_id());

-- products
CREATE POLICY "anyone reads template products"
ON public.products FOR SELECT TO anon, authenticated
USING (store_id = public.platform_template_store_id() AND active = true);

-- categories
CREATE POLICY "anyone reads template categories"
ON public.categories FOR SELECT TO anon, authenticated
USING (store_id = public.platform_template_store_id() AND active = true);

-- hero_slides
CREATE POLICY "anyone reads template hero_slides"
ON public.hero_slides FOR SELECT TO anon, authenticated
USING (store_id = public.platform_template_store_id() AND active = true);

-- site_popups
CREATE POLICY "anyone reads template popups"
ON public.site_popups FOR SELECT TO anon, authenticated
USING (store_id = public.platform_template_store_id() AND active = true);

-- site_settings
CREATE POLICY "anyone reads template settings"
ON public.site_settings FOR SELECT TO anon, authenticated
USING (store_id = public.platform_template_store_id());

-- legal_documents
CREATE POLICY "anyone reads template legal"
ON public.legal_documents FOR SELECT TO anon, authenticated
USING (store_id = public.platform_template_store_id());

-- add_ons
CREATE POLICY "anyone reads template addons"
ON public.add_ons FOR SELECT TO anon, authenticated
USING (store_id = public.platform_template_store_id() AND active = true);

-- product_images (child of products)
CREATE POLICY "anyone reads template product images"
ON public.product_images FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_images.product_id
    AND p.store_id = public.platform_template_store_id()
));

-- product_sizes (child of products)
CREATE POLICY "anyone reads template product sizes"
ON public.product_sizes FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.id = product_sizes.product_id
    AND p.store_id = public.platform_template_store_id()
));

-- addon_images (child of add_ons)
CREATE POLICY "anyone reads template addon images"
ON public.addon_images FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.add_ons a
  WHERE a.id = addon_images.addon_id
    AND a.store_id = public.platform_template_store_id()
));


-- 1) Tighten cross-tenant reads on child catalog tables (product_sizes, product_images, addon_images)
DROP POLICY IF EXISTS "anyone reads product sizes" ON public.product_sizes;
CREATE POLICY "store-scoped reads product sizes" ON public.product_sizes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_sizes.product_id
        AND (
          p.store_id = public.current_store_id()
          OR public.is_store_member(p.store_id, auth.uid())
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

DROP POLICY IF EXISTS "anyone reads product images" ON public.product_images;
CREATE POLICY "store-scoped reads product images" ON public.product_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id
        AND (
          p.store_id = public.current_store_id()
          OR public.is_store_member(p.store_id, auth.uid())
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

DROP POLICY IF EXISTS "anyone reads addon images" ON public.addon_images;
CREATE POLICY "store-scoped reads addon images" ON public.addon_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.add_ons a
      WHERE a.id = addon_images.addon_id
        AND (
          a.store_id = public.current_store_id()
          OR public.is_store_member(a.store_id, auth.uid())
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

-- 2) Hide store owner PII (contact_email, owner_user_id) from anonymous public reads.
--    Authenticated members/admins still get full access via existing policies and authenticated grants.
--    contact_phone + whatsapp_business remain readable since they are intentionally surfaced in the public storefront footer.
REVOKE SELECT ON public.stores FROM anon;
GRANT SELECT (
  id, slug, name, description, primary_domain, extra_domains,
  active, plan, logo_url, favicon_url, theme,
  contact_phone, whatsapp_business, created_at, updated_at
) ON public.stores TO anon;

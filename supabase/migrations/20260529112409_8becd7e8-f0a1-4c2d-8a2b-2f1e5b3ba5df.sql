
-- 1) Fix stores PII exposure to anon: column-level grants
REVOKE SELECT ON public.stores FROM anon;
GRANT SELECT (id, slug, name, description, primary_domain, extra_domains, active, plan, logo_url, favicon_url, whatsapp_business, contact_phone, theme, created_at, updated_at)
  ON public.stores TO anon;

-- 2) store_members: let store owners read co-members and manage team
DROP POLICY IF EXISTS "store members read team" ON public.store_members;
CREATE POLICY "store members read team"
  ON public.store_members FOR SELECT TO authenticated
  USING (is_store_member(store_id, auth.uid()));

DROP POLICY IF EXISTS "store owners insert members" ON public.store_members;
CREATE POLICY "store owners insert members"
  ON public.store_members FOR INSERT TO authenticated
  WITH CHECK (is_store_member(store_id, auth.uid()));

DROP POLICY IF EXISTS "store owners delete members" ON public.store_members;
CREATE POLICY "store owners delete members"
  ON public.store_members FOR DELETE TO authenticated
  USING (is_store_member(store_id, auth.uid()) AND user_id <> auth.uid());

-- 3) Storage: let store members manage product-images, store-assets, site-assets
--    (excluding protected template/ paths in product-images)
CREATE OR REPLACE FUNCTION public.user_has_any_store(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.store_members WHERE user_id = _user_id);
$$;

DROP POLICY IF EXISTS "store members upload product-images" ON storage.objects;
CREATE POLICY "store members upload product-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.user_has_any_store(auth.uid())
    AND name NOT LIKE 'template/%'
  );

DROP POLICY IF EXISTS "store members update product-images" ON storage.objects;
CREATE POLICY "store members update product-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.user_has_any_store(auth.uid())
    AND name NOT LIKE 'template/%'
  );

DROP POLICY IF EXISTS "store members delete product-images" ON storage.objects;
CREATE POLICY "store members delete product-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.user_has_any_store(auth.uid())
    AND name NOT LIKE 'template/%'
  );

DROP POLICY IF EXISTS "store members upload store-assets" ON storage.objects;
CREATE POLICY "store members upload store-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'store-assets' AND public.user_has_any_store(auth.uid()));

DROP POLICY IF EXISTS "store members update store-assets" ON storage.objects;
CREATE POLICY "store members update store-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'store-assets' AND public.user_has_any_store(auth.uid()));

DROP POLICY IF EXISTS "store members delete store-assets" ON storage.objects;
CREATE POLICY "store members delete store-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'store-assets' AND public.user_has_any_store(auth.uid()));

DROP POLICY IF EXISTS "store members upload site-assets" ON storage.objects;
CREATE POLICY "store members upload site-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-assets' AND public.user_has_any_store(auth.uid()));

DROP POLICY IF EXISTS "store members update site-assets" ON storage.objects;
CREATE POLICY "store members update site-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'site-assets' AND public.user_has_any_store(auth.uid()));

DROP POLICY IF EXISTS "store members delete site-assets" ON storage.objects;
CREATE POLICY "store members delete site-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-assets' AND public.user_has_any_store(auth.uid()));

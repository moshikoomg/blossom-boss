
-- 1. Remove lead_scans from realtime publication (sensitive OTP/phone data)
ALTER PUBLICATION supabase_realtime DROP TABLE public.lead_scans;

-- 2. Tighten product_categories SELECT policy
DROP POLICY IF EXISTS "product_categories readable by everyone" ON public.product_categories;
CREATE POLICY "product_categories readable per-store"
  ON public.product_categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_categories.product_id
        AND (
          p.active = true
          OR public.is_store_member(p.store_id, auth.uid())
          OR public.has_role(auth.uid(), 'admin'::app_role)
        )
    )
  );

-- 3. Hide PII columns on public.stores from anon and authenticated callers
REVOKE SELECT (contact_email, owner_user_id) ON public.stores FROM anon;
REVOKE SELECT (contact_email, owner_user_id) ON public.stores FROM authenticated;

-- Helper: full store row for admins or store owners (bypasses column grants)
CREATE OR REPLACE FUNCTION public.get_store_admin(_store_id uuid)
RETURNS SETOF public.stores
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.*
  FROM public.stores s
  WHERE s.id = _store_id
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.is_store_member(s.id, auth.uid())
    );
$$;
GRANT EXECUTE ON FUNCTION public.get_store_admin(uuid) TO authenticated;

-- 4. Storage: scope writes to the user's own store folder (path prefix <store_id>/)
DROP POLICY IF EXISTS "store members upload product-images" ON storage.objects;
DROP POLICY IF EXISTS "store members update product-images" ON storage.objects;
DROP POLICY IF EXISTS "store members delete product-images" ON storage.objects;
DROP POLICY IF EXISTS "store members upload site-assets"    ON storage.objects;
DROP POLICY IF EXISTS "store members update site-assets"    ON storage.objects;
DROP POLICY IF EXISTS "store members delete site-assets"    ON storage.objects;
DROP POLICY IF EXISTS "store members upload store-assets"   ON storage.objects;
DROP POLICY IF EXISTS "store members update store-assets"   ON storage.objects;
DROP POLICY IF EXISTS "store members delete store-assets"   ON storage.objects;

CREATE POLICY "store members upload product-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND name NOT LIKE 'template/%'
    AND EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.user_id = auth.uid()
        AND storage.objects.name LIKE sm.store_id::text || '/%'
    )
  );
CREATE POLICY "store members update product-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND name NOT LIKE 'template/%'
    AND EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.user_id = auth.uid()
        AND storage.objects.name LIKE sm.store_id::text || '/%'
    )
  );
CREATE POLICY "store members delete product-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND name NOT LIKE 'template/%'
    AND EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.user_id = auth.uid()
        AND storage.objects.name LIKE sm.store_id::text || '/%'
    )
  );

CREATE POLICY "store members upload site-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-assets'
    AND EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.user_id = auth.uid()
        AND storage.objects.name LIKE sm.store_id::text || '/%'
    )
  );
CREATE POLICY "store members update site-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'site-assets'
    AND EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.user_id = auth.uid()
        AND storage.objects.name LIKE sm.store_id::text || '/%'
    )
  );
CREATE POLICY "store members delete site-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'site-assets'
    AND EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.user_id = auth.uid()
        AND storage.objects.name LIKE sm.store_id::text || '/%'
    )
  );

CREATE POLICY "store members upload store-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-assets'
    AND EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.user_id = auth.uid()
        AND storage.objects.name LIKE sm.store_id::text || '/%'
    )
  );
CREATE POLICY "store members update store-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.user_id = auth.uid()
        AND storage.objects.name LIKE sm.store_id::text || '/%'
    )
  );
CREATE POLICY "store members delete store-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.user_id = auth.uid()
        AND storage.objects.name LIKE sm.store_id::text || '/%'
    )
  );

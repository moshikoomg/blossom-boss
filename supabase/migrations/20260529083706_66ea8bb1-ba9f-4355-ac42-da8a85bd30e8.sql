-- Protect platform template storage assets from accidental deletion.
-- Anything under product-images/template/* is system-owned and may only
-- be mutated by the service role (admin server functions).

DROP POLICY IF EXISTS "no delete platform template assets" ON storage.objects;
CREATE POLICY "no delete platform template assets"
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE
  TO public
  USING (
    NOT (bucket_id = 'product-images' AND name LIKE 'template/%')
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "no update platform template assets" ON storage.objects;
CREATE POLICY "no update platform template assets"
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO public
  USING (
    NOT (bucket_id = 'product-images' AND name LIKE 'template/%')
    OR auth.role() = 'service_role'
  );

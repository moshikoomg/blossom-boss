
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-assets', 'store-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "store-assets public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'store-assets');

CREATE POLICY "store-assets admin upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'store-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "store-assets admin update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'store-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "store-assets admin delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'store-assets' AND public.has_role(auth.uid(), 'admin'));

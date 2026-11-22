DROP POLICY IF EXISTS "anyone creates orders" ON public.orders;
CREATE POLICY "anyone creates orders into active stores"
ON public.orders
FOR INSERT
WITH CHECK (
  store_id = current_store_id()
  AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.active = true)
);

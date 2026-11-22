
-- order_items: require the parent order to exist
DROP POLICY IF EXISTS "anyone insert order_items" ON public.order_items;
CREATE POLICY "insert order_items for existing order"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id)
);

-- order_status_history: only admins can insert directly; the SECURITY DEFINER
-- trigger (owned by postgres) bypasses RLS so logging still works.
DROP POLICY IF EXISTS "system inserts history" ON public.order_status_history;
CREATE POLICY "admins insert order history"
ON public.order_status_history
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

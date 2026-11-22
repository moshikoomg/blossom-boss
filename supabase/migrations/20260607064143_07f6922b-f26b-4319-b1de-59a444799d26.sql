
-- store_members: restrict INSERT/DELETE/UPDATE to actual owners, validate role
DROP POLICY IF EXISTS "store owners insert members" ON public.store_members;
DROP POLICY IF EXISTS "store owners delete members" ON public.store_members;
DROP POLICY IF EXISTS "store owners update members" ON public.store_members;

CREATE POLICY "store owners insert members"
ON public.store_members
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.store_members sm
    WHERE sm.store_id = store_members.store_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'owner'
  )
  AND role IN ('owner','manager','staff')
);

CREATE POLICY "store owners delete members"
ON public.store_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.store_members sm
    WHERE sm.store_id = store_members.store_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'owner'
  )
  AND user_id <> auth.uid()
);

CREATE POLICY "store owners update members"
ON public.store_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.store_members sm
    WHERE sm.store_id = store_members.store_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'owner'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.store_members sm
    WHERE sm.store_id = store_members.store_id
      AND sm.user_id = auth.uid()
      AND sm.role = 'owner'
  )
  AND role IN ('owner','manager','staff')
);

-- order_items: only allow inserts into pending orders of current store
DROP POLICY IF EXISTS "insert order_items for current store order" ON public.order_items;

CREATE POLICY "insert order_items for current store order"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.store_id = current_store_id()
      AND COALESCE(o.status, 'pending') = 'pending'
  )
);

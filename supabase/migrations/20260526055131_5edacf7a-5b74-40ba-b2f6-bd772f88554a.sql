-- Allow store members (owners/staff) to insert order status history rows
-- for orders belonging to their store, and allow couriers assigned to the order.
CREATE POLICY "store members insert order history"
ON public.order_status_history
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_status_history.order_id
      AND (
        public.is_store_member(o.store_id, auth.uid())
        OR o.courier_id = public.user_courier_id(auth.uid())
      )
  )
);

-- Also allow store members and the assigned courier to read history
-- for orders in their scope, so the audit trail is visible.
CREATE POLICY "store members read order history"
ON public.order_status_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_status_history.order_id
      AND (
        public.is_store_member(o.store_id, auth.uid())
        OR o.courier_id = public.user_courier_id(auth.uid())
      )
  )
);

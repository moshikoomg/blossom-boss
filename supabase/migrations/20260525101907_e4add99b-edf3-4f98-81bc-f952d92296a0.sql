
-- 1) coupon_usages: drop public insert, add SECURITY DEFINER helper
DROP POLICY IF EXISTS "anyone insert usage" ON public.coupon_usages;

CREATE OR REPLACE FUNCTION public.record_coupon_usage(
  _coupon_id uuid,
  _order_id uuid,
  _user_email text,
  _discount_amount numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _store_id uuid;
  _new_id uuid;
BEGIN
  -- Order must exist and belong to the current store header
  SELECT o.store_id INTO _store_id
  FROM public.orders o
  WHERE o.id = _order_id
    AND o.store_id = public.current_store_id();
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'invalid order for current store';
  END IF;

  -- Coupon must belong to same store and be active
  IF NOT EXISTS (
    SELECT 1 FROM public.coupons c
    WHERE c.id = _coupon_id AND c.store_id = _store_id AND c.active = true
  ) THEN
    RAISE EXCEPTION 'invalid coupon';
  END IF;

  INSERT INTO public.coupon_usages (coupon_id, order_id, user_email, discount_amount, store_id)
  VALUES (_coupon_id, _order_id, _user_email, COALESCE(_discount_amount, 0), _store_id)
  RETURNING id INTO _new_id;

  UPDATE public.coupons SET used_count = used_count + 1 WHERE id = _coupon_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_coupon_usage(uuid, uuid, text, numeric) TO anon, authenticated;

-- 2) order_items: require parent order to belong to the current store
DROP POLICY IF EXISTS "insert order_items for existing order" ON public.order_items;

CREATE POLICY "insert order_items for current store order"
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.store_id = public.current_store_id()
  )
);

-- 3) store_members: only platform admins can manage memberships
DROP POLICY IF EXISTS "admins manage members" ON public.store_members;

CREATE POLICY "platform admins manage members"
ON public.store_members
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

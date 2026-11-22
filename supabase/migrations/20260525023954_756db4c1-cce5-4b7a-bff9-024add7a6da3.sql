
-- 1. COUPONS: remove public SELECT, keep admin/store-member access
DROP POLICY IF EXISTS "store-scoped read coupons" ON public.coupons;
CREATE POLICY "admins and staff read coupons"
ON public.coupons
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_store_member(store_id, auth.uid())
);

-- 2. COURIER_LOCATIONS: drop "anyone read locations" (always-true)
DROP POLICY IF EXISTS "anyone read locations" ON public.courier_locations;
CREATE POLICY "scoped read courier locations"
ON public.courier_locations
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR courier_id = user_courier_id(auth.uid())
);

-- 3. COURIERS: tighten SELECT (no anon, no current_store_id)
DROP POLICY IF EXISTS "store-scoped read couriers" ON public.couriers;
CREATE POLICY "admins staff and self read couriers"
ON public.couriers
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_store_member(store_id, auth.uid())
  OR auth.uid() = user_id
);

-- 4. CUSTOMER_TAGS: admin/staff only
DROP POLICY IF EXISTS "store-scoped read tags" ON public.customer_tags;
CREATE POLICY "admins and staff read customer tags"
ON public.customer_tags
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_store_member(store_id, auth.uid())
);

-- 5. PRICING_RULES: admin/staff only
DROP POLICY IF EXISTS "store-scoped read pricing" ON public.pricing_rules;
CREATE POLICY "admins and staff read pricing rules"
ON public.pricing_rules
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_store_member(store_id, auth.uid())
);

-- 6. Function search_path hardening
ALTER FUNCTION public.current_store_id() SET search_path = public;
ALTER FUNCTION public.default_store_id() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- 7. Lock down SECURITY DEFINER function EXECUTE grants.
-- Helpers used only inside RLS / triggers — revoke from clients entirely.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_store_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_courier_for_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_courier_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;

-- Admin-only RPCs — only authenticated callers (function still self-checks admin role).
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.top_products(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.top_products(integer, integer) TO authenticated;

-- validate_coupon must remain callable by anon (guest checkout).
REVOKE ALL ON FUNCTION public.validate_coupon(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO anon, authenticated;

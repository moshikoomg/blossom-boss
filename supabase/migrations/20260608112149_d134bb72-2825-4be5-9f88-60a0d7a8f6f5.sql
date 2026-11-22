-- Restrict coupon_usages SELECT (which exposes customer emails) to store
-- owners and managers only, not staff. Platform admins keep full access.
DROP POLICY IF EXISTS "store-scoped read usage" ON public.coupon_usages;
CREATE POLICY "owners and managers read coupon usages"
ON public.coupon_usages
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.store_members sm
    WHERE sm.store_id = coupon_usages.store_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner','manager')
  )
);

-- Allow store owners/managers to read their own billing tokens (no payment
-- secrets are exposed beyond brand/last4/expiry already stored). Without
-- this, the only read path is the service role, which is server-only.
CREATE POLICY "owners and managers read billing tokens"
ON public.billing_tokens
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.store_members sm
    WHERE sm.store_id = billing_tokens.store_id
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner','manager')
  )
);

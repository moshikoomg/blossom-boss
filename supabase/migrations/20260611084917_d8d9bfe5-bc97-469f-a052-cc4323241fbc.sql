
-- Helper: is the user an owner or manager of the store?
CREATE OR REPLACE FUNCTION public.is_store_manager(_store_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_members
    WHERE store_id = _store_id
      AND user_id = _user_id
      AND role IN ('owner','manager')
  );
$$;

-- 1) Couriers: tighten SELECT — staff can no longer read other couriers' PII.
DROP POLICY IF EXISTS "admins staff and self read couriers" ON public.couriers;
CREATE POLICY "couriers read self or managers"
ON public.couriers
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR public.is_store_manager(store_id, auth.uid())
);

-- Manage policy also tightened so only owners/managers/admins write couriers
DROP POLICY IF EXISTS "store-scoped manage couriers" ON public.couriers;
CREATE POLICY "managers manage couriers"
ON public.couriers
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR public.is_store_manager(store_id, auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR public.is_store_manager(store_id, auth.uid())
);

-- 2) site_settings: restrict the header-driven public read to a whitelist of
-- known-safe storefront keys. Any future sensitive key (payment secrets,
-- API tokens) is invisible to anonymous callers even if they spoof x-store-id.
DROP POLICY IF EXISTS "store-scoped read settings" ON public.site_settings;
CREATE POLICY "public reads safe storefront settings"
ON public.site_settings
FOR SELECT
USING (
  is_store_member(store_id, auth.uid())
  OR (
    store_id = current_store_id()
    AND key IN (
      'delivery_info','free_shipping_threshold',
      'hero_badge','hero_image','hero_subtitle','hero_title',
      'logo_url','operating_hours','platform_default_catalog',
      'primary_color','shipping_cost','shipping_zones',
      'store_address','store_city','store_email','store_hours',
      'store_lat','store_lng','store_name','store_phone',
      'store_tagline','store_website',
      'theme_accent','theme_colors','theme_primary',
      'whatsapp_business'
    )
  )
);

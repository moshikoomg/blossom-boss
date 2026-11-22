-- QA fixes (2026-11-22)

-- 1) top_products() is SECURITY DEFINER with no store filter: any signed-in user
--    could read every store's best sellers and revenue. Nothing in the app calls it.
REVOKE EXECUTE ON FUNCTION public.top_products(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.top_products(integer, integer) TO service_role;

-- 2) One subscription row per store. With two rows, .maybeSingle() fails, the
--    billing state falls back to "none" and the soft lock never kicks in.
CREATE UNIQUE INDEX IF NOT EXISTS store_subscriptions_store_id_key
  ON public.store_subscriptions (store_id);

-- 3) The checkout page shows the shop's delivery price, but the public settings
--    whitelist had "shipping_cost" while the app stores "shipping_price".
--    Customers saw ₪25 and were charged the real price.
DROP POLICY IF EXISTS "public reads safe storefront settings" ON public.site_settings;
CREATE POLICY "public reads safe storefront settings" ON public.site_settings
  FOR SELECT TO public
  USING (
    is_store_member(store_id, auth.uid())
    OR (
      store_id = current_store_id()
      AND key = ANY (ARRAY[
        'delivery_info','free_shipping_threshold','hero_badge','hero_image','hero_subtitle','hero_title',
        'logo_url','operating_hours','platform_default_catalog','primary_color','shipping_cost','shipping_price',
        'shipping_zones','store_address','store_city','store_email','store_hours','store_lat','store_lng',
        'store_name','store_phone','store_tagline','store_website','theme_accent','theme_colors','theme_primary',
        'whatsapp_business'
      ])
    )
  );

-- 4) Store members could change billing/ownership columns on their own store row
--    (plan, owner_user_id). Only platform admins and the server may change them.
CREATE OR REPLACE FUNCTION public.guard_store_protected_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT has_role(auth.uid(), 'admin') THEN
    IF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
      RAISE EXCEPTION 'only platform admins can change plan or owner' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.guard_store_protected_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS stores_guard_protected_columns ON public.stores;
CREATE TRIGGER stores_guard_protected_columns
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.guard_store_protected_columns();

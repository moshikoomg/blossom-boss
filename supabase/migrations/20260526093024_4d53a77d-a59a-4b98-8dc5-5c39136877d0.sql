
CREATE OR REPLACE FUNCTION public.assert_no_cross_store_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _other_store uuid;
BEGIN
  IF NEW.id IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format(
    'SELECT store_id FROM public.%I WHERE id = $1 AND store_id <> $2 LIMIT 1',
    TG_TABLE_NAME
  ) INTO _other_store USING NEW.id, NEW.store_id;
  IF _other_store IS NOT NULL THEN
    RAISE EXCEPTION
      'cross-store id collision on %.id=% (already owned by store %)',
      TG_TABLE_NAME, NEW.id, _other_store
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_no_cross_store_id ON public.products;
CREATE TRIGGER trg_products_no_cross_store_id
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.assert_no_cross_store_id();

DROP TRIGGER IF EXISTS trg_categories_no_cross_store_id ON public.categories;
CREATE TRIGGER trg_categories_no_cross_store_id
  BEFORE INSERT ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.assert_no_cross_store_id();

DROP TRIGGER IF EXISTS trg_add_ons_no_cross_store_id ON public.add_ons;
CREATE TRIGGER trg_add_ons_no_cross_store_id
  BEFORE INSERT ON public.add_ons
  FOR EACH ROW EXECUTE FUNCTION public.assert_no_cross_store_id();

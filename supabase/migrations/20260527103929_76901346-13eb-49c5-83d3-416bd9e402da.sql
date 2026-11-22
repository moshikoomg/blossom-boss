
DO $$
DECLARE
  tpl uuid := '11111111-1111-1111-1111-111111111111';
  gav uuid := '541ee37e-3d27-40e0-9b9a-12c603923fb7';
BEGIN
  -- Clear primary image_url on products
  UPDATE public.products SET image_url = '' WHERE store_id IN (tpl, gav);

  -- Clear primary image_url on add_ons
  UPDATE public.add_ons SET image_url = '' WHERE store_id IN (tpl, gav);

  -- Delete gallery rows (they all point to other store's storage files)
  DELETE FROM public.product_images
   WHERE product_id IN (SELECT id FROM public.products WHERE store_id IN (tpl, gav));

  DELETE FROM public.addon_images
   WHERE addon_id IN (SELECT id FROM public.add_ons WHERE store_id IN (tpl, gav));

  -- Clear category background images
  UPDATE public.categories SET bg_image_url = '' WHERE store_id IN (tpl, gav);

  -- Clear hero slide media for the cloned stores (template usually has none, but safe)
  UPDATE public.hero_slides SET media_url = '' WHERE store_id IN (tpl, gav);
END $$;

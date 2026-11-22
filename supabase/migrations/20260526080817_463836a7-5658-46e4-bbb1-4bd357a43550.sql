
-- Helper: drop any existing FK on a column then add ON DELETE CASCADE FK
DO $$
DECLARE
  r record;
  pairs text[][] := ARRAY[
    ARRAY['products','store_id','stores','id'],
    ARRAY['categories','store_id','stores','id'],
    ARRAY['add_ons','store_id','stores','id'],
    ARRAY['site_settings','store_id','stores','id'],
    ARRAY['hero_slides','store_id','stores','id'],
    ARRAY['site_popups','store_id','stores','id'],
    ARRAY['coupons','store_id','stores','id'],
    ARRAY['coupon_usages','store_id','stores','id'],
    ARRAY['popup_subscribers','store_id','stores','id'],
    ARRAY['customer_tags','store_id','stores','id'],
    ARRAY['pricing_rules','store_id','stores','id'],
    ARRAY['broadcasts','store_id','stores','id'],
    ARRAY['couriers','store_id','stores','id'],
    ARRAY['orders','store_id','stores','id'],
    ARRAY['legal_documents','store_id','stores','id'],
    ARRAY['store_members','store_id','stores','id'],
    ARRAY['store_subscriptions','store_id','stores','id'],
    ARRAY['store_features','store_id','stores','id'],
    ARRAY['billing_tokens','store_id','stores','id'],
    ARRAY['order_items','order_id','orders','id'],
    ARRAY['order_status_history','order_id','orders','id'],
    ARRAY['product_images','product_id','products','id'],
    ARRAY['product_sizes','product_id','products','id'],
    ARRAY['product_categories','product_id','products','id'],
    ARRAY['product_categories','category_id','categories','id'],
    ARRAY['addon_images','addon_id','add_ons','id']
  ];
  child_tbl text; child_col text; parent_tbl text; parent_col text;
  fk_name text;
BEGIN
  FOR i IN 1..array_length(pairs,1) LOOP
    child_tbl := pairs[i][1];
    child_col := pairs[i][2];
    parent_tbl := pairs[i][3];
    parent_col := pairs[i][4];

    -- Drop any existing FK on (child_tbl.child_col)
    FOR r IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema   = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name   = child_tbl
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = child_col
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', child_tbl, r.constraint_name);
    END LOOP;

    fk_name := child_tbl || '_' || child_col || '_fkey';
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE CASCADE',
      child_tbl, fk_name, child_col, parent_tbl, parent_col
    );
  END LOOP;
END $$;

-- Tenant isolation / RLS test. Runs in one transaction and rolls back.
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/db/tenant-isolation.sql
-- Exit code is non-zero if any check fails.
BEGIN;
CREATE TEMP TABLE qa_results(name text, ok boolean, detail text);
GRANT ALL ON qa_results TO anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp.act_as(_role text, _uid uuid, _store uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', _role)::text, true);
  PERFORM set_config('request.headers', CASE WHEN _store IS NULL THEN '{}' ELSE json_build_object('x-store-id', _store)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', _role);
END $$;

DO $$
DECLARE ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid(); us uuid:=gen_random_uuid();
        sa uuid; sb uuid; pb uuid; ob uuid; n int;
  PROCEDURE_OK boolean;
BEGIN
  INSERT INTO auth.users(id,email,aud,role) VALUES (ua,'qa-a@test.local','authenticated','authenticated'),(ub,'qa-b@test.local','authenticated','authenticated'),(us,'qa-staff@test.local','authenticated','authenticated');
  INSERT INTO stores(slug,name,owner_user_id,plan) VALUES('qa-a-'||left(ua::text,6),'QA A',ua,'trial') RETURNING id INTO sa;
  INSERT INTO stores(slug,name,owner_user_id,plan) VALUES('qa-b-'||left(ub::text,6),'QA B',ub,'trial') RETURNING id INTO sb;
  INSERT INTO store_members(store_id,user_id,role) VALUES(sa,ua,'owner'),(sb,ub,'owner'),(sa,us,'staff');
  INSERT INTO products(store_id,name,price,active) VALUES(sa,'A prod',100,true);
  INSERT INTO products(store_id,name,price,active) VALUES(sb,'B prod',200,true) RETURNING id INTO pb;
  INSERT INTO products(store_id,name,price,active) VALUES(sb,'B hidden',50,false);
  INSERT INTO orders(store_id,customer_name,customer_phone,delivery_address,subtotal,shipping,total,receipt_token) VALUES(sb,'cust b','0500000000','addr',200,25,225,gen_random_uuid()) RETURNING id INTO ob;
  INSERT INTO order_items(order_id,product_id,product_name,product_image,unit_price,quantity) VALUES(ob,pb,'B prod','',200,1);
  INSERT INTO store_subscriptions(store_id,plan_key,status,is_trial,trial_ends_at) VALUES(sb,'pro','trialing',true,now()+interval '20 days');
  INSERT INTO coupons(store_id,code,discount_type,discount_value) VALUES(sb,'BSECRET','percent',50);
  INSERT INTO site_settings(store_id,key,value) VALUES(sb,'shipping_price','40'::jsonb);

  -- ===== Owner of store A attacking store B =====
  PERFORM pg_temp.act_as('authenticated', ua, NULL);
  SELECT count(*) INTO n FROM products WHERE store_id=sb;          INSERT INTO qa_results VALUES('A cannot read B products', n=0, n::text);
  SELECT count(*) INTO n FROM orders WHERE store_id=sb;            INSERT INTO qa_results VALUES('A cannot read B orders', n=0, n::text);
  SELECT count(*) INTO n FROM order_items WHERE order_id=ob;       INSERT INTO qa_results VALUES('A cannot read B order items', n=0, n::text);
  SELECT count(*) INTO n FROM coupons WHERE store_id=sb;           INSERT INTO qa_results VALUES('A cannot read B coupons', n=0, n::text);
  SELECT count(*) INTO n FROM store_subscriptions WHERE store_id=sb; INSERT INTO qa_results VALUES('A cannot read B subscription', n=0, n::text);
  UPDATE products SET price=1 WHERE id=pb; GET DIAGNOSTICS n=ROW_COUNT; INSERT INTO qa_results VALUES('A cannot edit B product', n=0, n::text);
  UPDATE orders SET status='delivered' WHERE id=ob; GET DIAGNOSTICS n=ROW_COUNT; INSERT INTO qa_results VALUES('A cannot edit B order', n=0, n::text);
  DELETE FROM products WHERE id=pb; GET DIAGNOSTICS n=ROW_COUNT;    INSERT INTO qa_results VALUES('A cannot delete B product', n=0, n::text);
  UPDATE stores SET name='hacked' WHERE id=sb; GET DIAGNOSTICS n=ROW_COUNT; INSERT INTO qa_results VALUES('A cannot edit B store', n=0, n::text);
  UPDATE store_subscriptions SET is_trial=false WHERE store_id=sb; GET DIAGNOSTICS n=ROW_COUNT; INSERT INTO qa_results VALUES('A cannot edit B subscription', n=0, n::text);
  BEGIN INSERT INTO products(store_id,name,price) VALUES(sb,'evil',1); INSERT INTO qa_results VALUES('A cannot add product to B', false, 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('A cannot add product to B', true, SQLSTATE); END;
  BEGIN INSERT INTO store_members(store_id,user_id,role) VALUES(sb,ua,'owner'); INSERT INTO qa_results VALUES('A cannot join B team', false, 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('A cannot join B team', true, SQLSTATE); END;
  BEGIN INSERT INTO store_subscriptions(store_id,plan_key,status) VALUES(sa,'pro','active'); INSERT INTO qa_results VALUES('A cannot grant itself a paid plan', false, 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('A cannot grant itself a paid plan', true, SQLSTATE); END;
  BEGIN UPDATE stores SET plan='pro' WHERE id=sa; GET DIAGNOSTICS n=ROW_COUNT; INSERT INTO qa_results VALUES('A cannot change own stores.plan', n=0, n::text);
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('A cannot change own stores.plan', true, SQLSTATE); END;
  BEGIN INSERT INTO user_roles(user_id,role) VALUES(ua,'admin'); INSERT INTO qa_results VALUES('A cannot make itself platform admin', false, 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('A cannot make itself platform admin', true, SQLSTATE); END;
  BEGIN SELECT count(*) INTO n FROM top_products(30,50); INSERT INTO qa_results VALUES('A cannot read cross-store sales (top_products)', n=0, n::text||' rows');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO qa_results VALUES('A cannot read cross-store sales (top_products)', true, 'no execute'); END;
  BEGIN PERFORM get_user_id_by_email('qa-b@test.local'); INSERT INTO qa_results VALUES('A cannot look up users by email', false, 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('A cannot look up users by email', true, SQLSTATE); END;

  -- image uploads: own folder only
  BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('product-images', sa::text||'/rose.webp'); INSERT INTO qa_results VALUES('A can upload images to own folder', true, 'ok');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('A can upload images to own folder', false, SQLERRM); END;
  BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('product-images', sb::text||'/evil.webp'); INSERT INTO qa_results VALUES('A cannot upload images into B folder', false, 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('A cannot upload images into B folder', true, SQLSTATE); END;
  BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('product-images', 'template/evil.webp'); INSERT INTO qa_results VALUES('A cannot overwrite platform template images', false, 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('A cannot overwrite platform template images', true, SQLSTATE); END;

  -- ===== Staff member of A =====
  PERFORM pg_temp.act_as('authenticated', us, NULL);
  UPDATE store_members SET role='owner' WHERE user_id=us; GET DIAGNOSTICS n=ROW_COUNT; INSERT INTO qa_results VALUES('staff cannot promote self to owner', n=0, n::text);
  SELECT count(*) INTO n FROM products WHERE store_id=sa;          INSERT INTO qa_results VALUES('staff can work on own store products', n=1, n::text);
  SELECT count(*) INTO n FROM products WHERE store_id=sb;          INSERT INTO qa_results VALUES('staff cannot read other store', n=0, n::text);

  -- ===== Anonymous shopper on store B =====
  PERFORM pg_temp.act_as('anon', NULL, sb);
  SELECT count(*) INTO n FROM products WHERE store_id=sb;          INSERT INTO qa_results VALUES('shopper sees only active B products', n=1, n::text);
  SELECT count(*) INTO n FROM products WHERE store_id=sa;          INSERT INTO qa_results VALUES('shopper on B does not get A products', n=0, n::text);
  SELECT count(*) INTO n FROM orders;                              INSERT INTO qa_results VALUES('shopper cannot read orders', n=0, n::text);
  SELECT count(*) INTO n FROM coupons;                             INSERT INTO qa_results VALUES('shopper cannot list coupons', n=0, n::text);
  SELECT count(*) INTO n FROM store_subscriptions;                 INSERT INTO qa_results VALUES('shopper cannot read subscriptions', n=0, n::text);
  SELECT count(*) INTO n FROM site_settings WHERE key='shipping_price'; INSERT INTO qa_results VALUES('shopper can read the shop delivery price', n=1, n::text);
  BEGIN INSERT INTO orders(store_id,customer_name,customer_phone,delivery_address,subtotal,shipping,total) VALUES(sb,'x','0500000000','addr',1,0,1); INSERT INTO qa_results VALUES('shopper cannot insert an order directly (must use server checkout)', false, 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('shopper cannot insert an order directly (must use server checkout)', true, SQLSTATE); END;
  BEGIN PERFORM phase1_checkout(sb,'{}'::jsonb,'[]'::jsonb,null,'bit',null); INSERT INTO qa_results VALUES('shopper cannot call checkout RPC directly', false, 'allowed');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO qa_results VALUES('shopper cannot call checkout RPC directly', true, 'no execute');
            WHEN others THEN INSERT INTO qa_results VALUES('shopper cannot call checkout RPC directly', false, SQLERRM); END;
  SELECT count(*) INTO n FROM validate_coupon('BSECRET',100) v WHERE v.valid; INSERT INTO qa_results VALUES('coupon works in its own store', n=1, n::text);
  SELECT count(*) INTO n FROM get_order_receipt(ob, gen_random_uuid()); INSERT INTO qa_results VALUES('order tracking needs the secret token', n=0, n::text);

  -- shopper on store A must not be able to use B's coupon
  PERFORM pg_temp.act_as('anon', NULL, sa);
  SELECT count(*) INTO n FROM validate_coupon('BSECRET',100) v WHERE v.valid; INSERT INTO qa_results VALUES('B coupon does not work in A', n=0, n::text);
  EXECUTE 'RESET ROLE';
END $$;

-- ===== Server-side checkout pricing (service role) =====
DO $$
DECLARE s uuid; p uuid; a uuid; res jsonb; n int;
BEGIN
  INSERT INTO stores(slug,name) VALUES('qa-c-'||left(gen_random_uuid()::text,6),'QA C') RETURNING id INTO s;
  INSERT INTO products(store_id,name,price,active) VALUES(s,'Rose',100,true) RETURNING id INTO p;
  INSERT INTO add_ons(store_id,name,price,active) VALUES(s,'Card',10,true) RETURNING id INTO a;
  INSERT INTO product_sizes(product_id,label,price) VALUES(p,'XL',150);
  INSERT INTO site_settings(store_id,key,value) VALUES(s,'shipping_price','30'::jsonb);
  INSERT INTO coupons(store_id,code,discount_type,discount_value) VALUES(s,'TEN','percent',10);
  res := phase1_checkout(s, '{"name":"Dana","address":"Herzl 1, TLV","phone":"0501234567","email":"d@x.co"}'::jsonb,
           jsonb_build_array(jsonb_build_object('productId',p,'qty',2,'sizeLabel','XL','price',1,'extras',jsonb_build_array(jsonb_build_object('id',a,'qty',1)))),
           'ten','bit',NULL);
  -- (150+10)*2 = 320; 10% off = 32; +30 shipping = 318. Client "price":1 is ignored.
  INSERT INTO qa_results VALUES('checkout total computed on server', (res->>'total')::numeric=318, res->>'total');
  SELECT used_count INTO n FROM coupons WHERE store_id=s; INSERT INTO qa_results VALUES('coupon usage counted', n=1, n::text);
  BEGIN PERFORM phase1_checkout(s,'{"name":"Dana","address":"Herzl 1","phone":"0501234567","email":"d@x.co"}'::jsonb,
          jsonb_build_array(jsonb_build_object('productId',(SELECT id FROM products WHERE name='B prod' LIMIT 1),'qty',1)),NULL,'bit',NULL);
        INSERT INTO qa_results VALUES('checkout rejects another store product', false, 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('checkout rejects another store product', true, SQLERRM); END;
  BEGIN PERFORM phase1_checkout(s,'{"name":"Dana","address":"Herzl 1","phone":"0501234567","email":"d@x.co"}'::jsonb,
          jsonb_build_array(jsonb_build_object('productId',p,'qty',0)),NULL,'bit',NULL);
        INSERT INTO qa_results VALUES('checkout rejects qty 0', false, 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('checkout rejects qty 0', true, SQLERRM); END;
  BEGIN PERFORM phase1_checkout(s,'{"name":"Dana","address":"Herzl 1","phone":"0501234567","email":"d@x.co"}'::jsonb,
          jsonb_build_array(jsonb_build_object('productId',p,'qty',1,'sizeLabel','FAKE')),NULL,'bit',NULL);
        INSERT INTO qa_results VALUES('checkout rejects unknown size', false, 'allowed');
  EXCEPTION WHEN others THEN INSERT INTO qa_results VALUES('checkout rejects unknown size', true, SQLERRM); END;
END $$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, name, detail FROM qa_results ORDER BY ok, name;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM qa_results WHERE NOT ok) THEN RAISE EXCEPTION '% isolation check(s) failed', (SELECT count(*) FROM qa_results WHERE NOT ok); END IF; END $$;
ROLLBACK;

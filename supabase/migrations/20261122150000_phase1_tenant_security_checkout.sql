-- Phase 1: tenant security hardening + server-side checkout.
DROP POLICY IF EXISTS "anyone creates orders into active stores" ON public.orders;
DROP POLICY IF EXISTS "insert order_items for current store order" ON public.order_items;
DROP POLICY IF EXISTS "anyone subscribes" ON public.popup_subscribers;
DROP POLICY IF EXISTS "couriers update self" ON public.couriers;
CREATE POLICY "phase1 member order items" ON public.order_items FOR ALL TO authenticated USING (EXISTS(SELECT 1 FROM public.orders o WHERE o.id=order_id AND (is_store_member(o.store_id,auth.uid()) OR has_role(auth.uid(),'admin')))) WITH CHECK(EXISTS(SELECT 1 FROM public.orders o WHERE o.id=order_id AND (is_store_member(o.store_id,auth.uid()) OR has_role(auth.uid(),'admin'))));
CREATE POLICY "phase1 active store pricing" ON public.pricing_rules FOR SELECT TO anon,authenticated USING(store_id=current_store_id() AND active);
CREATE POLICY "phase1 pricing fence" ON public.pricing_rules AS RESTRICTIVE FOR SELECT TO public USING((store_id=current_store_id() AND active) OR is_store_member(store_id,auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "phase1 products fence" ON public.products AS RESTRICTIVE FOR SELECT TO public USING((store_id=current_store_id() AND active) OR is_store_member(store_id,auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "phase1 categories fence" ON public.categories AS RESTRICTIVE FOR SELECT TO public USING((store_id=current_store_id() AND active) OR is_store_member(store_id,auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "phase1 addons fence" ON public.add_ons AS RESTRICTIVE FOR SELECT TO public USING((store_id=current_store_id() AND active) OR is_store_member(store_id,auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "phase1 hero fence" ON public.hero_slides AS RESTRICTIVE FOR SELECT TO public USING((store_id=current_store_id() AND active) OR is_store_member(store_id,auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "phase1 popup fence" ON public.site_popups AS RESTRICTIVE FOR SELECT TO public USING((store_id=current_store_id() AND active) OR is_store_member(store_id,auth.uid()) OR has_role(auth.uid(),'admin'));
CREATE POLICY "phase1 member product images" ON public.product_images FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.products p WHERE p.id=product_id AND is_store_member(p.store_id,auth.uid()))) WITH CHECK(EXISTS(SELECT 1 FROM public.products p WHERE p.id=product_id AND is_store_member(p.store_id,auth.uid())));
CREATE POLICY "phase1 member product sizes" ON public.product_sizes FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.products p WHERE p.id=product_id AND is_store_member(p.store_id,auth.uid()))) WITH CHECK(EXISTS(SELECT 1 FROM public.products p WHERE p.id=product_id AND is_store_member(p.store_id,auth.uid())));
CREATE POLICY "phase1 member product categories" ON public.product_categories FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.products p WHERE p.id=product_id AND is_store_member(p.store_id,auth.uid()))) WITH CHECK(EXISTS(SELECT 1 FROM public.products p JOIN public.categories c ON c.id=category_id AND c.store_id=p.store_id WHERE p.id=product_id AND is_store_member(p.store_id,auth.uid())));
CREATE POLICY "phase1 member addon images" ON public.addon_images FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.add_ons p WHERE p.id=addon_id AND is_store_member(p.store_id,auth.uid()))) WITH CHECK(EXISTS(SELECT 1 FROM public.add_ons p WHERE p.id=addon_id AND is_store_member(p.store_id,auth.uid())));
CREATE FUNCTION public.phase1_asset_write(_bucket text,_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT _bucket NOT IN ('product-images','site-assets') OR (_name NOT LIKE 'template/%' AND ((has_role(auth.uid(),'admin') AND split_part(_name,'/',1)='admin') OR EXISTS(SELECT 1 FROM store_members sm WHERE sm.user_id=auth.uid() AND split_part(_name,'/',1)=sm.store_id::text))); $$;
CREATE POLICY "phase1 asset insert" ON storage.objects AS RESTRICTIVE FOR INSERT TO public WITH CHECK(public.phase1_asset_write(bucket_id,name));
CREATE POLICY "phase1 asset update" ON storage.objects AS RESTRICTIVE FOR UPDATE TO public USING(public.phase1_asset_write(bucket_id,name)) WITH CHECK(public.phase1_asset_write(bucket_id,name));
CREATE POLICY "phase1 asset delete" ON storage.objects AS RESTRICTIVE FOR DELETE TO public USING(public.phase1_asset_write(bucket_id,name));
ALTER TABLE public.orders ADD COLUMN receipt_token uuid;
CREATE OR REPLACE FUNCTION public.validate_coupon(_code text,_subtotal numeric) RETURNS TABLE(valid boolean,message text,discount numeric,coupon_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE c record; BEGIN
 SELECT * INTO c FROM public.coupons WHERE store_id=public.current_store_id() AND lower(code)=lower(_code) LIMIT 1;
 IF NOT FOUND THEN RETURN QUERY SELECT false,'הקופון אינו זמין'::text,0::numeric,NULL::uuid; RETURN; END IF;
 IF NOT c.active OR (c.starts_at IS NOT NULL AND c.starts_at>now()) OR (c.ends_at IS NOT NULL AND c.ends_at<now()) OR (c.max_uses IS NOT NULL AND c.used_count>=c.max_uses) OR _subtotal<c.min_order THEN RETURN QUERY SELECT false,'הקופון אינו זמין'::text,0::numeric,NULL::uuid; RETURN; END IF;
 RETURN QUERY SELECT true,'תקין'::text,CASE WHEN c.discount_type='percent' THEN LEAST(_subtotal,round(_subtotal*c.discount_value/100,2)) ELSE LEAST(c.discount_value,_subtotal) END,c.id;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_coupon_usage(uuid,uuid,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_coupon_usage(uuid,uuid,text,numeric) TO service_role;
CREATE FUNCTION public.phase1_checkout(_store uuid,_contact jsonb,_items jsonb,_coupon text,_payment text,_user uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it jsonb; ex jsonb; p record; a record; price numeric; extra numeric; subtotal numeric:=0; ship numeric:=25; d numeric:=0; c record; couponid uuid; couponcode text; oid uuid; token uuid:=gen_random_uuid(); num text; rows jsonb:='[]'::jsonb; normalized jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM stores WHERE id=_store AND active) OR jsonb_array_length(_items) NOT BETWEEN 1 AND 100 OR _payment NOT IN ('bit','credit') THEN RAISE EXCEPTION 'invalid checkout'; END IF;
 IF length(_contact->>'name')<2 OR length(_contact->>'address')<4 OR length(_contact->>'phone')<9 OR (_contact->>'email') NOT LIKE '%@%' THEN RAISE EXCEPTION 'invalid contact'; END IF;
 FOR it IN SELECT value FROM jsonb_array_elements(_items) LOOP
  SELECT * INTO p FROM products WHERE id=(it->>'productId')::uuid AND store_id=_store AND active;
  IF NOT FOUND OR (it->>'qty')::int NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid product'; END IF;
  price:=p.price;
  IF coalesce(it->>'sizeLabel','')<>'' THEN SELECT s.price INTO price FROM product_sizes s WHERE s.product_id=p.id AND s.label=it->>'sizeLabel' LIMIT 1; IF price IS NULL THEN RAISE EXCEPTION 'invalid size'; END IF; END IF;
  extra:=0; normalized:='[]'::jsonb;
  FOR ex IN SELECT value FROM jsonb_array_elements(coalesce(it->'extras','[]'::jsonb)) LOOP
   SELECT * INTO a FROM add_ons WHERE id=(ex->>'id')::uuid AND store_id=_store AND active;
   IF NOT FOUND OR coalesce((ex->>'qty')::int,1) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid addon'; END IF;
   extra:=extra+a.price*coalesce((ex->>'qty')::int,1); normalized:=normalized||jsonb_build_array(jsonb_build_object('id',a.id,'name',a.name,'price',a.price,'qty',coalesce((ex->>'qty')::int,1)));
  END LOOP;
  subtotal:=subtotal+(price+extra)*(it->>'qty')::int;
  rows:=rows||jsonb_build_array(jsonb_build_object('product_id',p.id,'product_name',p.name,'product_image',p.image_url,'unit_price',price,'quantity',(it->>'qty')::int,'extras',normalized,'card_text',left(coalesce(it->>'cardText',''),2000)));
 END LOOP;
 SELECT coalesce((value#>>'{}')::numeric,25) INTO ship FROM site_settings WHERE store_id=_store AND key='shipping_price'; ship:=greatest(0,coalesce(ship,25));
 IF coalesce(_coupon,'')<>'' THEN
  SELECT * INTO c FROM coupons WHERE store_id=_store AND lower(code)=lower(_coupon) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid coupon'; END IF;
  IF NOT c.active OR (c.starts_at IS NOT NULL AND c.starts_at>now()) OR (c.ends_at IS NOT NULL AND c.ends_at<now()) OR (c.max_uses IS NOT NULL AND c.used_count>=c.max_uses) OR subtotal<c.min_order THEN RAISE EXCEPTION 'invalid coupon'; END IF;
  d:=CASE WHEN c.discount_type='percent' THEN LEAST(subtotal,round(subtotal*c.discount_value/100,2)) ELSE LEAST(c.discount_value,subtotal) END; couponid:=c.id; couponcode:=c.code;
 END IF;
 INSERT INTO orders(store_id,user_id,customer_name,customer_phone,customer_email,delivery_address,delivery_notes,subtotal,shipping,total,discount,coupon_code,payment_method,payment_status,terms_accepted_at,receipt_token) VALUES(_store,_user,left(_contact->>'name',100),left(_contact->>'phone',20),left(_contact->>'email',255),left(_contact->>'address',255),left(_contact->>'notes',2000),subtotal,ship,subtotal-d+ship,d,couponcode,_payment,'pending',now(),token) RETURNING id,order_number INTO oid,num;
 INSERT INTO order_items(order_id,product_id,product_name,product_image,unit_price,quantity,extras,card_text) SELECT oid,x.product_id,x.product_name,coalesce(x.product_image,''),x.unit_price,x.quantity,x.extras,x.card_text FROM jsonb_to_recordset(rows) AS x(product_id uuid,product_name text,product_image text,unit_price numeric,quantity int,extras jsonb,card_text text);
 IF couponid IS NOT NULL THEN INSERT INTO coupon_usages(coupon_id,order_id,user_email,discount_amount,store_id) VALUES(couponid,oid,_contact->>'email',d,_store); UPDATE coupons SET used_count=used_count+1 WHERE id=couponid; END IF;
 RETURN jsonb_build_object('id',oid,'order_number',num,'receipt_token',token,'total',subtotal-d+ship);
END $$;
REVOKE ALL ON FUNCTION public.phase1_checkout(uuid,jsonb,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phase1_checkout(uuid,jsonb,jsonb,text,text,uuid) TO service_role;

-- Public order receipt lookup: requires the unguessable receipt_token.
CREATE OR REPLACE FUNCTION public.get_order_receipt(_order uuid, _token uuid)
RETURNS TABLE(order_number text, status text, total numeric, customer_name text, delivery_address text, payment_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.order_number, o.status::text, o.total, o.customer_name, o.delivery_address, o.payment_status
  FROM public.orders o
  WHERE o.id = _order AND o.receipt_token IS NOT NULL AND o.receipt_token = _token AND o.deleted_at IS NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_order_receipt(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_receipt(uuid, uuid) TO anon, authenticated, service_role;


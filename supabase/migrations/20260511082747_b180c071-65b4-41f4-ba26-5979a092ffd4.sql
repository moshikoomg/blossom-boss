
CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric NOT NULL DEFAULT 0,
  min_order numeric NOT NULL DEFAULT 0,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads coupons" ON public.coupons FOR SELECT USING (true);
CREATE POLICY "admins manage coupons" ON public.coupons FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER coupons_updated BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.coupon_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL,
  order_id uuid,
  user_email text,
  discount_amount numeric NOT NULL DEFAULT 0,
  used_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone insert usage" ON public.coupon_usages FOR INSERT WITH CHECK (true);
CREATE POLICY "admins read usage" ON public.coupon_usages FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TABLE public.popup_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text DEFAULT '',
  phone text DEFAULT '',
  source_popup_id uuid,
  marketing_opt_in boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(email)
);
ALTER TABLE public.popup_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone subscribes" ON public.popup_subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "admins read subscribers" ON public.popup_subscribers FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage subscribers" ON public.popup_subscribers FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'bit',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_to_whatsapp_at timestamptz,
  ADD COLUMN IF NOT EXISTS meshulam_transaction_id text,
  ADD COLUMN IF NOT EXISTS customer_email text;

CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _subtotal numeric)
RETURNS TABLE(valid boolean, message text, discount numeric, coupon_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.coupons;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE lower(code)=lower(_code) LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'קוד לא קיים', 0::numeric, NULL::uuid; RETURN; END IF;
  IF NOT c.active THEN RETURN QUERY SELECT false, 'הקופון אינו פעיל', 0::numeric, c.id; RETURN; END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > now() THEN RETURN QUERY SELECT false, 'הקופון עדיין לא פעיל', 0::numeric, c.id; RETURN; END IF;
  IF c.ends_at IS NOT NULL AND c.ends_at < now() THEN RETURN QUERY SELECT false, 'תוקף הקופון פג', 0::numeric, c.id; RETURN; END IF;
  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN RETURN QUERY SELECT false, 'הקופון נוצל במלואו', 0::numeric, c.id; RETURN; END IF;
  IF _subtotal < c.min_order THEN RETURN QUERY SELECT false, 'מינימום הזמנה ₪'||c.min_order, 0::numeric, c.id; RETURN; END IF;
  IF c.discount_type = 'percent' THEN
    RETURN QUERY SELECT true, 'תקין', round(_subtotal * c.discount_value / 100, 2), c.id;
  ELSE
    RETURN QUERY SELECT true, 'תקין', LEAST(c.discount_value, _subtotal), c.id;
  END IF;
END; $$;

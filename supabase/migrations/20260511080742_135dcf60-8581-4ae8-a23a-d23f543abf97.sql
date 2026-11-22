
-- 1. order status history
CREATE TABLE public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status order_status NOT NULL,
  changed_by UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read history" ON public.order_status_history FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "users read own history" ON public.order_status_history FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
);
CREATE POLICY "system inserts history" ON public.order_status_history FOR INSERT TO public WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_order_status_history AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

-- 2. site popups
CREATE TABLE public.site_popups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT DEFAULT '',
  bg_color TEXT NOT NULL DEFAULT '#ffffff',
  text_color TEXT NOT NULL DEFAULT '#111111',
  cta_label TEXT DEFAULT '',
  cta_url TEXT DEFAULT '',
  auto_close_seconds INTEGER,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.site_popups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads popups" ON public.site_popups FOR SELECT TO public USING (true);
CREATE POLICY "admins manage popups" ON public.site_popups FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_popups_updated BEFORE UPDATE ON public.site_popups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. pricing rules
CREATE TABLE public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  adjustment_type TEXT NOT NULL DEFAULT 'percent', -- 'percent' or 'amount'
  adjustment_value NUMERIC NOT NULL DEFAULT 0,
  scope TEXT NOT NULL DEFAULT 'all', -- 'all','category','product'
  scope_id UUID,
  weekdays INTEGER[] DEFAULT NULL, -- 0=sun..6=sat
  starts_at DATE,
  ends_at DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads pricing" ON public.pricing_rules FOR SELECT TO public USING (true);
CREATE POLICY "admins manage pricing" ON public.pricing_rules FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_pricing_updated BEFORE UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. broadcasts
CREATE TABLE public.broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'email', -- 'email','sms','both'
  audience TEXT NOT NULL DEFAULT 'customers', -- 'customers','couriers','admins','all'
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft','sent','failed'
  sent_count INTEGER NOT NULL DEFAULT 0,
  scheduled_for TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage broadcasts" ON public.broadcasts FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_broadcasts_updated BEFORE UPDATE ON public.broadcasts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. couriers email column for friendly display
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';

-- 6. RPC: find user_id by email (admin only)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
  RETURN _uid;
END; $$;

-- 7. RPC: list users with emails for admin (no UUIDs in UI)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(user_id UUID, email TEXT, created_at TIMESTAMPTZ, roles TEXT[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at,
    COALESCE(ARRAY(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = u.id), ARRAY[]::text[])
  FROM auth.users u
  ORDER BY u.created_at DESC;
END; $$;

-- 8. Storage policies for product-images and site-assets (admin upload)
CREATE POLICY "admin upload product-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND has_role(auth.uid(),'admin'));
CREATE POLICY "admin update product-images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete product-images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND has_role(auth.uid(),'admin'));
CREATE POLICY "anyone read product-images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'product-images');

CREATE POLICY "admin upload site-assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-assets' AND has_role(auth.uid(),'admin'));
CREATE POLICY "admin update site-assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'site-assets' AND has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete site-assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'site-assets' AND has_role(auth.uid(),'admin'));
CREATE POLICY "anyone read site-assets" ON storage.objects FOR SELECT TO public USING (bucket_id = 'site-assets');

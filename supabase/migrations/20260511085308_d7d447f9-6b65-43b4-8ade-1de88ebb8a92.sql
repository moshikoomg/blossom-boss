
DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE TABLE public.customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads tags" ON public.customer_tags FOR SELECT USING (true);
CREATE POLICY "admins manage tags" ON public.customer_tags FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.user_profiles (
  user_id uuid PRIMARY KEY,
  display_name text DEFAULT '',
  phone text DEFAULT '',
  tag_id uuid REFERENCES public.customer_tags(id) ON DELETE SET NULL,
  certified boolean NOT NULL DEFAULT false,
  certified_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own profile" ON public.user_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all profiles" ON public.user_profiles FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage profiles" ON public.user_profiles FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "users update own profile" ON public.user_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_user_profiles_updated BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  image_url text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_images_pid ON public.product_images(product_id, display_order);
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads product images" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "admins manage product images" ON public.product_images FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.addon_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_id uuid NOT NULL,
  image_url text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_addon_images_aid ON public.addon_images(addon_id, display_order);
ALTER TABLE public.addon_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads addon images" ON public.addon_images FOR SELECT USING (true);
CREATE POLICY "admins manage addon images" ON public.addon_images FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

ALTER TABLE public.site_popups
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'url',
  ADD COLUMN IF NOT EXISTS filter_product_ids uuid[] DEFAULT '{}'::uuid[];

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT false;

CREATE POLICY "admins delete orders" ON public.orders FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  user_id uuid, email text, created_at timestamptz, roles text[],
  display_name text, phone text, tag_id uuid, tag_name text, tag_color text, certified boolean
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at,
    COALESCE(ARRAY(SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = u.id), ARRAY[]::text[]),
    COALESCE(p.display_name,''), COALESCE(p.phone,''), p.tag_id,
    t.name, t.color, COALESCE(p.certified,false)
  FROM auth.users u
  LEFT JOIN public.user_profiles p ON p.user_id = u.id
  LEFT JOIN public.customer_tags t ON t.id = p.tag_id
  ORDER BY u.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.top_products(_days int DEFAULT 30, _limit int DEFAULT 5)
RETURNS TABLE(product_id uuid, product_name text, product_image text, total_qty bigint, total_revenue numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT oi.product_id, MAX(oi.product_name), MAX(oi.product_image),
         SUM(oi.quantity)::bigint, SUM(oi.quantity * oi.unit_price)::numeric
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.created_at >= now() - (_days || ' days')::interval
    AND o.deleted_at IS NULL
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id
  ORDER BY SUM(oi.quantity) DESC
  LIMIT _limit;
$$;

INSERT INTO public.user_profiles (user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;


-- =========================================
-- 1. STORES TABLE
-- =========================================
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  primary_domain text UNIQUE,
  extra_domains text[] NOT NULL DEFAULT '{}',
  owner_user_id uuid,
  active boolean NOT NULL DEFAULT true,
  plan text NOT NULL DEFAULT 'free',
  logo_url text NOT NULL DEFAULT '',
  favicon_url text NOT NULL DEFAULT '',
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_email text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  whatsapp_business text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stores_primary_domain ON public.stores(primary_domain);
CREATE INDEX idx_stores_extra_domains ON public.stores USING GIN(extra_domains);

CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- =========================================
-- 2. ROLE + STORE MEMBERS
-- =========================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'store_owner';

CREATE TABLE public.store_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'owner', -- owner | staff | courier
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, user_id)
);

CREATE INDEX idx_store_members_user ON public.store_members(user_id);

ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;

-- =========================================
-- 3. DEFAULT STORE + BACKFILL
-- =========================================
INSERT INTO public.stores (slug, name, primary_domain, active, plan)
VALUES ('default', 'משתלת התמרים', 'blossom-boss.lovable.app', true, 'pro');

-- =========================================
-- 4. HELPER FUNCTIONS
-- =========================================
CREATE OR REPLACE FUNCTION public.current_store_id()
RETURNS uuid LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.headers', true)::json->>'x-store-id',''),
    NULLIF(current_setting('request.jwt.claims', true)::json->>'store_id','')
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_store_member(_store_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.store_members WHERE store_id = _store_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.default_store_id()
RETURNS uuid LANGUAGE sql STABLE
AS $$
  SELECT id FROM public.stores WHERE slug = 'default' LIMIT 1;
$$;

-- =========================================
-- 5. ADD store_id TO EXISTING TABLES + BACKFILL
-- =========================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'products','categories','add_ons','coupons','coupon_usages',
    'hero_slides','site_popups','popup_subscribers','legal_documents',
    'pricing_rules','orders','couriers','customer_tags','broadcasts','site_settings'
  ];
  default_id uuid;
BEGIN
  SELECT id INTO default_id FROM public.stores WHERE slug='default';
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET store_id = %L WHERE store_id IS NULL', t, default_id);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN store_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN store_id SET DEFAULT public.default_store_id()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_store_id ON public.%I(store_id)', t, t);
  END LOOP;
END$$;

-- legal_documents had UNIQUE(slug) implicitly via usage; make it per-store
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='legal_documents_slug_key') THEN
    ALTER TABLE public.legal_documents DROP CONSTRAINT legal_documents_slug_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='legal_documents_store_slug_uq') THEN
    CREATE UNIQUE INDEX legal_documents_store_slug_uq ON public.legal_documents(store_id, slug);
  END IF;
END$$;

-- site_settings.key needs to be unique per store
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='site_settings_pkey') THEN
    ALTER TABLE public.site_settings DROP CONSTRAINT site_settings_pkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='site_settings_store_key_uq') THEN
    CREATE UNIQUE INDEX site_settings_store_key_uq ON public.site_settings(store_id, key);
  END IF;
END$$;

-- coupons.code unique per store
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='coupons_code_key') THEN
    ALTER TABLE public.coupons DROP CONSTRAINT coupons_code_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='coupons_store_code_uq') THEN
    CREATE UNIQUE INDEX coupons_store_code_uq ON public.coupons(store_id, lower(code));
  END IF;
END$$;

-- =========================================
-- 6. RLS POLICIES - STORES + MEMBERS
-- =========================================
CREATE POLICY "anyone reads active stores" ON public.stores
  FOR SELECT USING (active = true OR has_role(auth.uid(),'admin') OR is_store_member(id, auth.uid()));

CREATE POLICY "platform admins manage stores" ON public.stores
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE POLICY "store owners update own store" ON public.stores
  FOR UPDATE TO authenticated
  USING (is_store_member(id, auth.uid()))
  WITH CHECK (is_store_member(id, auth.uid()));

CREATE POLICY "admins manage members" ON public.store_members
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

CREATE POLICY "users see own memberships" ON public.store_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- =========================================
-- 7. REPLACE RLS ON SCOPED TABLES
-- =========================================
-- Helper: drop old broad policies and recreate store-scoped ones.

-- PRODUCTS
DROP POLICY IF EXISTS "anyone reads active products" ON public.products;
DROP POLICY IF EXISTS "admins manage products" ON public.products;
CREATE POLICY "store-scoped read products" ON public.products FOR SELECT USING (
  store_id = current_store_id() AND (active = true OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid())
);
CREATE POLICY "store-scoped manage products" ON public.products FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- CATEGORIES
DROP POLICY IF EXISTS "anyone reads categories" ON public.categories;
DROP POLICY IF EXISTS "admins manage categories" ON public.categories;
CREATE POLICY "store-scoped read categories" ON public.categories FOR SELECT
  USING (store_id = current_store_id() OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped manage categories" ON public.categories FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- ADD_ONS
DROP POLICY IF EXISTS "anyone reads addons" ON public.add_ons;
DROP POLICY IF EXISTS "admins manage addons" ON public.add_ons;
CREATE POLICY "store-scoped read addons" ON public.add_ons FOR SELECT
  USING (store_id = current_store_id() OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped manage addons" ON public.add_ons FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- COUPONS
DROP POLICY IF EXISTS "anyone reads coupons" ON public.coupons;
DROP POLICY IF EXISTS "admins manage coupons" ON public.coupons;
CREATE POLICY "store-scoped read coupons" ON public.coupons FOR SELECT
  USING (store_id = current_store_id() OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped manage coupons" ON public.coupons FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- COUPON_USAGES
DROP POLICY IF EXISTS "admins read usage" ON public.coupon_usages;
DROP POLICY IF EXISTS "anyone insert usage" ON public.coupon_usages;
CREATE POLICY "store-scoped read usage" ON public.coupon_usages FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "anyone insert usage" ON public.coupon_usages FOR INSERT
  WITH CHECK (store_id = current_store_id());

-- HERO_SLIDES
DROP POLICY IF EXISTS "anyone reads hero_slides" ON public.hero_slides;
DROP POLICY IF EXISTS "admins manage hero_slides" ON public.hero_slides;
CREATE POLICY "store-scoped read hero_slides" ON public.hero_slides FOR SELECT
  USING (store_id = current_store_id() OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped manage hero_slides" ON public.hero_slides FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- SITE_POPUPS
DROP POLICY IF EXISTS "anyone reads popups" ON public.site_popups;
DROP POLICY IF EXISTS "admins manage popups" ON public.site_popups;
CREATE POLICY "store-scoped read popups" ON public.site_popups FOR SELECT
  USING (store_id = current_store_id() OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped manage popups" ON public.site_popups FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- POPUP_SUBSCRIBERS
DROP POLICY IF EXISTS "anyone subscribes" ON public.popup_subscribers;
DROP POLICY IF EXISTS "admins read subscribers" ON public.popup_subscribers;
DROP POLICY IF EXISTS "admins manage subscribers" ON public.popup_subscribers;
CREATE POLICY "anyone subscribes" ON public.popup_subscribers FOR INSERT WITH CHECK (store_id = current_store_id());
CREATE POLICY "store-scoped read subscribers" ON public.popup_subscribers FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped manage subscribers" ON public.popup_subscribers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- LEGAL_DOCUMENTS
DROP POLICY IF EXISTS "anyone reads legal_documents" ON public.legal_documents;
DROP POLICY IF EXISTS "admins manage legal_documents" ON public.legal_documents;
CREATE POLICY "store-scoped read legal" ON public.legal_documents FOR SELECT
  USING (store_id = current_store_id() OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped manage legal" ON public.legal_documents FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- PRICING_RULES
DROP POLICY IF EXISTS "anyone reads pricing" ON public.pricing_rules;
DROP POLICY IF EXISTS "admins manage pricing" ON public.pricing_rules;
CREATE POLICY "store-scoped read pricing" ON public.pricing_rules FOR SELECT
  USING (store_id = current_store_id() OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped manage pricing" ON public.pricing_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- ORDERS
DROP POLICY IF EXISTS "anyone creates orders" ON public.orders;
DROP POLICY IF EXISTS "admins see orders" ON public.orders;
DROP POLICY IF EXISTS "admins update orders" ON public.orders;
DROP POLICY IF EXISTS "admins delete orders" ON public.orders;
DROP POLICY IF EXISTS "users see own orders" ON public.orders;
DROP POLICY IF EXISTS "couriers see assigned" ON public.orders;
DROP POLICY IF EXISTS "couriers update assigned" ON public.orders;
CREATE POLICY "anyone creates orders" ON public.orders FOR INSERT WITH CHECK (store_id = current_store_id());
CREATE POLICY "store-scoped see orders" ON public.orders FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()) OR auth.uid() = user_id OR courier_id = user_courier_id(auth.uid()));
CREATE POLICY "store-scoped update orders" ON public.orders FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()) OR courier_id = user_courier_id(auth.uid()));
CREATE POLICY "store-scoped delete orders" ON public.orders FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- COURIERS
DROP POLICY IF EXISTS "anyone reads couriers" ON public.couriers;
DROP POLICY IF EXISTS "admins manage couriers" ON public.couriers;
DROP POLICY IF EXISTS "couriers update self" ON public.couriers;
CREATE POLICY "store-scoped read couriers" ON public.couriers FOR SELECT
  USING (store_id = current_store_id() OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()) OR auth.uid() = user_id);
CREATE POLICY "store-scoped manage couriers" ON public.couriers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "couriers update self" ON public.couriers FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- CUSTOMER_TAGS
DROP POLICY IF EXISTS "anyone reads tags" ON public.customer_tags;
DROP POLICY IF EXISTS "admins manage tags" ON public.customer_tags;
CREATE POLICY "store-scoped read tags" ON public.customer_tags FOR SELECT
  USING (store_id = current_store_id() OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped manage tags" ON public.customer_tags FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- BROADCASTS
DROP POLICY IF EXISTS "admins manage broadcasts" ON public.broadcasts;
CREATE POLICY "store-scoped manage broadcasts" ON public.broadcasts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

-- SITE_SETTINGS
DROP POLICY IF EXISTS "anyone reads settings" ON public.site_settings;
DROP POLICY IF EXISTS "admins manage settings" ON public.site_settings;
CREATE POLICY "store-scoped read settings" ON public.site_settings FOR SELECT
  USING (store_id = current_store_id() OR has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped manage settings" ON public.site_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') OR is_store_member(store_id, auth.uid()));

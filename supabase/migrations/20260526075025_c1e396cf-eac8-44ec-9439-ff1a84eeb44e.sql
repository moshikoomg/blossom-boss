
-- ============================================================
-- A. Tighten RLS: drop the "admin without store header" escape
--    hatch so platform admins always see exactly what the
--    impersonated store owner sees.
-- ============================================================

-- products
DROP POLICY IF EXISTS "store-scoped manage products" ON public.products;
DROP POLICY IF EXISTS "store-scoped read products" ON public.products;
CREATE POLICY "store-scoped manage products" ON public.products
  FOR ALL TO authenticated
  USING ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()))
  WITH CHECK ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped read products" ON public.products
  FOR SELECT TO public
  USING (store_id = current_store_id() OR is_store_member(store_id, auth.uid()));

-- categories
DROP POLICY IF EXISTS "store-scoped manage categories" ON public.categories;
DROP POLICY IF EXISTS "store-scoped read categories" ON public.categories;
CREATE POLICY "store-scoped manage categories" ON public.categories
  FOR ALL TO authenticated
  USING ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()))
  WITH CHECK ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped read categories" ON public.categories
  FOR SELECT TO public
  USING (store_id = current_store_id() OR is_store_member(store_id, auth.uid()));

-- add_ons
DROP POLICY IF EXISTS "store-scoped manage addons" ON public.add_ons;
DROP POLICY IF EXISTS "store-scoped read addons" ON public.add_ons;
CREATE POLICY "store-scoped manage addons" ON public.add_ons
  FOR ALL TO authenticated
  USING ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()))
  WITH CHECK ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped read addons" ON public.add_ons
  FOR SELECT TO public
  USING (store_id = current_store_id() OR is_store_member(store_id, auth.uid()));

-- site_settings
DROP POLICY IF EXISTS "store-scoped manage settings" ON public.site_settings;
DROP POLICY IF EXISTS "store-scoped read settings" ON public.site_settings;
CREATE POLICY "store-scoped manage settings" ON public.site_settings
  FOR ALL TO authenticated
  USING ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()))
  WITH CHECK ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped read settings" ON public.site_settings
  FOR SELECT TO public
  USING (store_id = current_store_id() OR is_store_member(store_id, auth.uid()));

-- hero_slides
DROP POLICY IF EXISTS "store-scoped manage hero_slides" ON public.hero_slides;
DROP POLICY IF EXISTS "store-scoped read hero_slides" ON public.hero_slides;
CREATE POLICY "store-scoped manage hero_slides" ON public.hero_slides
  FOR ALL TO authenticated
  USING ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()))
  WITH CHECK ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped read hero_slides" ON public.hero_slides
  FOR SELECT TO public
  USING (store_id = current_store_id() OR is_store_member(store_id, auth.uid()));

-- site_popups
DROP POLICY IF EXISTS "store-scoped manage popups" ON public.site_popups;
DROP POLICY IF EXISTS "store-scoped read popups" ON public.site_popups;
CREATE POLICY "store-scoped manage popups" ON public.site_popups
  FOR ALL TO authenticated
  USING ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()))
  WITH CHECK ((store_id = current_store_id() AND has_role(auth.uid(),'admin')) OR is_store_member(store_id, auth.uid()));
CREATE POLICY "store-scoped read popups" ON public.site_popups
  FOR SELECT TO public
  USING (store_id = current_store_id() OR is_store_member(store_id, auth.uid()));

-- ============================================================
-- B. Platform billing / features tables (super-admin only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  monthly_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  category text NOT NULL DEFAULT 'addon', -- 'plan' | 'addon'
  active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage plan_features" ON public.plan_features
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "all read plan_features" ON public.plan_features
  FOR SELECT TO public USING (active = true);

CREATE TABLE IF NOT EXISTS public.store_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  plan_key text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active', -- active|canceled|past_due|trialing
  provider text NOT NULL DEFAULT 'manual', -- stripe|meshulam|manual
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage subscriptions" ON public.store_subscriptions
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "owners read own subscription" ON public.store_subscriptions
  FOR SELECT TO authenticated USING (is_store_member(store_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.store_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  notes text NOT NULL DEFAULT '',
  UNIQUE (store_id, feature_key)
);
ALTER TABLE public.store_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage store_features" ON public.store_features
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "owners read own features" ON public.store_features
  FOR SELECT TO authenticated USING (is_store_member(store_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.billing_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  provider text NOT NULL, -- stripe|meshulam
  customer_token text NOT NULL,
  payment_method_brand text NOT NULL DEFAULT '',
  last4 text NOT NULL DEFAULT '',
  exp_month int,
  exp_year int,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billing_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage billing_tokens" ON public.billing_tokens
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER plan_features_updated_at BEFORE UPDATE ON public.plan_features
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER store_subscriptions_updated_at BEFORE UPDATE ON public.store_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed default features/plans
INSERT INTO public.plan_features (key, name, description, monthly_price, category, display_order) VALUES
  ('free',          'Free',           'תוכנית בסיסית — עד 30 מוצרים', 0,    'plan',  10),
  ('pro',           'Pro',            'תוכנית מקצועית — מוצרים ללא הגבלה, דומיין מותאם', 149,  'plan',  20),
  ('enterprise',    'Enterprise',     'תוכנית ארגונית — תמיכה ייעודית, SLA', 499,  'plan',  30),
  ('whatsapp',      'WhatsApp Sender','שליחת הודעות אוטומטיות בוואטסאפ', 49,   'addon', 40),
  ('ai_chat',       'AI Chat',        'בוט מכירות מבוסס AI', 79,   'addon', 50),
  ('advanced_analytics','Advanced Analytics','דוחות מתקדמים ויצוא לאקסל', 39, 'addon', 60),
  ('multi_courier', 'Multi Courier',  'מספר שליחים פעילים במקביל', 29,   'addon', 70),
  ('custom_domain', 'Custom Domain',  'חיבור דומיין בבעלותך', 19,   'addon', 80)
ON CONFLICT (key) DO NOTHING;

-- Backfill: every existing store gets a manual "active" subscription on its current plan
INSERT INTO public.store_subscriptions (store_id, plan_key, status, provider)
SELECT s.id, COALESCE(NULLIF(s.plan,''),'free'), 'active', 'manual'
FROM public.stores s
WHERE s.plan <> 'system'
  AND NOT EXISTS (SELECT 1 FROM public.store_subscriptions ss WHERE ss.store_id = s.id);

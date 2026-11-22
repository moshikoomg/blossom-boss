
-- 1. Extend store_subscriptions with trial + payment flags
ALTER TABLE public.store_subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_trial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_method_attached boolean NOT NULL DEFAULT false;

-- 2. plan_quotas: hard limits per plan_key + quota_key
CREATE TABLE IF NOT EXISTS public.plan_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text NOT NULL,
  quota_key text NOT NULL,
  monthly_limit integer NOT NULL DEFAULT 0,
  trial_percent integer NOT NULL DEFAULT 10,
  period text NOT NULL DEFAULT 'month', -- 'month' or 'lifetime'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_key, quota_key)
);

GRANT SELECT ON public.plan_quotas TO anon, authenticated;
GRANT ALL ON public.plan_quotas TO service_role;
ALTER TABLE public.plan_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads plan_quotas" ON public.plan_quotas
  FOR SELECT TO public USING (true);
CREATE POLICY "admins manage plan_quotas" ON public.plan_quotas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. store_usage: counters per store/period/key
CREATE TABLE IF NOT EXISTS public.store_usage (
  store_id uuid NOT NULL,
  period_start date NOT NULL,
  quota_key text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, period_start, quota_key)
);

GRANT SELECT ON public.store_usage TO authenticated;
GRANT ALL ON public.store_usage TO service_role;
ALTER TABLE public.store_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage store_usage" ON public.store_usage
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "members read own store_usage" ON public.store_usage
  FOR SELECT TO authenticated
  USING (is_store_member(store_id, auth.uid()));

-- 4. Atomic usage increment (SECURITY DEFINER so server functions via service_role can call it cheaply)
CREATE OR REPLACE FUNCTION public.increment_store_usage(_store_id uuid, _quota_key text, _n integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _period date := date_trunc('month', now())::date;
  _new int;
BEGIN
  INSERT INTO public.store_usage (store_id, period_start, quota_key, used, updated_at)
  VALUES (_store_id, _period, _quota_key, _n, now())
  ON CONFLICT (store_id, period_start, quota_key)
  DO UPDATE SET used = public.store_usage.used + EXCLUDED.used, updated_at = now()
  RETURNING used INTO _new;
  RETURN _new;
END;
$$;

-- 5. Seed/refresh plan_features: two plans + per-feature flags
-- (Keep existing addon rows as-is; just upsert plan rows and feature flags.)
INSERT INTO public.plan_features (key, name, description, monthly_price, category, display_order, active)
VALUES
  ('basic', 'Basic', 'תמחור חכם, פופ-אפים, וואטסאפ קישור, PWA ואירוח', 150, 'plan', 1, true),
  ('pro',   'Pro',   'הכל ב-Basic + סוכן AI, 4 תמונות סטודיו ודומיין פרטי', 500, 'plan', 2, true)
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      monthly_price = EXCLUDED.monthly_price,
      category = EXCLUDED.category,
      display_order = EXCLUDED.display_order,
      active = true;

-- Deactivate the legacy plan rows we no longer offer
UPDATE public.plan_features SET active = false WHERE key IN ('free','trial','enterprise');

-- 6. Seed plan_quotas (hard caps)
INSERT INTO public.plan_quotas (plan_key, quota_key, monthly_limit, trial_percent, period) VALUES
  ('pro',   'whatsapp_outbound', 200,  10, 'month'),
  ('pro',   'email_outbound',    2000, 10, 'month'),
  ('pro',   'ai_chat',           100,  10, 'month'),
  ('pro',   'image_generation',  4,   100, 'lifetime'),
  ('basic', 'whatsapp_outbound', 0,    0,  'month'),
  ('basic', 'email_outbound',    0,    0,  'month'),
  ('basic', 'ai_chat',           0,    0,  'month'),
  ('basic', 'image_generation',  0,    0,  'lifetime')
ON CONFLICT (plan_key, quota_key) DO UPDATE
  SET monthly_limit = EXCLUDED.monthly_limit,
      trial_percent = EXCLUDED.trial_percent,
      period = EXCLUDED.period,
      updated_at = now();

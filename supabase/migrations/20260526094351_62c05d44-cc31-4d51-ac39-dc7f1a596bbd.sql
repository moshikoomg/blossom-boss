ALTER TABLE public.plan_features
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS stripe_product_id text;

CREATE UNIQUE INDEX IF NOT EXISTS plan_features_stripe_price_id_uq
  ON public.plan_features (stripe_price_id)
  WHERE stripe_price_id IS NOT NULL;

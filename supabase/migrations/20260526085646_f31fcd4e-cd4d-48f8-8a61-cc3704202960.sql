
CREATE TABLE IF NOT EXISTS public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  feature_key TEXT,
  amount_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_after NUMERIC(10,2),
  currency TEXT NOT NULL DEFAULT 'ILS',
  actor_user_id UUID,
  actor_role TEXT,
  provider TEXT,
  provider_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_events_store ON public.billing_events(store_id, created_at DESC);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage billing_events" ON public.billing_events
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "owners read own billing_events" ON public.billing_events
  FOR SELECT TO authenticated
  USING (is_store_member(store_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.billing_idempotency (
  key TEXT PRIMARY KEY,
  store_id UUID NOT NULL,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_billing_idempotency_expires ON public.billing_idempotency(expires_at);

ALTER TABLE public.billing_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage billing_idempotency" ON public.billing_idempotency
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create lead_scans table for the onboarding scan workflow
CREATE TABLE public.lead_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_token text NOT NULL UNIQUE,
  source_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','scanning','ready','failed')),
  discovered_phone text,
  discovered_business_name text,
  discovered_logo_url text,
  discovered_palette jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  discovered_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  otp_code_hash text,
  otp_expires_at timestamptz,
  verified_at timestamptz,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_scans_token ON public.lead_scans(scan_token);
CREATE INDEX idx_lead_scans_status ON public.lead_scans(status);

-- GRANTs: service_role does all writes; deny anon/authenticated direct access.
GRANT ALL ON public.lead_scans TO service_role;

-- updated_at trigger
CREATE TRIGGER trg_lead_scans_updated_at
  BEFORE UPDATE ON public.lead_scans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lock down: RLS on, with a deny-all policy for anon/authenticated.
ALTER TABLE public.lead_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny all direct access"
  ON public.lead_scans
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Secure token-based read via SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION public.get_scan_by_token(p_token text)
RETURNS TABLE (
  id uuid,
  scan_token text,
  source_url text,
  status text,
  discovered_phone text,
  discovered_business_name text,
  discovered_logo_url text,
  discovered_palette jsonb,
  discovered_products jsonb,
  discovered_categories jsonb,
  store_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, scan_token, source_url, status,
         discovered_phone, discovered_business_name, discovered_logo_url,
         discovered_palette, discovered_products, discovered_categories,
         store_id, created_at, updated_at
  FROM public.lead_scans
  WHERE scan_token = p_token
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_scan_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_scan_by_token(text) TO anon, authenticated;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_scans;
ALTER TABLE public.lead_scans REPLICA IDENTITY FULL;

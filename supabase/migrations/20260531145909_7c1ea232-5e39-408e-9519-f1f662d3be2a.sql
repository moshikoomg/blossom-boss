ALTER TABLE public.lead_scans
  ADD COLUMN IF NOT EXISTS discovered_sites jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS requested_phone text;

ALTER TABLE public.lead_scans
  ADD COLUMN IF NOT EXISTS discovered_addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discovered_working_hours jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS working_hours jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.site_popups
  ADD COLUMN IF NOT EXISTS trigger_type text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS trigger_value text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trigger_category_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS size text NOT NULL DEFAULT 'md',
  ADD COLUMN IF NOT EXISTS shape text NOT NULL DEFAULT 'rounded',
  ADD COLUMN IF NOT EXISTS position text NOT NULL DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS animation text NOT NULL DEFAULT 'fade',
  ADD COLUMN IF NOT EXISTS overlay_opacity numeric NOT NULL DEFAULT 0.5;

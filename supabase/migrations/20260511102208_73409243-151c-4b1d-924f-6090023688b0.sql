ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS bg_color text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bg_color_to text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bg_effect text NOT NULL DEFAULT 'none';

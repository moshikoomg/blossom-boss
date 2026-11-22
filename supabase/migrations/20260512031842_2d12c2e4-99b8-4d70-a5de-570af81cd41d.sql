
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS bg_shape text NOT NULL DEFAULT 'fill',
  ADD COLUMN IF NOT EXISTS bg_size integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS bg_position text NOT NULL DEFAULT 'center';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS highlight_size smallint NOT NULL DEFAULT 1;

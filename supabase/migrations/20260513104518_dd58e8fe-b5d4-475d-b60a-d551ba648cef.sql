ALTER TABLE public.site_popups
  ADD COLUMN IF NOT EXISTS bg_opacity numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS layout text NOT NULL DEFAULT 'image-top',
  ADD COLUMN IF NOT EXISTS text_align text NOT NULL DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS content_padding integer NOT NULL DEFAULT 24;

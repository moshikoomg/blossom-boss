
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS bg_image_url text NOT NULL DEFAULT '';
ALTER TABLE public.site_popups ADD COLUMN IF NOT EXISTS bg_video_url text NOT NULL DEFAULT '';
ALTER TABLE public.site_popups ADD COLUMN IF NOT EXISTS rotate_seconds integer;

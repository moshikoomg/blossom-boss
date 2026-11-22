ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'grid';

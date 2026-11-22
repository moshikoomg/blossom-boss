CREATE TABLE IF NOT EXISTS public.platform_content (
  key text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.platform_content TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_content TO authenticated;
GRANT ALL ON public.platform_content TO service_role;

ALTER TABLE public.platform_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_content public read"
ON public.platform_content FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "platform_content admin write"
ON public.platform_content FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.platform_content (key, data)
VALUES ('landing', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

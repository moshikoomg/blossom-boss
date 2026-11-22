
CREATE TABLE public.hero_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  media_url text NOT NULL DEFAULT '',
  media_type text NOT NULL DEFAULT 'image',
  bg_color text NOT NULL DEFAULT '',
  text_color text NOT NULL DEFAULT '#ffffff',
  cta_label text NOT NULL DEFAULT '',
  cta_url text NOT NULL DEFAULT '',
  coupon_code text NOT NULL DEFAULT '',
  autoplay_seconds integer NOT NULL DEFAULT 6,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads hero_slides" ON public.hero_slides FOR SELECT TO public USING (true);
CREATE POLICY "admins manage hero_slides" ON public.hero_slides FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_hero_slides_updated BEFORE UPDATE ON public.hero_slides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

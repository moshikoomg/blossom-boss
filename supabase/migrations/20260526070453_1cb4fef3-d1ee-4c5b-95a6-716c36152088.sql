-- 1. Make default_store_id() resilient: fall back to current_store_id() (x-store-id header)
CREATE OR REPLACE FUNCTION public.default_store_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_store_id(),
    (SELECT id FROM public.stores WHERE slug = 'default' LIMIT 1)
  );
$$;

-- 2. Dedicated, system-managed platform template store (NOT a customer store)
INSERT INTO public.stores (id, slug, name, description, active, plan, theme, contact_email)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'platform-template',
  'Platform Template',
  'תבנית ברירת מחדל לחנויות חדשות בפלטפורמה. נערך על-ידי מנהלי מערכת בלבד.',
  false,
  'system',
  '{"primary":"#e11d48","accent":"#fb7185","secondary":"#fde6ed","primary_foreground":"#ffffff","background":"#fff9fb","foreground":"#2a1721"}'::jsonb,
  ''
)
ON CONFLICT (id) DO NOTHING;

-- 3. Helper SQL function referencing the template store id
CREATE OR REPLACE FUNCTION public.platform_template_store_id()
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT '11111111-1111-1111-1111-111111111111'::uuid;
$$;

-- 4. Baseline categories for the template store
INSERT INTO public.categories (store_id, name, display_order, active, bg_color)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'זרים',     0, true, '#fce7f3'),
  ('11111111-1111-1111-1111-111111111111', 'עציצים',  1, true, '#dcfce7'),
  ('11111111-1111-1111-1111-111111111111', 'מתנות',   2, true, '#fef3c7')
ON CONFLICT DO NOTHING;

-- 5. Baseline products (10 per category). Image left empty; client/seed renders a themed SVG at clone time.
WITH cats AS (
  SELECT id, name FROM public.categories
  WHERE store_id = '11111111-1111-1111-1111-111111111111'
),
seed(category_name, product_name, price, display_order) AS (
  VALUES
    -- זרים
    ('זרים','זר ורדים אדומים קלאסי',           220, 0),
    ('זרים','זר ורדים לבנים רומנטי',           240, 1),
    ('זרים','זר פסטל מעורב',                  210, 2),
    ('זרים','זר חמניות שמשי',                 190, 3),
    ('זרים','זר פיוניות עדין',                280, 4),
    ('זרים','זר טוליפים צבעוני',              200, 5),
    ('זרים','זר לבן מונוכרום',                230, 6),
    ('זרים','זר שדה פראי',                    180, 7),
    ('זרים','זר פרימיום XL',                  340, 8),
    ('זרים','זר יום הולדת שמח',               210, 9),
    -- עציצים
    ('עציצים','עציץ מונסטרה',                  150, 0),
    ('עציצים','עציץ סוקולנטים בקרמיקה',        85,  1),
    ('עציצים','עציץ פיקוס למינטה',             120, 2),
    ('עציצים','עציץ פותוס תלוי',               95,  3),
    ('עציצים','בונסאי שולחני',                 180, 4),
    ('עציצים','עציץ סנסבריה (חרב משה)',        130, 5),
    ('עציצים','עציץ קקטוס מיני',               65,  6),
    ('עציצים','עציץ סחלב פלאנופסיס',           175, 7),
    ('עציצים','עציץ זמיוקולקס',                145, 8),
    ('עציצים','עציץ דרצינה',                   160, 9),
    -- מתנות
    ('מתנות','מארז שוקולד פרמיום',             95,  0),
    ('מתנות','בקבוק יין אדום + פרחים',         220, 1),
    ('מתנות','סל פינוקים מתוק',                160, 2),
    ('מתנות','כרטיס ברכה מעוטר',               25,  3),
    ('מתנות','בלוני הליום צבעוניים',           75,  4),
    ('מתנות','דובי ענק רך',                    140, 5),
    ('מתנות','נר ריחני יוקרתי',                85,  6),
    ('מתנות','מארז תה ועוגיות',                110, 7),
    ('מתנות','אגרטל זכוכית עם זר מיני',        130, 8),
    ('מתנות','מארז יום הולדת מושלם',           195, 9)
)
INSERT INTO public.products (store_id, category_id, name, description, price, image_url, active, stock, rating, display_order)
SELECT
  '11111111-1111-1111-1111-111111111111',
  c.id,
  s.product_name,
  'מוצר ברירת מחדל מתבנית הפלטפורמה — ערוך כדי להתאים לחנות שלך.',
  s.price,
  '',
  true,
  50,
  5,
  s.display_order
FROM seed s
JOIN cats c ON c.name = s.category_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p
  WHERE p.store_id = '11111111-1111-1111-1111-111111111111'
    AND p.name = s.product_name
);


-- Update site settings
INSERT INTO public.site_settings (key,value) VALUES
  ('store_address','"שד׳ התמרים 232, אילת"'::jsonb),
  ('store_phone','"052-3903333 | 053-3022466"'::jsonb),
  ('store_email','"service@kora.co.il"'::jsonb),
  ('store_website','"flowers-eilat.co.il"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Add missing categories
INSERT INTO public.categories (name, display_order) VALUES
  ('זרי פרחים מרכזית', 0),
  ('זרי בלונים', 5),
  ('יום הולדת', 6),
  ('יום נישואין', 7)
ON CONFLICT DO NOTHING;

-- Wipe products
DELETE FROM public.order_items WHERE product_id IS NOT NULL;
DELETE FROM public.products;

-- Helpers
DO $$
DECLARE
  c_flowers uuid := (SELECT id FROM public.categories WHERE name='זרי פרחים' LIMIT 1);
  c_balloons uuid := (SELECT id FROM public.categories WHERE name='זרי בלונים' LIMIT 1);
  c_birthday uuid := (SELECT id FROM public.categories WHERE name='יום הולדת' LIMIT 1);
  c_plants uuid := (SELECT id FROM public.categories WHERE name='עציצים וסחלבים' LIMIT 1);
  c_anniv uuid := (SELECT id FROM public.categories WHERE name='יום נישואין' LIMIT 1);
  img_roses text := 'https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=800&q=80';
  img_bouq text := 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800&q=80';
  img_tulip text := 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=800&q=80';
  img_white text := 'https://images.unsplash.com/photo-1457089328109-e5d9bd499191?w=800&q=80';
  img_gift text := 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&q=80';
  img_succ text := 'https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=800&q=80';
  img_orch text := 'https://images.unsplash.com/photo-1558603668-6570496b66f8?w=800&q=80';
  img_bal text := 'https://images.unsplash.com/photo-1530092285049-1c42085fd395?w=800&q=80';
  img_choc text := 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=800&q=80';
BEGIN
  INSERT INTO public.products (name, description, price, original_price, stock, image_url, category_id, badge, display_order) VALUES
  ('אהבה איטלקית','זר רומנטי בסגנון איטלקי',229,NULL,10,img_bouq,c_flowers,NULL,1),
  ('אהבה בשחקים','זר עדין ופורח',139,NULL,10,img_bouq,c_flowers,NULL,2),
  ('אושר אדום','זר אדום עוצמתי',219,NULL,10,img_roses,c_flowers,NULL,3),
  ('ורד האהבה','ורדים מובחרים',300,NULL,8,img_roses,c_flowers,'מומלץ',4),
  ('ורדים באדום','זר ורדים אדומים קלאסי',199,NULL,12,img_roses,c_flowers,NULL,5),
  ('ורדים בקונוס לבן','אריזה אלגנטית',229,NULL,10,img_white,c_flowers,NULL,6),
  ('זר 11 ורדים אדומים אלגנטי','11 ורדים אדומים',220,NULL,10,img_roses,c_flowers,NULL,7),
  ('זר בהפתעה','בחירת המעצב',199,NULL,10,img_bouq,c_flowers,NULL,8),
  ('זר הולנדי','פרחים הולנדים מובחרים',148,NULL,10,img_bouq,c_flowers,NULL,9),
  ('זר ורדים ליזי','ורדים בסגנון ליזי',219,NULL,10,img_roses,c_flowers,NULL,10),
  ('זר חרציות צבעוני','חרציות צבעוניות',165,NULL,10,img_bouq,c_flowers,NULL,11),
  ('זר טוליפים','טוליפים טריים',220,NULL,10,img_tulip,c_flowers,NULL,12),
  ('זר כרמלה','זר עוצר נשימה',219,NULL,10,img_bouq,c_flowers,NULL,13),
  ('זר מודרני','עיצוב מודרני נקי',159,NULL,10,img_white,c_flowers,NULL,14),
  ('זר מקסים','זר עדין ומקסים',175,NULL,10,img_bouq,c_flowers,NULL,15),
  ('זר מרהיב','זר גדול ומרשים',164,NULL,10,img_bouq,c_flowers,NULL,16),
  ('זר עדין','עיצוב עדין ופסטלי',249,NULL,10,img_white,c_flowers,NULL,17),
  ('זר פרחים ומארז פררו','שילוב פרחים ושוקולד פררו',220,NULL,10,img_choc,c_flowers,'מבצע',18),
  ('זר שושנים','שושנים מלכותיות',299,NULL,8,img_white,c_flowers,NULL,19),
  ('זריחת החמה','זר חמים בגוונים חמים',154,NULL,10,img_bouq,c_flowers,NULL,20),
  ('חיים שלי','זר ייחודי לאהובים',199,NULL,10,img_roses,c_flowers,NULL,21),
  ('יום מקסים','זר יומיומי מקסים',149,NULL,15,img_bouq,c_flowers,NULL,22),
  ('מארז שוקולד ופרחים יוקרתי','מארז יוקרתי לאירועים',249,NULL,8,img_choc,c_flowers,'יוקרתי',23),
  ('זר שושנים באהבה','שושנים באריזה רומנטית',220,NULL,10,img_white,c_flowers,NULL,24),
  ('מיקס ורדים','ורדים בצבעים מעורבים',199,NULL,12,img_roses,c_flowers,NULL,25),
  ('זר פרחים מיקס טוליפים','שילוב טוליפים צבעוני',220,NULL,10,img_tulip,c_flowers,NULL,26),
  ('מארז מיני סוקו','מארז קטן של סוקולנטים',90,NULL,15,img_succ,c_plants,NULL,27),
  ('מארז סוקו','מארז סוקולנטים',200,NULL,10,img_succ,c_plants,NULL,28),
  ('מיקס סוקולנטים','מיקס סוקולנטים מעוצב',150,NULL,12,img_succ,c_plants,NULL,29),
  ('עציץ אנטוריום בכלי קרמיקה','אנטוריום בכלי קרמיקה',237,NULL,8,img_orch,c_plants,NULL,30),
  ('עציץ ספטיפיליום','ספטיפיליום פורח',175,NULL,8,img_orch,c_plants,NULL,31),
  ('נסיכה בלבן','זר לבן עדין',169,NULL,10,img_white,c_flowers,NULL,32),
  ('סינדרלה','זר חלומי',179,NULL,10,img_white,c_flowers,NULL,33),
  ('סיפור אהבה','זר רומנטי',249,NULL,10,img_roses,c_flowers,NULL,34),
  ('פוקהונטס','זר פראי וצבעוני',249,NULL,10,img_bouq,c_flowers,NULL,35),
  ('פצצה אדומה לבנה','זר אדום-לבן עוצמתי',229,NULL,10,img_roses,c_flowers,NULL,36),
  ('בלון לב','בלון לב יחיד',35,NULL,30,img_bal,c_balloons,NULL,37),
  ('זר בלוני לב','זר בלוני לב',175,NULL,15,img_bal,c_balloons,NULL,38),
  ('זר לראש הנסיכה','זר לראש לנסיכות',115,NULL,15,img_white,c_birthday,NULL,39),
  ('זר לראש לבן צהוב','זר לראש בגוונים',110,NULL,15,img_white,c_birthday,NULL,40),
  ('זר לראש סגול ורוד','זר לראש בגוונים',110,NULL,15,img_bouq,c_birthday,NULL,41),
  ('מארז בסלסלה','מארז יפהפה בסלסלה',225,NULL,10,img_gift,c_birthday,NULL,42),
  ('מארז מתנה סימפטיה','מארז מתנה מרגש',329,NULL,8,img_gift,c_birthday,NULL,43),
  ('ניחוח פרחים','זר ריחני וטרי',165,NULL,10,img_bouq,c_birthday,NULL,44),
  ('סגנון כפרי קלאסי','זר בסגנון כפרי',165,NULL,10,img_bouq,c_birthday,NULL,45),
  ('סט רומנטי','סט מתנה רומנטי גדול',599,NULL,5,img_gift,c_anniv,'יוקרתי',46);
END $$;

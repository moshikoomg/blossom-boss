-- Seed default catalog config on the existing default store id
INSERT INTO public.site_settings (store_id, key, value)
VALUES (
  'd720941e-6e5f-4a01-9402-4cd059164b39'::uuid,
  'platform_default_catalog',
  jsonb_build_object(
    'categories', jsonb_build_array(
      jsonb_build_object('name','זרים','bg_color','#fce7f3','items', jsonb_build_array(
        jsonb_build_object('name','זר ורדים קלאסי','description','החלף בתמונה ובתיאור משלך','price',249,'placeholder','flowers'),
        jsonb_build_object('name','זר שדה אביבי','description','החלף בתמונה ובתיאור משלך','price',199,'placeholder','flowers'),
        jsonb_build_object('name','זר סחלבים','description','החלף בתמונה ובתיאור משלך','price',339,'placeholder','flowers'),
        jsonb_build_object('name','זר 12 ורדים','description','החלף בתמונה ובתיאור משלך','price',229,'placeholder','flowers'),
        jsonb_build_object('name','זר פסטל','description','החלף בתמונה ובתיאור משלך','price',269,'placeholder','flowers'),
        jsonb_build_object('name','זר חמניות','description','החלף בתמונה ובתיאור משלך','price',179,'placeholder','flowers'),
        jsonb_build_object('name','זר טוליפים','description','החלף בתמונה ובתיאור משלך','price',229,'placeholder','flowers'),
        jsonb_build_object('name','זר ליליות','description','החלף בתמונה ובתיאור משלך','price',259,'placeholder','flowers'),
        jsonb_build_object('name','זר VIP','description','החלף בתמונה ובתיאור משלך','price',349,'placeholder','flowers'),
        jsonb_build_object('name','זר רומנטי לבן','description','החלף בתמונה ובתיאור משלך','price',309,'placeholder','flowers')
      )),
      jsonb_build_object('name','עציצים','bg_color','#dcfce7','items', jsonb_build_array(
        jsonb_build_object('name','מונסטרה','description','החלף בתמונה ובתיאור משלך','price',189,'placeholder','plant'),
        jsonb_build_object('name','עץ זית ביתי','description','החלף בתמונה ובתיאור משלך','price',219,'placeholder','plant'),
        jsonb_build_object('name','סנסיביריה','description','החלף בתמונה ובתיאור משלך','price',89,'placeholder','plant'),
        jsonb_build_object('name','סחלב לבן','description','החלף בתמונה ובתיאור משלך','price',159,'placeholder','plant'),
        jsonb_build_object('name','פיקוס ליראטה','description','החלף בתמונה ובתיאור משלך','price',199,'placeholder','plant'),
        jsonb_build_object('name','פותוס','description','החלף בתמונה ובתיאור משלך','price',79,'placeholder','plant'),
        jsonb_build_object('name','קקטוס','description','החלף בתמונה ובתיאור משלך','price',129,'placeholder','plant'),
        jsonb_build_object('name','אלוורה','description','החלף בתמונה ובתיאור משלך','price',85,'placeholder','plant'),
        jsonb_build_object('name','ZZ זמיוקולקס','description','החלף בתמונה ובתיאור משלך','price',149,'placeholder','plant'),
        jsonb_build_object('name','בונסאי','description','החלף בתמונה ובתיאור משלך','price',209,'placeholder','plant')
      )),
      jsonb_build_object('name','מתנות','bg_color','#fef3c7','items', jsonb_build_array(
        jsonb_build_object('name','מארז שוקולד','description','החלף בתמונה ובתיאור משלך','price',119,'placeholder','gift'),
        jsonb_build_object('name','נר ריחני','description','החלף בתמונה ובתיאור משלך','price',69,'placeholder','gift'),
        jsonb_build_object('name','בקבוק יין בוטיק','description','החלף בתמונה ובתיאור משלך','price',149,'placeholder','gift'),
        jsonb_build_object('name','בלון הליום','description','החלף בתמונה ובתיאור משלך','price',35,'placeholder','gift'),
        jsonb_build_object('name','מארז תה','description','החלף בתמונה ובתיאור משלך','price',89,'placeholder','gift'),
        jsonb_build_object('name','כרטיס ברכה','description','החלף בתמונה ובתיאור משלך','price',29,'placeholder','gift'),
        jsonb_build_object('name','בובת טדי','description','החלף בתמונה ובתיאור משלך','price',79,'placeholder','gift'),
        jsonb_build_object('name','מארז גורמה','description','החלף בתמונה ובתיאור משלך','price',179,'placeholder','gift'),
        jsonb_build_object('name','סבון טבעי','description','החלף בתמונה ובתיאור משלך','price',59,'placeholder','gift'),
        jsonb_build_object('name','ספר מתכוני שף','description','החלף בתמונה ובתיאור משלך','price',129,'placeholder','gift')
      ))
    )
  )
)
ON CONFLICT (store_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Backfill store_members for stores that have owner_user_id but no membership row
INSERT INTO public.store_members (store_id, user_id, role)
SELECT s.id, s.owner_user_id, 'owner'
FROM public.stores s
WHERE s.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.store_members sm WHERE sm.store_id = s.id AND sm.user_id = s.owner_user_id
  );

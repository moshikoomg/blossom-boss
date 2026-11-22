-- Seed demo background colors on the platform template categories so the
-- storefront preview renders a visually distinct chip per category instead
-- of a uniform muted look.
UPDATE public.categories SET bg_color = '#fce7f3', bg_color_to = '#f9a8d4', bg_effect = 'gradient' WHERE store_id = public.platform_template_store_id() AND name = 'זרי פרחים';
UPDATE public.categories SET bg_color = '#fee2e2', bg_color_to = '#fca5a5', bg_effect = 'gradient' WHERE store_id = public.platform_template_store_id() AND name = 'ורדים';
UPDATE public.categories SET bg_color = '#fef3c7', bg_color_to = '#fcd34d', bg_effect = 'gradient' WHERE store_id = public.platform_template_store_id() AND name = 'מארזי שי ושוקולד';
UPDATE public.categories SET bg_color = '#dcfce7', bg_color_to = '#86efac', bg_effect = 'gradient' WHERE store_id = public.platform_template_store_id() AND name = 'עציצים וסחלבים';
UPDATE public.categories SET bg_color = '#ede9fe', bg_color_to = '#c4b5fd', bg_effect = 'gradient' WHERE store_id = public.platform_template_store_id() AND name = 'זרי בלונים';
UPDATE public.categories SET bg_color = '#fee2e2', bg_color_to = '#fda4af', bg_effect = 'gradient' WHERE store_id = public.platform_template_store_id() AND name = 'יין ומשקאות';
UPDATE public.categories SET bg_color = '#dbeafe', bg_color_to = '#93c5fd', bg_effect = 'gradient' WHERE store_id = public.platform_template_store_id() AND name = 'יום הולדת';
UPDATE public.categories SET bg_color = '#ffe4e6', bg_color_to = '#fda4af', bg_effect = 'gradient' WHERE store_id = public.platform_template_store_id() AND name = 'יום נישואין';

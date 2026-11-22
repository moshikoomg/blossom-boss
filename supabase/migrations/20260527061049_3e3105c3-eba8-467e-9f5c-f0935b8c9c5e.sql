ALTER PUBLICATION supabase_realtime DROP TABLE public.orders;
ALTER PUBLICATION supabase_realtime DROP TABLE public.courier_locations;

CREATE OR REPLACE FUNCTION public.platform_template_store_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT '11111111-1111-1111-1111-111111111111'::uuid;
$function$;

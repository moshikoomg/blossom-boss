DROP FUNCTION IF EXISTS public.get_scan_by_token(text);

CREATE OR REPLACE FUNCTION public.get_scan_by_token(p_token text)
 RETURNS TABLE(
   id uuid, scan_token text, source_url text, status text,
   discovered_phone text, discovered_business_name text, discovered_logo_url text,
   discovered_palette jsonb, discovered_products jsonb, discovered_categories jsonb,
   discovered_sites jsonb,
   store_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone,
   verified_at timestamp with time zone
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, scan_token, source_url, status,
         discovered_phone, discovered_business_name, discovered_logo_url,
         discovered_palette, discovered_products, discovered_categories,
         discovered_sites,
         store_id, created_at, updated_at, verified_at
  FROM public.lead_scans
  WHERE scan_token = p_token
  LIMIT 1;
$function$;

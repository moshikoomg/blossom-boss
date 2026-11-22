DROP FUNCTION IF EXISTS public.get_scan_by_token(text);

CREATE FUNCTION public.get_scan_by_token(p_token text)
RETURNS TABLE(
  id uuid,
  scan_token text,
  source_url text,
  status text,
  discovered_phone text,
  discovered_business_name text,
  discovered_logo_url text,
  discovered_palette jsonb,
  discovered_products jsonb,
  discovered_categories jsonb,
  discovered_sites jsonb,
  discovered_addons jsonb,
  discovered_working_hours jsonb,
  store_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  verified_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ls.id,
    ls.scan_token,
    ls.source_url,
    ls.status::text,
    ls.discovered_phone,
    ls.discovered_business_name,
    ls.discovered_logo_url,
    ls.discovered_palette,
    ls.discovered_products,
    ls.discovered_categories,
    ls.discovered_sites,
    ls.discovered_addons,
    ls.discovered_working_hours,
    ls.store_id,
    ls.created_at,
    ls.updated_at,
    ls.verified_at
  FROM public.lead_scans ls
  WHERE ls.scan_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_scan_by_token(text) TO anon, authenticated, service_role;

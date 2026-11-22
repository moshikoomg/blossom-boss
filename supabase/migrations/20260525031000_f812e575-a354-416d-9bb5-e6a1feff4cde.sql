
-- Restore EXECUTE on SECURITY DEFINER helpers used inside RLS policies.
-- SECURITY DEFINER itself protects the function body; anon/authenticated
-- must be able to CALL the function for RLS evaluation to succeed.

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_member(uuid, uuid)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_courier_for_order(uuid, uuid)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_courier_id(uuid)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_store_id()                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.default_store_id()                TO anon, authenticated;

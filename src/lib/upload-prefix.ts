import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve the storage path prefix for the current user.
 * Storage RLS requires writes to live under `<store_id>/...` for the user's
 * own store; admins write under `admin/...` (covered by admin policies).
 * Returns `null` when the user has neither a store membership nor admin role.
 */
export async function resolveUploadPrefix(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return null;
  const { data: member } = await supabase
    .from("store_members")
    .select("store_id")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();
  if (member?.store_id) return String(member.store_id);
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", uid);
  if (roles?.some((r) => r.role === "admin")) return "admin";
  return null;
}

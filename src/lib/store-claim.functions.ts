import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Attach the currently authenticated user as `owner` of the given store.
 *
 * Safe to call after Google sign-in at the end of onboarding. Refuses to
 * hijack a store that already has a non-anonymous owner — only stores with
 * no owner membership, or whose existing owner is still an anonymous
 * auth.users row (the throwaway uid created during the URL-scan flow), can
 * be claimed.
 */
export const claimStoreOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ storeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { storeId } = data;
    const { userId } = context as { userId: string };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Caller must be a real (non-anonymous) auth user.
    const { data: meRes, error: meErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (meErr || !meRes?.user) throw new Error("auth_user_not_found");
    if ((meRes.user as any).is_anonymous) {
      throw new Error("anonymous_user_cannot_claim");
    }

    // Store must exist.
    const { data: store, error: sErr } = await supabaseAdmin
      .from("stores")
      .select("id, owner_user_id")
      .eq("id", storeId)
      .maybeSingle();
    if (sErr) throw new Error(`store_read_failed: ${sErr.message}`);
    if (!store) throw new Error("store_not_found");

    // Already a member? Done.
    const { data: mine } = await supabaseAdmin
      .from("store_members")
      .select("id, role")
      .eq("store_id", storeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (mine) {
      if (mine.role !== "owner") {
        await supabaseAdmin
          .from("store_members")
          .update({ role: "owner" })
          .eq("id", mine.id);
      }
      if (store.owner_user_id !== userId) {
        await supabaseAdmin
          .from("stores")
          .update({ owner_user_id: userId })
          .eq("id", storeId);
      }
      return { claimed: false, alreadyMember: true };
    }

    // If there's already an owner, only allow takeover if that owner is an
    // anonymous auth.users row (i.e. the pre-Google onboarding identity).
    const { data: owners } = await supabaseAdmin
      .from("store_members")
      .select("id, user_id")
      .eq("store_id", storeId)
      .eq("role", "owner");
    for (const o of owners ?? []) {
      const { data: ures } = await supabaseAdmin.auth.admin.getUserById(o.user_id);
      if (ures?.user && !(ures.user as any).is_anonymous) {
        throw new Error("store_already_owned");
      }
    }

    // Remove stale anonymous owner rows, then insert current user.
    if (owners && owners.length > 0) {
      await supabaseAdmin
        .from("store_members")
        .delete()
        .in("id", owners.map((o) => o.id));
    }
    const { error: insErr } = await supabaseAdmin
      .from("store_members")
      .insert({ store_id: storeId, user_id: userId, role: "owner" });
    if (insErr) throw new Error(`membership_insert_failed: ${insErr.message}`);

    await supabaseAdmin
      .from("stores")
      .update({ owner_user_id: userId })
      .eq("id", storeId);

    return { claimed: true, alreadyMember: false };
  });

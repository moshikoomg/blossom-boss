import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidSlug } from "./store-slug";

/** Store owner (or platform admin) changes the store's short link /s/<slug>. */
export const updateStoreSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ storeId: z.string().uuid(), slug: z.string().trim().toLowerCase().min(3).max(40) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const [admin, member] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
      supabaseAdmin
        .from("store_members")
        .select("role")
        .eq("user_id", userId)
        .eq("store_id", data.storeId)
        .in("role", ["owner", "manager"])
        .maybeSingle(),
    ]);
    if (!admin.data && !member.data) return { ok: false as const, error: "אין הרשאה לשנות את הקישור" };
    if (!isValidSlug(data.slug))
      return { ok: false as const, error: "אותיות באנגלית, מספרים ומקפים בלבד (3 עד 40 תווים)" };

    const { data: clash } = await supabaseAdmin
      .from("stores")
      .select("id")
      .eq("slug", data.slug)
      .neq("id", data.storeId)
      .maybeSingle();
    if (clash) return { ok: false as const, error: "הקישור הזה כבר תפוס. נסו שם אחר." };

    const { error } = await supabaseAdmin.from("stores").update({ slug: data.slug }).eq("id", data.storeId);
    if (error) return { ok: false as const, error: "שמירה נכשלה, נסו שוב" };
    return { ok: true as const, slug: data.slug };
  });

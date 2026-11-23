import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChatCompletion } from "./ai.server";
import { QuotaExceededError, consumeQuota, quotaUserMessage } from "./quota.server";

// Writes a short, styled Hebrew product description for a florist. The owner
// sees it in the description box and can edit or regenerate before saving.

const TONES = {
  warm: "חם, אישי ומרגש",
  elegant: "יוקרתי ומעודן",
  fun: "קליל, שמח ועם חיוך",
} as const;

export const writeProductDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        storeId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        notes: z.string().max(600).optional().default(""),
        price: z.number().nonnegative().optional(),
        tone: z.enum(["warm", "elegant", "fun"]).optional().default("warm"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const [{ data: member }, { data: admin }] = await Promise.all([
      supabaseAdmin
        .from("store_members")
        .select("id")
        .eq("store_id", data.storeId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    ]);
    if (!member && !admin) return { ok: false as const, error: "אין הרשאה לחנות הזו." };

    try {
      await consumeQuota(data.storeId, "ai_chat");
    } catch (e) {
      if (e instanceof QuotaExceededError) return { ok: false as const, error: quotaUserMessage("ai_chat") };
      throw e;
    }

    const { data: nameRow } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("store_id", data.storeId)
      .eq("key", "store_name")
      .maybeSingle();
    const storeName = typeof nameRow?.value === "string" ? nameRow.value : "";

    const prompt = [
      `כתוב תיאור מוצר לחנות פרחים${storeName ? ` בשם "${storeName}"` : ""}.`,
      `המוצר: ${data.name}.`,
      data.price ? `מחיר: ${data.price} ₪.` : "",
      data.notes.trim() ? `פרטים מבעל החנות: ${data.notes.trim()}` : "",
      `סגנון: ${TONES[data.tone]}.`,
      "2 עד 3 משפטים בעברית טבעית, בלי כותרת, בלי אימוג'י ובלי מרכאות.",
      "אל תמציא עובדות שלא נאמרו (כמו מספר פרחים, מידות או משלוח חינם).",
      "סיים במשפט קצר שמזמין להזמין או להוסיף ברכה.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const res = await aiChatCompletion([
        { role: "system", content: "אתה קופירייטר ישראלי מנוסה לחנויות פרחים." },
        { role: "user", content: prompt },
      ]);
      if (!res.ok) return { ok: false as const, error: "הכתיבה לא הצליחה כרגע. נסו שוב." };
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = (json.choices?.[0]?.message?.content || "").trim().replace(/^["״]|["״]$/g, "");
      if (!text) return { ok: false as const, error: "הכתיבה לא הצליחה כרגע. נסו שוב." };
      return { ok: true as const, text: text.slice(0, 1200) };
    } catch {
      return { ok: false as const, error: "הכתיבה לא הצליחה כרגע. נסו שוב." };
    }
  });

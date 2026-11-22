import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertQuota, consumeQuota, QuotaExceededError, quotaUserMessage } from "./quota.server";
import { aiChatCompletion, getAiConfig, type ChatMessage } from "./ai.server";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(60),
  storeId: z.string().uuid().nullable().optional(),
});

async function detectOwnerFromRequest(storeId: string | null): Promise<boolean> {
  try {
    const authHeader = getRequestHeader("authorization") || getRequestHeader("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return false;
    const { data: claims } = await supabaseAdmin.auth.getClaims(token);
    const uid = claims?.claims?.sub as string | undefined;
    if (!uid) return false;
    const [adminRow, memberRow] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle(),
      storeId
        ? supabaseAdmin.from("store_members").select("id").eq("user_id", uid).eq("store_id", storeId).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);
    return !!adminRow.data || !!memberRow.data;
  } catch {
    return false;
  }
}

/** Cheap, no-AI-cost lookup so the client can render the right UI
 *  (visitor: greeting-only / owner: full chat) before the first message. */
export const getChatViewerMode = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ storeId: z.string().uuid().nullable().optional() }).parse(i))
  .handler(async ({ data }) => {
    const isOwner = await detectOwnerFromRequest(data.storeId || null);
    return { isOwner };
  });

export const salesChat = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const storeId = data.storeId || null;

    /** Generic, silent fallback used whenever real AI is unavailable
     *  (no quota, no API key, upstream failure). Never surfaces errors
     *  to the user — just showcases real products from the catalog so
     *  the merchant can finish testing their shopping flow. */
    function genericFallback(
      productList: Array<{ id: string; rating: number | null }>,
      lastUser: string,
      isOwner: boolean,
    ) {
      const lower = lastUser.toLowerCase();
      const top = productList
        .slice()
        .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))
        .slice(0, 4)
        .map((p) => p.id);
      let reply = "שלום! 🌷 הנה כמה מהמוצרים שלנו שיתאימו לכם — בחרו את האהוב עליכם.";
      let action: "browse" | "recommend" | "checkout" = top.length ? "recommend" : "browse";
      if (/תשלום|לסיים|לקופה|checkout/.test(lower)) {
        reply = "מעולה! מעבירה אתכם לקופה לסיום ההזמנה 🛒";
        action = "checkout";
      }
      return {
        reply,
        recommendedProductIds: action === "recommend" ? top : [],
        suggestedAddonIds: [] as string[],
        suggestedSizeLabel: null as string | null,
        quickReplies: ["מומלצים", "עד 150₪", "150-300₪", "לתשלום"],
        action,
        aiEnabled: false,
        isOwner,
        creditError: false as boolean,
      };
    }

    // Best-effort owner detection — protects AI credit budget so visitors
    // never burn through the store owner's quota. See detectOwnerFromRequest.
    const isOwner = await detectOwnerFromRequest(storeId);

    // Check whether this store has the AI agent feature enabled. If not we
    // still serve a friendly generic response so the bubble keeps working —
    // we just skip the paid LLM call.
    let aiEnabled = false;
    if (storeId) {
      const { data: feat } = await supabaseAdmin
        .from("store_features")
        .select("enabled,expires_at")
        .eq("store_id", storeId)
        .eq("feature_key", "ai_chat")
        .maybeSingle();
      if (feat?.enabled && (!feat.expires_at || new Date(feat.expires_at) > new Date())) {
        aiEnabled = true;
      }
      // Fallback gate: any Pro store (active or trialing) gets real AI even if
      // the per-feature row hasn't been seeded yet. This keeps the live demo
      // working for fresh signups immediately after onboarding.
      if (!aiEnabled) {
        const { data: sub } = await supabaseAdmin
          .from("store_subscriptions")
          .select("plan_key,status,is_trial,trial_ends_at,current_period_end")
          .eq("store_id", storeId)
          .maybeSingle();
        if (sub) {
          const now = Date.now();
          const trialLive =
            sub.is_trial && (!sub.trial_ends_at || new Date(sub.trial_ends_at).getTime() > now);
          const periodLive =
            !sub.current_period_end || new Date(sub.current_period_end).getTime() > now;
          const planOk = sub.plan_key === "pro" || sub.plan_key === "business";
          const statusOk = sub.status === "active" || sub.status === "trialing";
          if (planOk && statusOk && (trialLive || periodLive)) aiEnabled = true;
        }
      }
    }

    // Always scope to ONE store. With no store resolved, match nothing
    // (never fall back to every tenant's catalog).
    const scopeId = storeId || "00000000-0000-0000-0000-000000000000";
    const productsQuery = supabaseAdmin
      .from("products")
      .select("id,name,description,price,rating,badge,stock,category_id")
      .eq("active", true)
      .eq("store_id", scopeId);

    const addonsQuery = supabaseAdmin
      .from("add_ons")
      .select("id,name,price")
      .eq("active", true)
      .eq("store_id", scopeId);

    const [{ data: products }, { data: addons }, { data: sizes }] = await Promise.all([
      productsQuery.order("display_order").limit(80),
      addonsQuery.order("display_order").limit(40),
      supabaseAdmin
        .from("product_sizes")
        .select("id,product_id,label,price,products!inner(store_id)")
        .eq("products.store_id", scopeId)
        .order("display_order")
        .limit(300),
    ]);

    // === Generic (non-AI) fallback ===
    // Visitors (non-owners) never get the live LLM, regardless of plan, to
    // protect the store owner's AI credit budget. They get static suggestions
    // and rely on the greeting-card flow on the client to add to cart.
    const lastUserMsg = [...data.messages].reverse().find((m) => m.role === "user")?.content || "";
    if (!aiEnabled || !isOwner) {
      return genericFallback((products || []) as any, lastUserMsg, isOwner);
    }

    // Quota gate: hard cap on AI conversations for this plan/trial state.
    // Owner-only: return a structured creditError instead of throwing so the
    // client can render it inline in the chat without a hard toast.
    if (storeId) {
      try {
        await assertQuota(storeId, "ai_chat", 1);
      } catch (e) {
        if (e instanceof QuotaExceededError) {
          // Silent fallback — never surface quota errors to the user.
          console.warn("[sales-chat] quota exhausted, serving generic fallback");
          return genericFallback((products || []) as any, lastUserMsg, isOwner);
        }
        throw e;
      }
    }

    if (!getAiConfig()) {
      console.warn("[sales-chat] AI_API_KEY missing, serving generic fallback");
      return genericFallback((products || []) as any, lastUserMsg, isOwner);
    }

    const sizesByProduct: Record<string, { label: string; price: number }[]> = {};
    for (const s of (sizes || []) as any[]) {
      (sizesByProduct[s.product_id] ||= []).push({ label: s.label, price: Number(s.price) });
    }

    const catalog = (products || []).map((p) => ({
      id: p.id,
      name: p.name,
      desc: (p.description || "").slice(0, 120),
      price: Number(p.price),
      rating: Number(p.rating),
      badge: p.badge || undefined,
      sizes: sizesByProduct[p.id] || [],
    }));
    const addonList = (addons || []).map((a) => ({
      id: a.id,
      name: a.name,
      price: Number(a.price),
    }));

    let storeName = "החנות";
    if (storeId) {
      const { data: s } = await supabaseAdmin.from("stores").select("name").eq("id", storeId).maybeSingle();
      if (s?.name) storeName = s.name;
    }

    const system = `אתה מוכרן דיגיטלי חם, ידידותי וממוקד של "${storeName}". דבר עברית בלבד, קצר וקליל (1-2 משפטים, אימוג'י קטן מותר).

מטרה: להוביל את הלקוח בעדינות עד סגירת מכירה בשלבים:
1. אם אין תקציב — הצע quickReplies של טווחי מחירים (למשל "עד 150₪", "150-300₪", "300-500₪", "500₪+").
2. כשיש תקציב/אירוע — החזר 3-5 מוצרים מתאימים ב-recommendedProductIds (קרוסלה לבחירה).
3. כשהלקוח בחר מוצר ספציפי — אל תחזיר recommendedProductIds, רק suggestedAddonIds (3-5 תוספות בקרוסלה) ו-suggestedSizeLabel אם רלוונטי.
4. כשהלקוח מאשר את הבחירה — action="checkout".

חוקים:
- אל תמציא מוצרים. השתמש רק ב-IDs מהקטלוג.
- תמיד 2-4 quickReplies קצרים ולחיצים (טווחי מחיר, אירועים, "כן/לא", "לתשלום").
- אל תחזור על אותם מוצרים שכבר הוצגו אלא אם הלקוח ביקש.

קטלוג: ${JSON.stringify(catalog)}
תוספות: ${JSON.stringify(addonList)}

החזר JSON בלבד:
{
  "reply": "טקסט קצר",
  "recommendedProductIds": ["id", ...],
  "suggestedAddonIds": ["id"],
  "suggestedSizeLabel": "label|null",
  "quickReplies": ["..."],
  "action": "browse|recommend|pick_product|checkout"
}`;

    let json: any;
    try {
      const res = await aiChatCompletion(
        [{ role: "system", content: system }, ...(data.messages as ChatMessage[])],
        { json: true },
      );
      if (!res.ok) {
        console.warn("[sales-chat] upstream", res.status, "→ generic fallback");
        return genericFallback((products || []) as any, lastUserMsg, isOwner);
      }
      json = await res.json();
    } catch (e) {
      console.warn("[sales-chat] upstream threw → generic fallback", e);
      return genericFallback((products || []) as any, lastUserMsg, isOwner);
    }
    const content = json?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = { reply: content }; }

    const recIds: string[] = Array.isArray(parsed.recommendedProductIds)
      ? parsed.recommendedProductIds.filter((x: any) => typeof x === "string").slice(0, 6)
      : (parsed.recommendedProductId ? [parsed.recommendedProductId] : []);

    if (storeId) {
      try { await consumeQuota(storeId, "ai_chat", 1); } catch {}
    }

    return {
      reply: parsed.reply || "אני כאן לעזור — איזה זר אתם מחפשים?",
      recommendedProductIds: recIds,
      suggestedAddonIds: Array.isArray(parsed.suggestedAddonIds) ? parsed.suggestedAddonIds.slice(0, 6) : [],
      suggestedSizeLabel: parsed.suggestedSizeLabel || null,
      quickReplies: Array.isArray(parsed.quickReplies) ? parsed.quickReplies.slice(0, 4).map((s: any) => String(s).slice(0, 40)) : [],
      action: parsed.action || "browse",
      aiEnabled: true,
      isOwner,
      creditError: false as boolean,
    };
  });

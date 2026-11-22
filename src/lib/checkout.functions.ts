import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader, getRequestHost } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createMeshulamProcess } from "./meshulam.server";
import { canTakeOrders, computeBillingState, type SubRow } from "./billing-state";

// All storefront orders go through here. Prices, shipping and coupon discount
// are recomputed in the database (phase1_checkout), never trusted from the browser.

const ItemSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(1).max(100),
  sizeLabel: z.string().max(100).optional(),
  cardText: z.string().max(2000).optional(),
  extras: z
    .array(z.object({ id: z.string().uuid(), qty: z.number().int().min(1).max(100).optional() }))
    .max(50)
    .optional(),
});

const ContactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^[\d\-+ ()]{9,20}$/),
  email: z.string().trim().email().max(255),
  address: z.string().trim().min(4).max(255),
  notes: z.string().max(2000).optional().default(""),
});

const PlaceOrderSchema = z.object({
  storeId: z.string().uuid(),
  payment: z.enum(["bit", "credit"]),
  coupon: z.string().max(64).optional().nullable(),
  // One entry per delivery address. Single checkout = one stop.
  stops: z
    .array(z.object({ contact: ContactSchema, items: z.array(ItemSchema).min(1).max(100) }))
    .min(1)
    .max(10),
});

type Placed = { id: string; order_number: string; receipt_token: string; total: number };

async function currentUserId(): Promise<string | null> {
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data } = await supabaseAdmin.auth.getUser(auth.slice(7));
  return data.user?.id ?? null;
}

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((d) => PlaceOrderSchema.parse(d))
  .handler(async ({ data }) => {
    // Soft paywall: after the trial / paid period plus a short grace, the shop stops taking orders.
    const { data: sub } = await supabaseAdmin
      .from("store_subscriptions")
      .select("status,is_trial,trial_ends_at,current_period_end")
      .eq("store_id", data.storeId)
      .maybeSingle();
    if (!canTakeOrders(computeBillingState(sub as SubRow | null))) {
      return { ok: false as const, error: "החנות לא מקבלת הזמנות אונליין כרגע. אפשר ליצור קשר עם החנות ישירות." };
    }

    const userId = await currentUserId();
    const orders: Placed[] = [];
    for (let i = 0; i < data.stops.length; i++) {
      const stop = data.stops[i];
      const { data: res, error } = await supabaseAdmin.rpc("phase1_checkout" as any, {
        _store: data.storeId,
        _contact: stop.contact,
        _items: stop.items,
        // Coupons apply to single-address orders only (as before).
        _coupon: data.stops.length === 1 ? data.coupon || null : null,
        _payment: data.payment,
        _user: userId,
      });
      if (error || !res) {
        console.warn("[checkout] phase1_checkout failed", error?.message);
        const msg = String(error?.message || "");
        if (msg.includes("coupon")) return { ok: false as const, error: "הקופון אינו זמין" };
        if (msg.includes("product") || msg.includes("size") || msg.includes("addon"))
          return { ok: false as const, error: "אחד המוצרים בסל כבר לא זמין. רעננו את הסל ונסו שוב." };
        return { ok: false as const, error: "שגיאה ביצירת ההזמנה" };
      }
      const placed = res as unknown as Placed;
      orders.push({ ...placed, total: Number(placed.total) });
    }

    if (data.payment === "credit") {
      // Charge the first order, at the server-computed total.
      const first = orders[0];
      const c = data.stops[0].contact;
      const origin = `https://${getRequestHost()}`;
      const pay = await createMeshulamProcess({
        orderId: first.id,
        sum: first.total,
        fullName: c.name,
        phone: c.phone,
        email: c.email,
        origin,
        receiptToken: first.receipt_token,
      });
      return {
        ok: true as const,
        orders,
        paymentUrl: "url" in pay ? pay.url : null,
        paymentError: "error" in pay ? pay.error : null,
      };
    }

    // Bit: the shop is notified over WhatsApp by the browser.
    await supabaseAdmin
      .from("orders")
      .update({ sent_to_whatsapp_at: new Date().toISOString() })
      .in("id", orders.map((o) => o.id));
    return { ok: true as const, orders, paymentUrl: null, paymentError: null };
  });

export const getOrderReceipt = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ orderId: z.string().uuid(), token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin.rpc("get_order_receipt" as any, {
      _order: data.orderId,
      _token: data.token,
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    return {
      order_number: String(row.order_number),
      status: String(row.status),
      total: Number(row.total),
      customer_name: String(row.customer_name),
      delivery_address: String(row.delivery_address),
      payment_status: String(row.payment_status),
    };
  });

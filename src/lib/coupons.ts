import { supabase } from "@/integrations/supabase/client";

export type CouponResult = { valid: boolean; message: string; discount: number; coupon_id: string | null; code: string };

export async function validateCoupon(code: string, subtotal: number): Promise<CouponResult> {
  const trimmed = code.trim();
  if (!trimmed) return { valid: false, message: "", discount: 0, coupon_id: null, code: "" };
  const { data, error } = await supabase.rpc("validate_coupon", { _code: trimmed, _subtotal: subtotal });
  if (error) return { valid: false, message: error.message, discount: 0, coupon_id: null, code: trimmed };
  const row = (data as any[])?.[0];
  return {
    valid: !!row?.valid,
    message: row?.message || "",
    discount: Number(row?.discount || 0),
    coupon_id: row?.coupon_id ?? null,
    code: trimmed,
  };
}

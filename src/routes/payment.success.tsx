import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/payment/success")({
  validateSearch: (s: Record<string, unknown>) => ({ order: (s.order as string) || "" }),
  head: () => ({ meta: [{ title: "תשלום בוצע" }] }),
  component: SuccessPage,
});

function SuccessPage() {
  const { order } = useSearch({ from: "/payment/success" });
  const { clear } = useCart();
  useEffect(() => { clear(); if (order) supabase.from("orders").update({ payment_status: "paid" }).eq("id", order); }, [order, clear]);
  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="bg-card border border-border rounded-3xl p-8 max-w-md w-full text-center">
        <CheckCircle2 className="mx-auto text-emerald-500 mb-4" size={64}/>
        <h1 className="text-2xl font-black mb-2">התשלום בוצע בהצלחה!</h1>
        <p className="text-muted-foreground text-sm mb-6">תודה על ההזמנה. נעדכן אותך בוואטסאפ על מצב המשלוח.</p>
        {order ? (
          <Link to="/track/$orderId" params={{ orderId: order }} className="block bg-primary text-primary-foreground font-bold py-3 rounded-xl">מעקב אחר ההזמנה</Link>
        ) : <Link to="/" className="block bg-primary text-primary-foreground font-bold py-3 rounded-xl">חזרה לחנות</Link>}
      </div>
    </div>
  );
}

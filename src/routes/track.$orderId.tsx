import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getOrderReceipt } from "@/lib/checkout.functions";
import { receiptTokenFor } from "@/lib/receipts";
import { CheckCircle2, Clock, Package, Truck } from "lucide-react";

export const Route = createFileRoute("/track/$orderId")({
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s.t === "string" ? s.t : undefined }),
  head: () => ({ meta: [{ title: "מעקב הזמנה" }] }),
  component: TrackPage,
});

const STEPS = [
  { key: "pending", label: "ממתינה לאישור", icon: Clock },
  { key: "confirmed", label: "אושרה", icon: CheckCircle2 },
  { key: "preparing", label: "בהכנה", icon: Package },
  { key: "out_for_delivery", label: "בדרך אליך", icon: Truck },
  { key: "delivered", label: "נמסרה", icon: CheckCircle2 },
];

function TrackPage() {
  const { orderId } = Route.useParams();
  const [order, setOrder] = useState<{ order_number: string; status: string; total: number; customer_name: string; delivery_address: string } | null>(null);

  const { t } = Route.useSearch();
  const receiptFn = useServerFn(getOrderReceipt);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancel = false;
    const token = t || receiptTokenFor(orderId);
    async function load() {
      // Customers: unguessable receipt token. Shop staff: their own RLS access.
      if (token) {
        const r = await receiptFn({ data: { orderId, token } }).catch(() => null);
        if (!cancel) { if (r) setOrder(r); else setMissing(true); }
        return;
      }
      const { data } = await supabase.from("orders").select("order_number,status,total,customer_name,delivery_address").eq("id", orderId).maybeSingle();
      if (!cancel) { if (data) setOrder(data as never); else setMissing(true); }
    }
    load();
    const timer = setInterval(load, 20000);
    return () => { cancel = true; clearInterval(timer); };
  }, [orderId, t, receiptFn]);

  if (!order && missing) return <div dir="rtl" className="min-h-screen flex items-center justify-center text-muted-foreground p-6 text-center">לא מצאנו את ההזמנה. פתחו את הקישור מהודעת האישור.</div>;
  if (!order) return <div dir="rtl" className="min-h-screen flex items-center justify-center text-muted-foreground">טוען...</div>;
  const idx = STEPS.findIndex((s) => s.key === order.status);

  return (
    <div dir="rtl" className="min-h-screen bg-background p-4">
      <main className="max-w-xl mx-auto py-8 space-y-6">
        <div className="text-center">
          <CheckCircle2 size={56} className="mx-auto text-primary mb-2"/>
          <h1 className="text-2xl font-black">תודה {order.customer_name}!</h1>
          <p className="text-muted-foreground text-sm">הזמנה #{order.order_number}</p>
        </div>
        <div className="bg-card border border-border rounded-3xl p-6 space-y-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i <= idx && idx >= 0;
            return (
              <div key={s.key} className={`flex items-center gap-3 ${active ? "text-foreground" : "text-muted-foreground"}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${active ? "bg-primary text-primary-foreground" : "bg-muted"}`}><Icon size={18}/></div>
                <p className="font-bold">{s.label}</p>
              </div>
            );
          })}
          {order.status === "cancelled" && <p className="text-destructive font-bold">ההזמנה בוטלה</p>}
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-sm">
          <p><span className="text-muted-foreground">כתובת: </span>{order.delivery_address}</p>
          <p className="mt-1"><span className="text-muted-foreground">סה״כ: </span>₪{order.total}</p>
        </div>
        <Link to="/" className="block text-center text-sm text-primary hover:underline">חזרה לחנות</Link>
      </main>
    </div>
  );
}

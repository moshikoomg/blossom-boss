import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, Package, Truck } from "lucide-react";

export const Route = createFileRoute("/track/$orderId")({
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

  useEffect(() => {
    let cancel = false;
    async function load() {
      const { data } = await supabase.from("orders").select("order_number,status,total,customer_name,delivery_address").eq("id", orderId).maybeSingle();
      if (!cancel && data) setOrder(data as never);
    }
    load();
    const ch = supabase.channel(`order-${orderId}`).on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, load).subscribe();
    return () => { cancel = true; supabase.removeChannel(ch); };
  }, [orderId]);

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

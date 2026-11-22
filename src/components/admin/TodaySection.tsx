import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { MapPin, Phone, MessageCircle } from "lucide-react";
import {
  NEXT_STEP,
  OPEN_STATUSES,
  buildPrepList,
  dueAt,
  greeting,
  sameDay,
  startOfDay,
  whatsappLink,
  type OrderStatus,
  type PrepLine,
} from "@/lib/florist";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { SetupWizard, useSetupSnapshot, setupRatioFromState } from "@/components/SetupWizard";
import { celebrate } from "@/lib/celebrate";

type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_notes: string | null;
  scheduled_for: string | null;
  created_at: string;
  total: number;
  status: OrderStatus;
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "חדשה",
  confirmed: "אושרה",
  preparing: "בהכנה",
  out_for_delivery: "בדרך",
  delivered: "נמסרה",
  cancelled: "בוטלה",
};

/** Hands a prep list to the Suppliers screen as a ready purchase-order draft. */
export const PREP_DRAFT_KEY = "bb_po_prefill";
function goto(section: string) {
  window.dispatchEvent(new CustomEvent("tmm:admin-goto-section", { detail: section }));
}

export function TodaySection() {
  const { store } = useStore();
  const storeId = store?.id ?? null;
  const [orders, setOrders] = useState<Order[]>([]);
  const [prep, setPrep] = useState<PrepLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const setup = useSetupSnapshot();
  const setupRatio = setupRatioFromState(setup.snap);

  const load = useCallback(async () => {
    if (!storeId) return;
    const since = startOfDay(new Date(), -14).toISOString();
    const { data: o } = await supabase
      .from("orders")
      .select(
        "id,customer_name,customer_phone,delivery_address,delivery_notes,scheduled_for,created_at,total,status",
      )
      .eq("store_id", storeId)
      .is("deleted_at", null)
      .or(`created_at.gte.${since},scheduled_for.gte.${since}`)
      .order("created_at", { ascending: false })
      .limit(400);
    const list = (o || []) as Order[];
    setOrders(list);

    const end = startOfDay(new Date(), 2);
    const ids = list
      .filter((x) => OPEN_STATUSES.includes(x.status) && dueAt(x) < end)
      .map((x) => x.id);
    if (ids.length) {
      const { data: items } = await supabase
        .from("order_items")
        .select("product_name,quantity")
        .in("order_id", ids);
      setPrep(buildPrepList((items || []) as { product_name: string; quantity: number }[]));
    } else setPrep([]);
    setLoaded(true);
  }, [storeId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const now = new Date();
  const tomorrow = startOfDay(now, 1);
  const open = orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const todayList = open.filter((o) => dueAt(o) < tomorrow).sort((a, b) => +dueAt(a) - +dueAt(b));
  const tomorrowList = open
    .filter((o) => sameDay(dueAt(o), tomorrow))
    .sort((a, b) => +dueAt(a) - +dueAt(b));
  const laterNew = open.filter((o) => o.status === "pending" && dueAt(o) >= startOfDay(now, 2));

  async function advance(o: Order) {
    const step = NEXT_STEP[o.status];
    if (!step || !storeId) return;
    setBusyId(o.id);
    const { error } = await supabase
      .from("orders")
      .update({ status: step.to })
      .eq("id", o.id)
      .eq("store_id", storeId);
    setBusyId(null);
    if (error) {
      toast.error("לא נשמר. נסו שוב.");
      return;
    }
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: step.to } : x)));
  }

  function orderFromSupplier() {
    try {
      sessionStorage.setItem(PREP_DRAFT_KEY, JSON.stringify(prep));
    } catch {
      /* storage blocked */
    }
    goto("suppliers");
  }

  const nothingYet = loaded && open.length === 0;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">
          {format(now, "EEEE, d בMMMM", { locale: he })}
        </p>
        <h1 className="text-2xl md:text-3xl font-black mt-0.5">{greeting(now)} 🌷</h1>
      </header>

      <SubscriptionBanner />

      {setupRatio < 1 &&
        (showSetup ? (
          <SetupWizard
            snap={setup.snap}
            setSnap={setup.setSnap}
            reload={setup.reload}
            onAllDone={() => {
              celebrate({ intense: true });
              setShowSetup(false);
            }}
          />
        ) : (
          <button
            onClick={() => setShowSetup(true)}
            className="w-full text-right flex items-center justify-between gap-3 rounded-2xl bg-primary/5 px-4 py-3 text-sm hover:bg-primary/10"
          >
            <span>
              <b>החנות כמעט מוכנה.</b> נשארו {4 - Math.round(setupRatio * 4)} צעדים קצרים.
            </span>
            <span className="font-bold text-primary shrink-0">להשלמה ←</span>
          </button>
        ))}

      {nothingYet ? (
        <div className="text-center py-16">
          <p className="text-4xl" aria-hidden>
            🌿
          </p>
          <p className="font-bold mt-3">אין הזמנות פתוחות כרגע</p>
          <p className="text-sm text-muted-foreground mt-1">הזמנות חדשות יופיעו כאן אוטומטית.</p>
        </div>
      ) : (
        <>
          <OrderList
            title="להיום"
            orders={todayList}
            now={now}
            busyId={busyId}
            onAdvance={advance}
            empty="אין משלוחים להיום."
          />
          {tomorrowList.length > 0 && (
            <OrderList
              title="מחר"
              orders={tomorrowList}
              now={now}
              busyId={busyId}
              onAdvance={advance}
            />
          )}
          {laterNew.length > 0 && (
            <OrderList
              title="חדשות לימים הבאים"
              orders={laterNew}
              now={now}
              busyId={busyId}
              onAdvance={advance}
            />
          )}
          {prep.length > 0 && (
            <section>
              <h2 className="text-lg font-black mb-3">מה להכין</h2>
              <div className="rounded-2xl border border-border bg-card">
                <ul className="divide-y divide-border">
                  {prep.map((p) => (
                    <li key={p.name} className="flex items-center justify-between px-4 py-3">
                      <span>{p.name}</span>
                      <span className="font-black tabular-nums">×{p.qty}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border p-3">
                  <button
                    onClick={orderFromSupplier}
                    className="text-sm font-bold text-primary hover:underline"
                  >
                    להזמין מספק לפי הרשימה ←
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function OrderList({
  title,
  orders,
  now,
  busyId,
  onAdvance,
  empty,
}: {
  title: string;
  orders: Order[];
  now: Date;
  busyId: string | null;
  onAdvance: (o: Order) => void;
  empty?: string;
}) {
  return (
    <section>
      <h2 className="text-lg font-black mb-3">
        {title}{" "}
        {orders.length > 0 && (
          <span className="text-muted-foreground font-bold">· {orders.length}</span>
        )}
      </h2>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="rounded-2xl border border-border bg-card divide-y divide-border">
          {orders.map((o) => (
            <OrderRow
              key={o.id}
              o={o}
              now={now}
              busy={busyId === o.id}
              onAdvance={() => onAdvance(o)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function OrderRow({
  o,
  now,
  busy,
  onAdvance,
}: {
  o: Order;
  now: Date;
  busy: boolean;
  onAdvance: () => void;
}) {
  const due = dueAt(o);
  const overdue = due < startOfDay(now);
  const step = NEXT_STEP[o.status];
  const wa = whatsappLink(o.customer_phone, `שלום ${o.customer_name}, לגבי ההזמנה שלך 🌸`);
  const time = overdue ? "באיחור" : o.scheduled_for ? format(due, "HH:mm") : "בהקדם";
  return (
    <li className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        <span
          className={`w-14 shrink-0 text-sm font-black tabular-nums pt-0.5 ${overdue ? "text-rose-600" : "text-foreground"}`}
        >
          {time}
        </span>
        <div className="min-w-0">
          <p className="font-bold">
            {o.customer_name}{" "}
            <span className="text-xs font-semibold text-muted-foreground">
              · {STATUS_LABEL[o.status]}
            </span>
          </p>
          {o.delivery_address && (
            <p className="text-sm text-muted-foreground truncate">{o.delivery_address}</p>
          )}
          {o.delivery_notes && (
            <p className="text-sm text-muted-foreground truncate">{o.delivery_notes}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 sm:shrink-0 mr-[72px] sm:mr-0">
        {o.customer_phone && (
          <a
            href={`tel:${o.customer_phone}`}
            className="p-2.5 rounded-xl text-muted-foreground hover:bg-muted"
            aria-label={`חיוג ל${o.customer_name}`}
          >
            <Phone size={18} />
          </a>
        )}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="p-2.5 rounded-xl text-muted-foreground hover:bg-muted"
            aria-label={`וואטסאפ ל${o.customer_name}`}
          >
            <MessageCircle size={18} />
          </a>
        )}
        {o.delivery_address && (
          <a
            href={`https://waze.com/ul?q=${encodeURIComponent(o.delivery_address)}`}
            target="_blank"
            rel="noreferrer"
            className="p-2.5 rounded-xl text-muted-foreground hover:bg-muted"
            aria-label="ניווט לכתובת"
          >
            <MapPin size={18} />
          </a>
        )}
        {step && (
          <button
            onClick={onAdvance}
            disabled={busy}
            className="mr-1 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "…" : step.label}
          </button>
        )}
      </div>
    </li>
  );
}

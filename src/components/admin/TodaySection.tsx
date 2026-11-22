import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  Clock,
  MapPin,
  Phone,
  MessageCircle,
  RefreshCw,
  ShoppingBasket,
  Truck,
  Inbox,
  Wallet,
  CalendarDays,
  ChevronDown,
} from "lucide-react";
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
import { StoreLinkCard } from "@/components/StoreLinkCard";
import { TrialProgress } from "@/components/TrialProgress";
import { SetupWizard, useSetupSnapshot, setupRatioFromState } from "@/components/SetupWizard";
import { CriticalSetupMeter } from "@/components/CriticalSetupMeter";
import { QuotaUsagePanel } from "@/components/QuotaUsagePanel";
import { PlanOverviewCard } from "@/components/FeaturesPanel";
import { celebrate } from "@/lib/celebrate";

type Order = {
  id: string;
  order_number: string | null;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_notes: string | null;
  scheduled_for: string | null;
  created_at: string;
  total: number;
  status: OrderStatus;
  payment_status: string | null;
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "חדשה",
  confirmed: "אושרה",
  preparing: "בהכנה",
  out_for_delivery: "בדרך",
  delivered: "נמסרה",
  cancelled: "בוטלה",
};
const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-blue-100 text-blue-900",
  preparing: "bg-purple-100 text-purple-900",
  out_for_delivery: "bg-indigo-100 text-indigo-900",
  delivered: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-rose-100 text-rose-900",
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
  const [loading, setLoading] = useState(true);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const setup = useSetupSnapshot();
  const setupRatio = setupRatioFromState(setup.snap);
  const jumpRef = useRef<(() => void) | null>(null);
  const setupRef = useRef<HTMLDetailsElement | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const since = startOfDay(new Date(), -14).toISOString();
    const [{ data: o }, { data: s }] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id,order_number,customer_name,customer_phone,delivery_address,delivery_notes,scheduled_for,created_at,total,status,payment_status",
        )
        .eq("store_id", storeId)
        .is("deleted_at", null)
        .or(`created_at.gte.${since},scheduled_for.gte.${since}`)
        .order("created_at", { ascending: false })
        .limit(400),
      supabase.from("stores").select("created_at").eq("id", storeId).maybeSingle(),
    ]);
    const list = (o || []) as Order[];
    setOrders(list);
    setCreatedAt((s as { created_at?: string } | null)?.created_at ?? null);

    // What has to be made today and tomorrow.
    const end = startOfDay(new Date(), 2);
    const prepIds = list
      .filter((x) => OPEN_STATUSES.includes(x.status) && dueAt(x) < end)
      .map((x) => x.id);
    if (prepIds.length) {
      const { data: items } = await supabase
        .from("order_items")
        .select("product_name,quantity")
        .in("order_id", prepIds);
      setPrep(buildPrepList((items || []) as { product_name: string; quantity: number }[]));
    } else setPrep([]);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);
  // Keep the screen fresh while it is open on the shop computer.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const now = new Date();
  const tomorrow = startOfDay(now, 1);
  const open = orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const todayList = open
    .filter((o) => dueAt(o) < tomorrow) // today + anything overdue
    .sort((a, b) => +dueAt(a) - +dueAt(b));
  const tomorrowList = open
    .filter((o) => sameDay(dueAt(o), tomorrow))
    .sort((a, b) => +dueAt(a) - +dueAt(b));
  const laterNew = open.filter((o) => o.status === "pending" && dueAt(o) >= startOfDay(now, 2));
  const pendingCount = open.filter((o) => o.status === "pending").length;
  const todayRevenue = orders
    .filter((o) => o.status !== "cancelled" && sameDay(new Date(o.created_at), now))
    .reduce((s, o) => s + Number(o.total || 0), 0);
  const deliveredToday = orders.filter(
    (o) => o.status === "delivered" && sameDay(dueAt(o), now),
  ).length;

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
      toast.error("העדכון לא נשמר. נסו שוב.");
      return;
    }
    setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, status: step.to } : x)));
    toast.success(`${o.customer_name}: ${STATUS_LABEL[step.to]}`);
    if (step.to === "delivered") void load();
  }

  function orderFromSupplier() {
    try {
      sessionStorage.setItem(PREP_DRAFT_KEY, JSON.stringify(prep));
    } catch {
      /* storage blocked */
    }
    goto("suppliers");
  }

  const dateLabel = format(now, "EEEE, d בMMMM", { locale: he });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">{dateLabel}</p>
          <h1 className="text-2xl md:text-3xl font-black">
            {greeting(now)}
            {store?.name ? `, ${store.name}` : ""} 🌷
          </h1>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted"
          aria-label="רענן"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> רענון
        </button>
      </div>

      <SubscriptionBanner />
      <TrialProgress
        createdAt={createdAt}
        setupRatio={setupRatio}
        nextTaskLabel={setupRatio >= 1 ? null : "השלמת הקמת החנות"}
        onJumpToNext={() => {
          if (setupRef.current) setupRef.current.open = true;
          jumpRef.current?.();
          setupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      {/* At a glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={Inbox}
          label="ממתינות לאישור"
          value={pendingCount}
          tone={pendingCount ? "warn" : undefined}
        />
        <Stat
          icon={Truck}
          label="משלוחים היום"
          value={todayList.length}
          hint={deliveredToday ? `${deliveredToday} כבר נמסרו` : undefined}
        />
        <Stat icon={CalendarDays} label="מחר" value={tomorrowList.length} />
        <Stat
          icon={Wallet}
          label="מכירות היום"
          value={`₪${todayRevenue.toLocaleString("he-IL")}`}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <OrderGroup
            title="להיום"
            empty="אין משלוחים פתוחים להיום. יום רגוע 🌿"
            orders={todayList}
            now={now}
            busyId={busyId}
            onAdvance={advance}
          />
          <OrderGroup
            title="מחר"
            empty="עוד אין הזמנות למחר."
            orders={tomorrowList}
            now={now}
            busyId={busyId}
            onAdvance={advance}
          />
          {laterNew.length > 0 && (
            <OrderGroup
              title="הזמנות חדשות לימים הבאים"
              empty=""
              orders={laterNew}
              now={now}
              busyId={busyId}
              onAdvance={advance}
            />
          )}
        </div>

        <aside className="space-y-5">
          <section
            className="bg-card border border-border rounded-2xl p-4"
            aria-labelledby="prep-title"
          >
            <div className="flex items-center gap-2 mb-3">
              <ShoppingBasket size={18} className="text-primary" />
              <h2 id="prep-title" className="font-black">
                מה להכין היום ומחר
              </h2>
            </div>
            {prep.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                כשיהיו הזמנות, נסכם כאן כמה מכל מוצר צריך להכין.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {prep.map((p) => (
                    <li key={p.name} className="flex items-center justify-between py-2 text-sm">
                      <span className="truncate">{p.name}</span>
                      <span className="font-black tabular-nums bg-muted rounded-lg px-2 py-0.5">
                        ×{p.qty}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={orderFromSupplier}
                  className="mt-3 w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90"
                >
                  הזמנה מספק לפי הרשימה
                </button>
              </>
            )}
          </section>

          <section className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <h2 className="font-black mb-1">פעולות מהירות</h2>
            <QuickLink label="כל ההזמנות" onClick={() => goto("orders")} />
            <QuickLink label="הוספת מוצר" onClick={() => goto("products")} />
            <QuickLink label="ספקים והזמנות רכש" onClick={() => goto("suppliers")} />
            <QuickLink label="דוחות ומכירות" onClick={() => goto("reports")} />
          </section>
        </aside>
      </div>

      <details
        ref={setupRef}
        open={setupRatio < 1}
        className="group bg-card border border-border rounded-2xl"
      >
        <summary className="cursor-pointer list-none p-4 flex items-center justify-between font-black">
          <span>
            הקמת החנות והחשבון {setupRatio < 1 ? `(${Math.round(setupRatio * 100)}%)` : "✓"}
          </span>
          <ChevronDown size={18} className="transition group-open:rotate-180" />
        </summary>
        <div className="p-4 pt-0 space-y-4">
          <StoreLinkCard />
          <CriticalSetupMeter />
          <SetupWizard
            snap={setup.snap}
            setSnap={setup.setSnap}
            reload={setup.reload}
            onAllDone={() => celebrate({ intense: true })}
            registerJump={(fn) => {
              jumpRef.current = fn;
            }}
          />
          {storeId && <QuotaUsagePanel storeId={storeId} />}
          <PlanOverviewCard />
        </div>
      </details>
    </div>
  );
}

function Stat({
  icon: I,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Inbox;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 bg-card ${tone === "warn" ? "border-amber-300 bg-amber-50/60" : "border-border"}`}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold">
        <I size={15} aria-hidden /> {label}
      </div>
      <p className="text-2xl font-black mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-right px-3 py-2.5 rounded-xl bg-muted/60 hover:bg-muted text-sm font-medium flex items-center justify-between"
    >
      {label} <span aria-hidden>←</span>
    </button>
  );
}

function OrderGroup({
  title,
  empty,
  orders,
  now,
  busyId,
  onAdvance,
}: {
  title: string;
  empty: string;
  orders: Order[];
  now: Date;
  busyId: string | null;
  onAdvance: (o: Order) => void;
}) {
  return (
    <section aria-label={title}>
      <h2 className="font-black text-lg mb-2">
        {title} <span className="text-muted-foreground font-bold text-sm">({orders.length})</span>
      </h2>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-card border border-dashed border-border rounded-2xl p-4">
          {empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <OrderCard
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

function OrderCard({
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
  const wa = whatsappLink(
    o.customer_phone,
    `שלום ${o.customer_name}, כאן מהחנות לגבי ההזמנה שלך 🌸`,
  );
  const time = o.scheduled_for ? format(due, sameDay(due, now) ? "HH:mm" : "dd/MM HH:mm") : "בהקדם";
  return (
    <li className="bg-card border border-border rounded-2xl p-3 md:p-4">
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 rounded-xl px-2.5 py-1.5 text-center min-w-[64px] ${overdue ? "bg-rose-100 text-rose-900" : "bg-muted"}`}
        >
          <Clock size={13} className="mx-auto mb-0.5" aria-hidden />
          <p className="text-xs font-black tabular-nums">{overdue ? "באיחור" : time}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold truncate">{o.customer_name}</p>
            <span
              className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${STATUS_COLOR[o.status]}`}
            >
              {STATUS_LABEL[o.status]}
            </span>
            {o.payment_status === "paid" && (
              <span className="text-[11px] font-bold rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-800">
                שולם
              </span>
            )}
            <span className="text-xs text-muted-foreground mr-auto tabular-nums">
              ₪{Number(o.total || 0).toLocaleString("he-IL")}
            </span>
          </div>
          {o.delivery_address && (
            <a
              href={`https://waze.com/ul?q=${encodeURIComponent(o.delivery_address)}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted-foreground flex items-center gap-1 mt-1 hover:underline"
            >
              <MapPin size={13} aria-hidden />{" "}
              <span className="truncate">{o.delivery_address}</span>
            </a>
          )}
          {o.delivery_notes && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">📝 {o.delivery_notes}</p>
          )}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {step && (
              <button
                onClick={onAdvance}
                disabled={busy}
                className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? "שומר…" : step.label}
              </button>
            )}
            {o.customer_phone && (
              <a
                href={`tel:${o.customer_phone}`}
                className="h-10 px-3 rounded-xl border border-border text-sm flex items-center gap-1.5 hover:bg-muted"
                aria-label={`התקשר ל${o.customer_name}`}
              >
                <Phone size={15} aria-hidden /> חיוג
              </a>
            )}
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                className="h-10 px-3 rounded-xl border border-border text-sm flex items-center gap-1.5 hover:bg-muted"
                aria-label={`וואטסאפ ל${o.customer_name}`}
              >
                <MessageCircle size={15} aria-hidden /> וואטסאפ
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

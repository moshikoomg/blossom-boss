import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setSupabaseStoreHeader } from "@/lib/store-context";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteStoreCompletely, listPlatformShops } from "@/lib/platform-admin.functions";
import { listAllBilling, listBillingEvents, type BillingBreakdown } from "@/lib/billing.functions";
import { syncStoreWithTemplate } from "@/lib/sync-store.functions";
import { PLATFORM_TEMPLATE_STORE_ID } from "@/lib/platform-template";
import { toast } from "sonner";
import { Building2, CreditCard, Layers, ListChecks, Trash2, Pencil, LogIn, Sparkles, X, Plus, Check, Receipt, History, RefreshCw, Gauge } from "lucide-react";

type Tab = "shops" | "features" | "matrix" | "billing" | "revenue" | "history" | "quotas";
type Shop = Awaited<ReturnType<typeof listPlatformShops>>[number];
type Feature = { id: string; key: string; name: string; description: string; monthly_price: number; currency: string; category: string; active: boolean; display_order: number; stripe_price_id?: string | null; stripe_product_id?: string | null };
type StoreFeature = { id: string; store_id: string; feature_key: string; enabled: boolean; expires_at: string | null };
type BillingToken = { id: string; store_id: string; provider: string; customer_token: string; payment_method_brand: string; last4: string; exp_month: number | null; exp_year: number | null; is_default: boolean; created_at: string };

export function PlatformPanel({ onImpersonate }: { onImpersonate: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("shops");
  const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
    { id: "shops", label: "חנויות", icon: Building2 },
    { id: "features", label: "פיצ׳רים ותוכניות", icon: Layers },
    { id: "quotas", label: "מכסות ותוכניות", icon: Gauge },
    { id: "matrix", label: "פיצ׳רים פעילים בחנויות", icon: ListChecks },
    { id: "billing", label: "אסימוני סליקה", icon: CreditCard },
    { id: "revenue", label: "חיוב חודשי לכל חנות", icon: Receipt },
    { id: "history", label: "היסטוריית חיובים", icon: History },
  ];
  return (
    <div dir="rtl" className="space-y-6">
      <header className="bg-gradient-to-l from-indigo-50 via-card to-card dark:from-indigo-950/40 border border-border rounded-3xl p-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black flex items-center gap-2"><Sparkles className="text-indigo-500" size={22}/> ניהול פלטפורמה</h2>
          <p className="text-sm text-muted-foreground mt-1">צפייה, מנויים, פיצ׳רים וסליקה לכל החנויות במערכת.</p>
        </div>
      </header>
      <div className="flex gap-1 bg-muted/40 p-1 rounded-2xl border border-border w-fit max-w-full overflow-x-auto">
        {tabs.map((t) => {
          const I = t.icon; const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 whitespace-nowrap transition ${active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <I size={14}/> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "shops" && <ShopsTab onImpersonate={onImpersonate}/>}
      {tab === "features" && <FeaturesTab/>}
      {tab === "quotas" && <QuotasTab/>}
      {tab === "matrix" && <ShopFeaturesMatrix/>}
      {tab === "billing" && <BillingTab/>}
      {tab === "revenue" && <RevenueTab/>}
      {tab === "history" && <HistoryTab/>}
    </div>
  );
}

/* ============ Quotas tab — hard caps per plan ============ */
type PlanQuotaRow = { id: string; plan_key: string; quota_key: string; monthly_limit: number; trial_percent: number; period: string };
function QuotasTab() {
  const [rows, setRows] = useState<PlanQuotaRow[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("plan_quotas" as any).select("*").order("plan_key").order("quota_key");
    if (error) toast.error(error.message);
    setRows(((data as unknown) as PlanQuotaRow[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  async function update(id: string, patch: Partial<PlanQuotaRow>) {
    const { error } = await supabase.from("plan_quotas" as any).update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("נשמר");
    load();
  }
  if (loading) return <p className="text-sm text-muted-foreground">טוען…</p>;
  const byPlan = rows.reduce<Record<string, PlanQuotaRow[]>>((acc, r) => {
    (acc[r.plan_key] ||= []).push(r); return acc;
  }, {});
  return (
    <div className="space-y-5">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-sm">
        מכסות אלו הן <b>חסם קשיח</b> שמופעל בקוד לפני כל קריאה ל-API צד-ג׳ (וואטסאפ, מייל, AI, יצירת תמונות).
        במהלך תקופת ניסיון, המכסה האפקטיבית = מכסה × אחוז ניסיון (ברירת מחדל 10%).
      </div>
      {Object.entries(byPlan).map(([plan, list]) => (
        <div key={plan} className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 font-black uppercase tracking-wide text-xs">{plan}</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-xs text-muted-foreground">
              <tr>
                <th className="text-right p-2">מפתח מכסה</th>
                <th className="text-right p-2">מגבלה חודשית</th>
                <th className="text-right p-2">% במהלך ניסיון</th>
                <th className="text-right p-2">תקופה</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2 font-mono text-xs">{r.quota_key}</td>
                  <td className="p-2">
                    <input type="number" defaultValue={r.monthly_limit} min={0}
                      onBlur={(e) => { const v = parseInt(e.target.value || "0", 10); if (v !== r.monthly_limit) update(r.id, { monthly_limit: v }); }}
                      className="w-28 bg-background border border-border rounded-lg px-2 py-1 text-sm"/>
                  </td>
                  <td className="p-2">
                    <input type="number" defaultValue={r.trial_percent} min={0} max={100}
                      onBlur={(e) => { const v = parseInt(e.target.value || "0", 10); if (v !== r.trial_percent) update(r.id, { trial_percent: v }); }}
                      className="w-20 bg-background border border-border rounded-lg px-2 py-1 text-sm"/>
                  </td>
                  <td className="p-2">
                    <select defaultValue={r.period}
                      onChange={(e) => { if (e.target.value !== r.period) update(r.id, { period: e.target.value }); }}
                      className="bg-background border border-border rounded-lg px-2 py-1 text-sm">
                      <option value="month">חודשי</option>
                      <option value="lifetime">מצטבר</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/* ============ Revenue tab — monthly billing per store ============ */
function RevenueTab() {
  const fetchAll = useServerFn(listAllBilling);
  const [rows, setRows] = useState<BillingBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { setRows(await fetchAll()); } catch (e: any) { toast.error(e.message); }
      setLoading(false);
    })();
  }, []);
  const total = rows.reduce((s, r) => s + r.total, 0);
  if (loading) return <p className="text-sm text-muted-foreground">טוען…</p>;
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-l from-emerald-500/10 to-card border border-emerald-500/20 rounded-2xl p-5">
        <p className="text-sm text-muted-foreground">סך הכנסה חודשית צפויה</p>
        <p className="text-3xl font-black text-emerald-600">₪{total.toFixed(2)}</p>
        <p className="text-xs text-muted-foreground mt-1">{rows.length} חנויות · כולל מע״מ</p>
      </div>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr><th className="p-3 text-right">חנות</th><th className="p-3 text-right">מסלול</th><th className="p-3 text-right">תוספות</th><th className="p-3 text-right">סטטוס</th><th className="p-3 text-right">חיוב הבא</th><th className="p-3 text-right">סה״כ</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.storeId} className="border-t border-border">
                <td className="p-3 font-bold">{r.storeName}</td>
                <td className="p-3">{r.plan.name} <span className="text-muted-foreground">₪{r.plan.price}</span></td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {r.addons.length === 0 ? <span className="text-muted-foreground text-xs">—</span> :
                      r.addons.map((a) => (
                        <span key={a.key} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-bold">{a.name} ₪{a.price}</span>
                      ))}
                  </div>
                </td>
                <td className="p-3"><span className="text-[11px] px-2 py-0.5 rounded-full bg-muted">{r.status}</span></td>
                <td className="p-3 text-xs text-muted-foreground">{r.nextChargeDate ? new Date(r.nextChargeDate).toLocaleDateString("he-IL") : "—"}</td>
                <td className="p-3 font-black text-primary">₪{r.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ History tab ============ */
function HistoryTab() {
  const fetchAll = useServerFn(listAllBilling);
  const fetchEvents = useServerFn(listBillingEvents);
  const [stores, setStores] = useState<BillingBreakdown[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => { (async () => {
    try { const s = await fetchAll(); setStores(s); if (s[0]) setStoreId(s[0].storeId); } catch (e: any) { toast.error(e.message); }
  })(); }, []);
  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    fetchEvents({ data: { storeId, limit: 200 } }).then((e) => setEvents(e as any[])).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [storeId]);
  const EVENT_LABEL: Record<string, string> = {
    feature_enabled: "פיצ׳ר הופעל",
    feature_disabled: "פיצ׳ר בוטל",
    invoice_paid: "חיוב הצליח",
    invoice_failed: "חיוב נכשל",
    subscription_updated: "עדכון מינוי",
  };
  return (
    <div className="space-y-4">
      <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
        {stores.map((s) => <option key={s.storeId} value={s.storeId}>{s.storeName}</option>)}
      </select>
      {loading ? <p className="text-sm text-muted-foreground">טוען…</p> : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr><th className="p-3 text-right">תאריך</th><th className="p-3 text-right">אירוע</th><th className="p-3 text-right">פיצ׳ר</th><th className="p-3 text-right">שינוי</th><th className="p-3 text-right">סה״כ אחרי</th><th className="p-3 text-right">בוצע ע״י</th><th className="p-3 text-right">סולק</th></tr>
            </thead>
            <tbody>
              {events.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">אין אירועים</td></tr>}
              {events.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="p-3 text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString("he-IL")}</td>
                  <td className="p-3 font-bold">{EVENT_LABEL[e.event_type] || e.event_type}</td>
                  <td className="p-3 text-xs">{e.metadata?.feature_name || e.feature_key || "—"}</td>
                  <td className={`p-3 font-bold ${Number(e.amount_delta) > 0 ? "text-emerald-600" : Number(e.amount_delta) < 0 ? "text-rose-600" : ""}`}>
                    {Number(e.amount_delta) > 0 ? "+" : ""}{Number(e.amount_delta).toFixed(2)} ₪
                  </td>
                  <td className="p-3">{e.total_after != null ? `₪${Number(e.total_after).toFixed(2)}` : "—"}</td>
                  <td className="p-3 text-xs"><span className="px-2 py-0.5 rounded-full bg-muted">{e.actor_role || "—"}</span></td>
                  <td className="p-3 text-xs">
                    {e.provider_ref ? <code className="text-[10px] bg-muted px-1 rounded">{e.provider_ref.slice(0, 16)}…</code> : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============ Shops tab ============ */
function ShopsTab({ onImpersonate }: { onImpersonate: (id: string) => void }) {
  const qc = useQueryClient();
  const fetchShops = useServerFn(listPlatformShops);
  const deleteShop = useServerFn(deleteStoreCompletely);
  const syncShop = useServerFn(syncStoreWithTemplate);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Shop | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  async function load() {
    setLoading(true);
    try { setShops(await fetchShops()); } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function syncOne(s: Shop) {
    setSyncingId(s.id);
    const toastId = toast.loading(`מסנכרן את "${s.name}"…`);
    try {
      const r = await syncShop({ data: { storeId: s.id } });
      toast.success(
        `סנכרון "${s.name}" הסתיים`,
        {
          id: toastId,
          description: `נוספו ${r.productsAdded} מוצרים · ${r.categoriesAdded} קטגוריות · ${r.addOnsAdded} תוספות · תוקנו ${r.imagesRepaired + r.addOnImagesRepaired} תמונות שבורות`,
        },
      );
    } catch (e: any) {
      toast.error(`סנכרון "${s.name}" נכשל`, { id: toastId, description: e?.message || "" });
    }
    setSyncingId(null);
  }

  async function syncAll() {
    const targets = shops.filter((s) => s.active && s.id !== PLATFORM_TEMPLATE_STORE_ID);
    if (!targets.length) { toast.info("אין חנויות פעילות לסנכרון"); return; }
    setSyncingAll(true);
    const toastId = toast.loading(`מסנכרן 0 מתוך ${targets.length} חנויות…`);
    let added = 0, images = 0, failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const s = targets[i];
      toast.loading(`מסנכרן חנות ${i + 1} מתוך ${targets.length}: ${s.name}…`, { id: toastId });
      try {
        const r = await syncShop({ data: { storeId: s.id } });
        added += r.productsAdded + r.categoriesAdded + r.addOnsAdded;
        images += r.imagesRepaired + r.addOnImagesRepaired;
      } catch {
        failed += 1;
      }
    }
    toast.success(
      `סנכרון גלובלי הסתיים — ${targets.length} חנויות${failed ? ` (${failed} נכשלו)` : ""}`,
      { id: toastId, description: `סה״כ נוספו ${added} פריטים · תוקנו ${images} תמונות` },
    );
    setSyncingAll(false);
  }

  function impersonate(id: string) {
    try { localStorage.setItem("tmm_store_override", id); } catch {}
    try {
      localStorage.removeItem("tmm_current_store");
      localStorage.removeItem("tmm_current_store_id");
    } catch {}
    setSupabaseStoreHeader(id);
    qc.invalidateQueries();
    onImpersonate(id);
    setTimeout(() => { try { window.location.assign("/admin?store=" + id); } catch {} }, 100);
  }

  async function confirmDelete() {
    if (!deleting) return;
    if (confirmName !== deleting.name) return toast.error("שם החנות לא תואם");
    setBusy(true);
    try {
      const res = await deleteShop({ data: { storeId: deleting.id, confirmName } });
      toast.success(`החנות נמחקה לצמיתות (${res.removedFiles} קבצים הוסרו)`);
      setDeleting(null); setConfirmName("");
      void load();
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  }

  if (loading) return <div className="text-center text-muted-foreground py-12">טוען חנויות…</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={syncAll}
          disabled={syncingAll || !!syncingId}
          className="text-sm font-bold rounded-xl px-4 py-2 bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1.5"
          title="סנכרן את כל החנויות הפעילות מהתבנית הראשית"
        >
          <RefreshCw size={14} className={syncingAll ? "animate-spin" : ""}/>
          {syncingAll ? "מסנכרן הכל…" : "סנכרן את כל החנויות מהתבנית"}
        </button>
      </div>
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-right px-4 py-3">חנות / shop_id</th>
            <th className="text-right px-4 py-3">בעלים</th>
            <th className="text-right px-4 py-3">מנוי</th>
            <th className="text-right px-4 py-3">הזמנות 30י׳</th>
            <th className="text-right px-4 py-3">הכנסה 30י׳</th>
            <th className="text-right px-4 py-3">סטטוס</th>
            <th className="text-right px-4 py-3">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {shops.map((s) => (
            <tr key={s.id} className="border-t border-border hover:bg-muted/20 transition">
              <td className="px-4 py-3">
                <div className="font-bold">{s.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{s.id}</div>
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{s.ownerEmail || "—"}</td>
              <td className="px-4 py-3">
                {s.subscription ? (
                  <div className="text-xs">
                    <div className="font-bold">{s.subscription.plan_key}</div>
                    <div className="text-muted-foreground">{s.subscription.status} · {s.subscription.provider}</div>
                  </div>
                ) : <span className="text-xs text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-3 font-bold tabular-nums">{s.stats.orders30d}</td>
              <td className="px-4 py-3 font-bold tabular-nums">₪{Math.round(s.stats.revenue30d)}</td>
              <td className="px-4 py-3">
                {s.active
                  ? <span className="text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">פעיל</span>
                  : <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">מושהה</span>}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1 flex-wrap">
                  <button onClick={() => impersonate(s.id)} title="התחזה לבעל החנות" className="text-xs font-bold rounded-lg px-2.5 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1">
                    <LogIn size={12}/> כניסה
                  </button>
                  {s.id !== PLATFORM_TEMPLATE_STORE_ID && (
                    <button
                      onClick={() => syncOne(s)}
                      disabled={syncingAll || syncingId === s.id}
                      title="סנכרן מוצרים/קטגוריות חדשים מהתבנית ותקן תמונות שבורות, בלי לדרוס עריכות"
                      className="text-xs font-bold rounded-lg px-2.5 py-1.5 border border-indigo-500/40 text-indigo-600 hover:bg-indigo-500/10 disabled:opacity-50 flex items-center gap-1"
                    >
                      <RefreshCw size={12} className={syncingId === s.id ? "animate-spin" : ""}/>
                      {syncingId === s.id ? "מסנכרן…" : "סנכרן"}
                    </button>
                  )}
                  {s.id !== PLATFORM_TEMPLATE_STORE_ID && (
                    <button onClick={() => { setDeleting(s); setConfirmName(""); }} className="text-xs font-bold rounded-lg px-2.5 py-1.5 border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center gap-1">
                      <Trash2 size={12}/> מחק
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {deleting && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !busy && setDeleting(null)}>
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-lg text-destructive flex items-center gap-2"><Trash2 size={18}/> מחיקה לצמיתות</h3>
            <p className="text-sm text-muted-foreground">פעולה זו תמחק את <b>{deleting.name}</b> כולל כל המוצרים, ההזמנות, התמונות והגדרות החנות. <b>לא ניתן לבטל.</b></p>
            <p className="text-sm">להמשך, הקלד את שם החנות: <b className="font-mono">{deleting.name}</b></p>
            <input
              autoFocus value={confirmName} onChange={(e) => setConfirmName(e.target.value)}
              placeholder={deleting.name}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive/40"
            />
            <div className="flex justify-end gap-2">
              <button disabled={busy} onClick={() => setDeleting(null)} className="px-4 py-2 rounded-xl border border-border hover:bg-muted text-sm">ביטול</button>
              <button
                disabled={busy || confirmName !== deleting.name}
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm disabled:opacity-50"
              >
                {busy ? "מוחק…" : "מחק לצמיתות"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

/* ============ Features tab ============ */
function FeaturesTab() {
  const [items, setItems] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Feature | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("plan_features" as any).select("*").order("display_order");
    if (error) toast.error(error.message);
    setItems((data as any) || []); setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  if (loading) return <div className="text-center text-muted-foreground py-12">טוען…</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setEditing({ id: "", key: "", name: "", description: "", monthly_price: 0, currency: "ILS", category: "addon", active: true, display_order: (items.at(-1)?.display_order ?? 0) + 10, stripe_price_id: "", stripe_product_id: "" })}
          className="text-sm font-bold bg-primary text-primary-foreground rounded-xl px-4 py-2 flex items-center gap-1">
          <Plus size={14}/> פיצ׳ר חדש
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((f) => (
          <article key={f.id} className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-black">{f.name}</div>
                <div className="text-[11px] text-muted-foreground font-mono">{f.key}</div>
              </div>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${f.category === "plan" ? "bg-indigo-500/10 text-indigo-600" : "bg-amber-500/10 text-amber-600"}`}>{f.category}</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{f.description}</p>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="font-black text-lg">₪{f.monthly_price}<span className="text-xs font-normal text-muted-foreground">/חודש</span></span>
              <button onClick={() => setEditing(f)} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1"><Pencil size={12}/> ערוך</button>
            </div>
          </article>
        ))}
      </div>
      {editing && <FeatureEditor feature={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }}/>}
    </div>
  );
}

function FeatureEditor({ feature, onClose, onSaved }: { feature: Feature; onClose: () => void; onSaved: () => void }) {
  const isNew = !feature.id;
  const [v, setV] = useState<Feature>(feature);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!v.key || !v.name) return toast.error("מפתח ושם חובה");
    setBusy(true);
    const payload: any = {
      key: v.key, name: v.name, description: v.description,
      monthly_price: v.monthly_price, currency: v.currency, category: v.category,
      active: v.active, display_order: v.display_order,
      stripe_price_id: v.stripe_price_id?.trim() || null,
      stripe_product_id: v.stripe_product_id?.trim() || null,
    };
    const { error } = isNew
      ? await supabase.from("plan_features" as any).insert(payload)
      : await supabase.from("plan_features" as any).update(payload).eq("id", v.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("נשמר"); onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-black text-lg">{isNew ? "פיצ׳ר חדש" : `עריכה: ${feature.name}`}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X size={14}/></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="מפתח (key) *"><input disabled={!isNew} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={v.key} onChange={(e)=>setV({...v,key:e.target.value})}/></Field>
          <Field label="שם *"><input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={v.name} onChange={(e)=>setV({...v,name:e.target.value})}/></Field>
          <Field label="קטגוריה">
            <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={v.category} onChange={(e)=>setV({...v,category:e.target.value})}>
              <option value="plan">plan</option><option value="addon">addon</option>
            </select>
          </Field>
          <Field label="מחיר חודשי (₪)"><input type="number" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={v.monthly_price} onChange={(e)=>setV({...v,monthly_price:Number(e.target.value)})}/></Field>
          <Field label="סדר תצוגה"><input type="number" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={v.display_order} onChange={(e)=>setV({...v,display_order:Number(e.target.value)})}/></Field>
          <Field label="פעיל">
            <button onClick={()=>setV({...v,active:!v.active})} className={`w-full px-3 py-2 rounded-lg border border-border text-sm ${v.active?"text-emerald-600":"text-muted-foreground"}`}>{v.active?"פעיל":"מושבת"}</button>
          </Field>
        </div>
        <Field label="תיאור"><textarea className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm min-h-[80px]" value={v.description} onChange={(e)=>setV({...v,description:e.target.value})}/></Field>
        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border">
          <Field label="Stripe Price ID"><input dir="ltr" placeholder="price_..." className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" value={v.stripe_price_id ?? ""} onChange={(e)=>setV({...v,stripe_price_id:e.target.value})}/></Field>
          <Field label="Stripe Product ID"><input dir="ltr" placeholder="prod_..." className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" value={v.stripe_product_id ?? ""} onChange={(e)=>setV({...v,stripe_product_id:e.target.value})}/></Field>
        </div>
        <p className="text-[11px] text-muted-foreground">חיוב אוטומטי דרך Stripe יתבצע רק לפיצ׳רים עם Price ID. ללא — חיוב ידני בלבד.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border hover:bg-muted text-sm">ביטול</button>
          <button disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50 flex items-center gap-1"><Check size={14}/>{busy?"שומר…":"שמירה"}</button>
        </div>
      </div>
    </div>
  );
}

/* ============ Shop-Features matrix ============ */
function ShopFeaturesMatrix() {
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [rows, setRows] = useState<StoreFeature[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: s }, { data: f }, { data: sf }] = await Promise.all([
      supabase.from("stores").select("id, name").order("name"),
      supabase.from("plan_features" as any).select("*").eq("active", true).order("display_order"),
      supabase.from("store_features" as any).select("*"),
    ]);
    setShops((s as any) || []); setFeatures((f as any) || []); setRows((sf as any) || []);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  function isEnabled(storeId: string, key: string) {
    return rows.some((r) => r.store_id === storeId && r.feature_key === key && r.enabled);
  }
  async function toggle(storeId: string, key: string) {
    const existing = rows.find((r) => r.store_id === storeId && r.feature_key === key);
    if (existing) {
      const next = !existing.enabled;
      const { error } = await supabase.from("store_features" as any).update({ enabled: next, enabled_at: new Date().toISOString() }).eq("id", existing.id);
      if (error) return toast.error(error.message);
      setRows((rs) => rs.map((r) => r.id === existing.id ? { ...r, enabled: next } : r));
    } else {
      const { data, error } = await supabase.from("store_features" as any).insert({ store_id: storeId, feature_key: key, enabled: true }).select("*").single();
      if (error) return toast.error(error.message);
      setRows((rs) => [...rs, data as any]);
    }
  }

  if (loading) return <div className="text-center text-muted-foreground py-12">טוען…</div>;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-auto shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground sticky top-0">
          <tr>
            <th className="text-right px-3 py-3 sticky right-0 bg-muted/40 z-10">חנות</th>
            {features.map((f) => <th key={f.id} className="px-3 py-3 text-center whitespace-nowrap">{f.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {shops.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td className="px-3 py-2 font-bold sticky right-0 bg-card">{s.name}</td>
              {features.map((f) => {
                const on = isEnabled(s.id, f.key);
                return (
                  <td key={f.id} className="px-3 py-2 text-center">
                    <button onClick={() => toggle(s.id, f.key)}
                      className={`w-9 h-5 rounded-full transition relative ${on ? "bg-emerald-500" : "bg-muted"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition ${on ? "right-0.5" : "right-4"}`}/>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============ Billing tokens ============ */
function BillingTab() {
  const [tokens, setTokens] = useState<BillingToken[]>([]);
  const [shopMap, setShopMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from("billing_tokens" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("stores").select("id,name"),
    ]);
    setTokens((t as any) || []);
    const map: Record<string, string> = {};
    (s || []).forEach((x: any) => { map[x.id] = x.name; });
    setShopMap(map); setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  if (loading) return <div className="text-center text-muted-foreground py-12">טוען…</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setAdding(true)} className="text-sm font-bold bg-primary text-primary-foreground rounded-xl px-4 py-2 flex items-center gap-1"><Plus size={14}/> אסימון חדש</button>
      </div>
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-right px-4 py-3">חנות</th>
              <th className="text-right px-4 py-3">ספק</th>
              <th className="text-right px-4 py-3">customer_token</th>
              <th className="text-right px-4 py-3">כרטיס</th>
              <th className="text-right px-4 py-3">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">לא קיימים אסימוני סליקה.</td></tr>
            )}
            {tokens.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-3 font-bold">{shopMap[t.store_id] || t.store_id.slice(0, 8)}</td>
                <td className="px-4 py-3"><span className="text-[11px] uppercase font-bold bg-muted px-2 py-0.5 rounded-full">{t.provider}</span></td>
                <td className="px-4 py-3 font-mono text-xs">{t.customer_token.slice(0, 20)}{t.customer_token.length > 20 ? "…" : ""}</td>
                <td className="px-4 py-3 text-xs">{t.payment_method_brand} •••• {t.last4} {t.exp_month ? `${t.exp_month}/${t.exp_year}` : ""}</td>
                <td className="px-4 py-3">
                  <button onClick={async () => {
                    if (!confirm("למחוק אסימון זה?")) return;
                    const { error } = await supabase.from("billing_tokens" as any).delete().eq("id", t.id);
                    if (error) return toast.error(error.message);
                    toast.success("נמחק"); void load();
                  }} className="text-xs text-destructive hover:underline">מחק</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adding && <NewTokenDialog shopMap={shopMap} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }}/>}
    </div>
  );
}

function NewTokenDialog({ shopMap, onClose, onSaved }: { shopMap: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const [storeId, setStoreId] = useState(Object.keys(shopMap)[0] || "");
  const [provider, setProvider] = useState("stripe");
  const [token, setToken] = useState("");
  const [brand, setBrand] = useState("");
  const [last4, setLast4] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!storeId || !token) return toast.error("חובה חנות ואסימון");
    setBusy(true);
    const { error } = await supabase.from("billing_tokens" as any).insert({ store_id: storeId, provider, customer_token: token, payment_method_brand: brand, last4 });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("נשמר"); onSaved();
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg">אסימון סליקה חדש</h3>
        <Field label="חנות">
          <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={storeId} onChange={(e)=>setStoreId(e.target.value)}>
            {Object.entries(shopMap).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
        <Field label="ספק">
          <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={provider} onChange={(e)=>setProvider(e.target.value)}>
            <option value="stripe">Stripe</option>
            <option value="meshulam">Meshulam (ישראלי)</option>
          </select>
        </Field>
        <Field label="customer_token / customer_stripe_id"><input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono" value={token} onChange={(e)=>setToken(e.target.value)} placeholder="cus_…"/></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="מותג"><input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={brand} onChange={(e)=>setBrand(e.target.value)} placeholder="Visa"/></Field>
          <Field label="4 ספרות אחרונות"><input maxLength={4} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" value={last4} onChange={(e)=>setLast4(e.target.value)} placeholder="4242"/></Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border hover:bg-muted text-sm">ביטול</button>
          <button disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-50">{busy?"שומר…":"שמירה"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 text-muted-foreground text-xs">{label}</span>
      {children}
    </label>
  );
}

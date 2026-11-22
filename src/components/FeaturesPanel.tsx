import { useStoreFeatures, type FeatureView } from "@/lib/store-features";
import { Check, Lock, Sparkles, Clock, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toggleStoreFeature } from "@/lib/billing.functions";
import { useStore } from "@/lib/store-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MONTHLY_PRICE_ILS, VAT_RATE } from "@/lib/plans";

const CATEGORY_LABEL: Record<string, string> = {
  plan: "מסלולים",
  addon: "תוספות ושדרוגים",
  pro: "פיצ׳רים מתקדמים",
};

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
  trial: "ניסיון חינם",
};

const PLAN_PRICE: Record<string, number> = {
  free: 0,
  pro: MONTHLY_PRICE_ILS,
  enterprise: 499,
  trial: 0,
};

const STATUS_LABEL: Record<string, { txt: string; cls: string }> = {
  active: { txt: "פעיל", cls: "bg-emerald-500/15 text-emerald-700" },
  trialing: { txt: "תקופת ניסיון", cls: "bg-sky-500/15 text-sky-700" },
  past_due: { txt: "פיגור בתשלום", cls: "bg-amber-500/15 text-amber-700" },
  canceled: { txt: "מבוטל", cls: "bg-rose-500/15 text-rose-700" },
};

function formatPrice(p: number, c: string) {
  if (p <= 0) return "כלול";
  const sym = c === "USD" ? "$" : "₪";
  return `${sym}${p}/חודש`;
}

function FeatureRow({ f, storeId, isAdmin, onChanged }: { f: FeatureView; storeId: string | null; isAdmin: boolean; onChanged: () => void }) {
  const enabled = f.enabled;
  const [busy, setBusy] = useState(false);
  const toggle = useServerFn(toggleStoreFeature);
  async function flip(enable: boolean) {
    if (!storeId) return;
    setBusy(true);
    try {
      const idempotencyKey = `${storeId}:${f.key}:${enable ? "on" : "off"}:${Date.now()}`;
      await toggle({ data: { storeId, featureKey: f.key, enable, idempotencyKey } });
      toast.success(enable ? `${f.name} הופעל` : `${f.name} בוטל`);
      onChanged();
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  }
  // Platform admins can flip ANY feature (including plan-tier) for any store.
  // Store owners can only flip add-ons / pro features themselves; plan changes
  // go through the billing team to avoid accidental downgrades.
  const canToggle = !!storeId && (isAdmin || f.category !== "plan");
  return (
    <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-4 rounded-xl border ${enabled ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-foreground">{f.name}</h4>
          {enabled ? (
            <span className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-bold"><Check size={11}/> פעיל</span>
          ) : (
            <span className="text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground"><Lock size={11}/> נעול</span>
          )}
          {isAdmin && f.category === "plan" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold">admin</span>
          )}
        </div>
        {f.description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.description}</p>}
        {enabled && f.expires_at && (
          <p className="text-[11px] text-muted-foreground mt-2 inline-flex items-center gap-1"><Clock size={11}/> פעיל עד {new Date(f.expires_at).toLocaleDateString("he-IL")}</p>
        )}
      </div>
      <div className="text-right shrink-0 flex flex-row-reverse sm:flex-col items-center sm:items-end gap-2 justify-between sm:justify-start">
        <p className="text-sm font-extrabold text-foreground whitespace-nowrap">{formatPrice(f.monthly_price, f.currency)}</p>
        {canToggle && (
          enabled ? (
            <button disabled={busy} onClick={() => flip(false)}
              className="text-[11px] font-bold px-3 py-1 rounded-full bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 disabled:opacity-50">
              {busy ? "מבטל…" : "בטל"}
            </button>
          ) : (
            <button disabled={busy} onClick={() => flip(true)}
              className="text-[11px] font-bold px-3 py-1 rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? "מפעיל…" : "הפעל"}
            </button>
          )
        )}
      </div>
    </div>
  );
}

export function FeaturesPanel() {
  const { data, isLoading } = useStoreFeatures();
  const { store } = useStore();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["store-features"] });
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setIsAdmin(false);
      const { data: row } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!row);
    })();
  }, []);
  if (isLoading) return <div className="text-sm text-muted-foreground">טוען…</div>;
  const features = data?.features ?? [];
  const sub = data?.subscription;
  const grouped = features.reduce<Record<string, FeatureView[]>>((acc, f) => {
    (acc[f.category] ||= []).push(f);
    return acc;
  }, {});
  const statusKey = sub?.status || "active";
  const status = STATUS_LABEL[statusKey] || STATUS_LABEL.active;

  // Live monthly billing breakdown
  const planKey = sub?.plan_key || "free";
  const planPrice = PLAN_PRICE[planKey] ?? 0;
  const activeAddons = features.filter((f) => f.enabled && f.category !== "plan");
  const addonsSum = activeAddons.reduce((s, f) => s + Number(f.monthly_price || 0), 0);
  const subtotal = planPrice + addonsSum;
  const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;

  return (
    <div className="space-y-6" data-coach-target="features-panel">
      <section className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-2xl p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="text-primary" size={18}/>
              <h3 className="font-black text-foreground text-lg">המסלול שלי</h3>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {PLAN_LABEL[sub?.plan_key || "free"] || sub?.plan_key || "Free"}
              {sub?.current_period_end && ` · מתחדש ב-${new Date(sub.current_period_end).toLocaleDateString("he-IL")}`}
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-extrabold ${status.cls}`}>{status.txt}</span>
        </div>
      </section>

      <section className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Receipt className="text-primary" size={18}/>
          <h3 className="font-black text-foreground text-base">החיוב החודשי שלי</h3>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">מסלול {PLAN_LABEL[planKey] || planKey}</span>
            <span className="font-bold text-foreground">₪{planPrice.toFixed(2)}</span>
          </div>
          {activeAddons.map((a) => (
            <div key={a.id} className="flex justify-between">
              <span className="text-muted-foreground">+ {a.name}</span>
              <span className="font-bold text-foreground">₪{Number(a.monthly_price).toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t border-border pt-2 mt-2 flex justify-between">
            <span className="text-muted-foreground">סה״כ לפני מע״מ</span>
            <span className="font-bold text-foreground">₪{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">מע״מ 17%</span>
            <span className="font-bold text-foreground">₪{vat.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base pt-2 border-t border-border">
            <span className="font-black text-foreground">סה״כ לחיוב חודשי</span>
            <span className="font-black text-primary">₪{total.toFixed(2)}</span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          הסכום מתעדכן אוטומטית בכל הפעלה או ביטול של פיצ׳ר. חיוב יחסי (Proration) על ימים שנותרו בחודש.
        </p>
      </section>

      {(["plan","addon","pro"] as const).map((cat) => {
        const list = grouped[cat];
        if (!list?.length) return null;
        return (
          <section key={cat}>
            <h3 className="font-black text-foreground text-base mb-3">{CATEGORY_LABEL[cat] || cat}</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {list.map((f) => <FeatureRow key={f.id} f={f} storeId={store?.id ?? null} isAdmin={isAdmin} onChanged={refresh} />)}
            </div>
          </section>
        );
      })}

      <p className="text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded-xl p-3">
        להפעלת שירות חדש או שדרוג מסלול – פנו אלינו ונפעיל לכם זאת תוך זמן קצר. שדרוגים נכנסים לתוקף מיד עם השלמת התשלום.
      </p>
    </div>
  );
}

export function PlanOverviewCard() {
  const { data } = useStoreFeatures();
  const sub = data?.subscription;
  const features = data?.features ?? [];
  const active = features.filter((f) => f.enabled && f.category !== "plan").slice(0, 5);
  const statusKey = sub?.status || "active";
  const status = STATUS_LABEL[statusKey] || STATUS_LABEL.active;
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary" size={16}/>
          <h3 className="font-black text-foreground text-sm">המסלול והשירותים שלי</h3>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${status.cls}`}>{status.txt}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2">{PLAN_LABEL[sub?.plan_key || "free"] || sub?.plan_key || "Free"}</p>
      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground">אין שירותים נוספים פעילים — אפשר לשדרג מתוך "הגדרות אתר".</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {active.map((f) => (
            <span key={f.id} className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-bold">{f.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

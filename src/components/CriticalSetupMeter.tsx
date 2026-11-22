import { useEffect, useMemo, useState } from "react";
import { Check, Globe, CreditCard, Coins, Sparkles, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { celebrate } from "@/lib/celebrate";
import { MiniTour } from "./MiniTour";

/**
 * Phase 4 — Hardened 100% completion meter.
 *
 * Tracks the three business-critical configurations:
 *   • Domain Connection   → stores.primary_domain present
 *   • Payment Gateway     → billing_tokens row exists
 *   • Credit setup        → site_settings.credit_configured === true
 *
 * Hitting 100% fires confetti once and shows the "System Fully Ready" badge.
 */

type CriticalKey = "domain" | "payment" | "credit";

const ITEMS: { id: CriticalKey; label: string; icon: typeof Globe; help: string }[] = [
  { id: "domain",  label: "חיבור דומיין",      icon: Globe,     help: "חברו דומיין משלכם כדי שהלקוחות יראו את הכתובת שלכם בכל מקום." },
  { id: "payment", label: "סליקה (תשלומים)",   icon: CreditCard, help: "ללא סליקה פעילה לא תוכלו לקבל תשלומים מהלקוחות." },
  { id: "credit",  label: "הגדרת קרדיט",       icon: Coins,     help: "הגדירו את חבילת הקרדיט כדי לאפשר שליחת קמפיינים והודעות." },
];

const READY_FLAG = (storeId: string) => `tmm_system_ready_${storeId}`;

export function CriticalSetupMeter() {
  const { store } = useStore();
  const storeId = store?.id ?? null;
  const [state, setState] = useState<Record<CriticalKey, boolean>>({
    domain: false, payment: false, credit: false,
  });
  const [tourOpen, setTourOpen] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  async function reload() {
    if (!storeId) return;
    const [{ data: s }, { data: tokens }, { data: settings }] = await Promise.all([
      supabase.from("stores").select("primary_domain,extra_domains").eq("id", storeId).maybeSingle(),
      supabase.from("billing_tokens" as any).select("id").eq("store_id", storeId).limit(1),
      supabase.from("site_settings").select("value").eq("store_id", storeId).eq("key", "credit_configured").maybeSingle(),
    ]);
    const domainOk = !!(s?.primary_domain && String(s.primary_domain).trim()) ||
                     (Array.isArray(s?.extra_domains) && s!.extra_domains.length > 0);
    const paymentOk = !!(tokens && tokens.length);
    const creditOk = !!(settings?.value === true || settings?.value === "true");
    setState({ domain: domainOk, payment: paymentOk, credit: creditOk });
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [storeId]);

  const done = (Object.values(state) as boolean[]).filter(Boolean).length;
  const pct = Math.round((done / ITEMS.length) * 100);
  const ready = done === ITEMS.length;

  useEffect(() => {
    if (!ready || !storeId) return;
    const flag = window.localStorage.getItem(READY_FLAG(storeId));
    if (flag) { setCelebrated(true); return; }
    celebrate({ intense: true, brand: true });
    setCelebrated(true);
    try { window.localStorage.setItem(READY_FLAG(storeId), "1"); } catch {}
  }, [ready, storeId]);

  async function markCredit() {
    if (!storeId) return;
    await supabase.from("site_settings").upsert(
      { store_id: storeId, key: "credit_configured", value: true as any },
      { onConflict: "store_id,key" },
    );
    reload();
  }

  const meterColor = useMemo(() => {
    if (pct >= 100) return "from-emerald-500 to-emerald-400";
    if (pct >= 66)  return "from-primary to-accent";
    return "from-amber-500 to-amber-400";
  }, [pct]);

  return (
    <section
      dir="rtl"
      data-tour-step="1"
      data-tour-title="מד מוכנות מערכת"
      data-tour-text="כאן רואים בכל רגע מה חסר כדי להפעיל את החנות באופן מלא. כל פריט שמושלם מקרב אתכם ל-100%."
      className="bg-card border border-border rounded-2xl p-4 sm:p-5"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-black text-base sm:text-lg">מד מוכנות מערכת</h3>
            {ready && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black bg-emerald-500/15 text-emerald-700 border border-emerald-500/40 rounded-full px-2 py-0.5">
                <Sparkles size={11}/> המערכת מוכנה ✅
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {ready
              ? "סיימתם את כל ההגדרות הקריטיות — אתם בשליטה מלאה."
              : `${done} מתוך ${ITEMS.length} הגדרות קריטיות הושלמו`}
          </p>
        </div>
        <button
          onClick={() => setTourOpen(true)}
          aria-label="פתח סיור מודרך"
          className="w-9 h-9 rounded-full bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition"
          title="סיור מודרך"
          data-tour-step="0"
          data-tour-title="סיור מודרך"
          data-tour-text="לחיצה על ה-? פותחת סיור על מסך הניהול ומדגישה כל אזור חשוב."
        >
          <HelpCircle size={18}/>
        </button>
      </div>

      <div className="h-3 rounded-full bg-muted overflow-hidden mb-4">
        <div
          className={`h-full bg-gradient-to-l ${meterColor} transition-[width] duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="grid sm:grid-cols-3 gap-2">
        {ITEMS.map((it, i) => {
          const ok = state[it.id];
          const Icon = it.icon;
          return (
            <li
              key={it.id}
              data-tour-step={i + 2}
              data-tour-title={it.label}
              data-tour-text={it.help}
              className={`rounded-xl border p-3 flex items-start gap-2 transition ${
                ok
                  ? "bg-emerald-500/10 border-emerald-500/40"
                  : "bg-background border-border"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                ok ? "bg-emerald-500/20 text-emerald-700" : "bg-muted text-muted-foreground"
              }`}>
                {ok ? <Check size={16}/> : <Icon size={16}/>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm leading-tight">{it.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{it.help}</p>
                {!ok && it.id === "credit" && (
                  <button
                    onClick={markCredit}
                    className="mt-2 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
                  >
                    סמן כהוגדר
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {tourOpen && <MiniTour onClose={() => setTourOpen(false)} />}
    </section>
  );
}

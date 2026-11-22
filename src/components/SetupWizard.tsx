import { useEffect, useRef, useState } from "react";
import {
  Check, ChevronLeft, ChevronRight, Info, Loader2,
  User2, Clock, Truck, CreditCard, Save, Trash2, Plus, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { celebrate } from "@/lib/celebrate";
import { ONBOARDING_EVENT, SEQUENCE_DONE_FLAG, WA_FLY_EVENT } from "@/components/OnboardingSequencer";

type StepId = "profile" | "hours" | "shipping" | "payment";

type ShippingZone = { id: string; area: string; price: number; eta: string };
type DayHours = { open: string; close: string; closed: boolean };

const DAYS: { key: string; label: string }[] = [
  { key: "sun", label: "א" }, { key: "mon", label: "ב" }, { key: "tue", label: "ג" },
  { key: "wed", label: "ד" }, { key: "thu", label: "ה" }, { key: "fri", label: "ו" }, { key: "sat", label: "ש" },
];
const DEFAULT_HOURS: Record<string, DayHours> = Object.fromEntries(
  DAYS.map((d) => [d.key, { open: "09:00", close: "18:00", closed: d.key === "sat" }])
) as Record<string, DayHours>;

const STEPS: { id: StepId; label: string; icon: typeof User2; why: string; example: string }[] = [
  {
    id: "profile", label: "פרופיל העסק", icon: User2,
    why: "השם, הטלפון והוואטסאפ מופיעים בכל עמוד בחנות ובהודעות שיוצאות ללקוח. בלעדיהם — הלקוח לא יודע למי הוא קונה.",
    example: 'דוגמה: \"פרחי הגליל\" · 050-1234567 · וואטסאפ עסקי שמקבל הזמנות אוטומטית.',
  },
  {
    id: "hours", label: "שעות ומיקום", icon: Clock,
    why: "שעות הפעילות מונעות הזמנות בלילה כשאתם ישנים, והכתובת בונה אמון ב-Google ובלקוח.",
    example: "דוגמה: א'–ה' 09:00–19:00, ו' 09:00–14:00, שבת סגור. רחוב הרצל 12, חיפה.",
  },
  {
    id: "shipping", label: "אזורי משלוח", icon: Truck,
    why: "ללא מחירון משלוחים הקופה לא יודעת לחשב מחיר ולקוחות נוטשים. הוסיפו לפחות אזור אחד כדי להתחיל למכור.",
    example: 'דוגמה: "תל אביב" — 25₪ — עד 3 שעות. "מרכז" — 35₪ — יום עסקים אחד.',
  },
  {
    id: "payment", label: "חיבור סליקה", icon: CreditCard,
    why: "ברגע שתחברו את הסליקה תוכלו לקבל כסף ישירות לחשבון הבנק שלכם — בלי לרדוף אחרי לקוחות בביט.",
    example: "אפשר להתחיל בקבלת תשלום בביט ובהעברה — ולחבר אשראי בקליק כשתהיו מוכנים.",
  },
];

const LS_KEY = (storeId: string) => `tmm_wizard_state_${storeId}`;

type Snapshot = {
  store_name: string; store_tagline: string; store_phone: string; whatsapp_business: string;
  store_address: string;
  hours: Record<string, DayHours>;
  zones: ShippingZone[];
  hasBilling: boolean;
};

const EMPTY: Snapshot = {
  store_name: "", store_tagline: "", store_phone: "", whatsapp_business: "",
  store_address: "", hours: DEFAULT_HOURS, zones: [], hasBilling: false,
};

function isStepDone(id: StepId, s: Snapshot): boolean {
  switch (id) {
    case "profile":
      return !!(s.store_name.trim() && (s.store_phone.trim() || s.whatsapp_business.trim()));
    case "hours":
      return !!s.store_address.trim() && Object.values(s.hours).some((h) => !h.closed && h.open && h.close);
    case "shipping":
      return s.zones.some((z) => z.area.trim() && Number(z.price) >= 0);
    case "payment":
      return s.hasBilling;
  }
}

export function setupRatioFromState(s: Snapshot): number {
  const done = STEPS.filter((st) => isStepDone(st.id, s)).length;
  return done / STEPS.length;
}

export function useSetupSnapshot() {
  const { store } = useStore();
  const storeId = store?.id ?? null;
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  async function reload() {
    if (!storeId) return;
    const [{ data: settings }, { data: tokens }] = await Promise.all([
      supabase.from("site_settings").select("key,value").eq("store_id", storeId),
      supabase.from("billing_tokens" as any).select("id").eq("store_id", storeId).limit(1),
    ]);
    const map: Record<string, any> = {};
    for (const r of settings || []) map[(r as any).key] = (r as any).value;
    setSnap({
      store_name: String(map.store_name ?? ""),
      store_tagline: String(map.store_tagline ?? ""),
      store_phone: String(map.store_phone ?? ""),
      whatsapp_business: String(map.whatsapp_business ?? ""),
      store_address: String(map.store_address ?? ""),
      hours: { ...DEFAULT_HOURS, ...(map.operating_hours && typeof map.operating_hours === "object" ? map.operating_hours : {}) },
      zones: Array.isArray(map.shipping_zones) ? (map.shipping_zones as ShippingZone[]) : [],
      hasBilling: !!(tokens && tokens.length),
    });
    setLoaded(true);
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [storeId]);
  return { snap, setSnap, reload, storeId, loaded };
}

export function SetupWizard({
  snap, setSnap, reload, onAllDone, registerJump,
}: {
  snap: Snapshot;
  setSnap: (s: Snapshot) => void;
  reload: () => Promise<void>;
  onAllDone?: () => void;
  /** Allows the dashboard to jump the wizard to the next uncompleted step. */
  registerJump?: (fn: () => void) => void;
}) {
  const { store } = useStore();
  const storeId = store?.id ?? null;

  // Remember which step the merchant was on across reloads — gives the
  // "Save & continue later" button real meaning (they return where they left).
  const initialStep = (() => {
    if (typeof window === "undefined" || !storeId) return 0;
    const raw = window.localStorage.getItem(LS_KEY(storeId));
    if (!raw) return 0;
    try {
      const i = Number(JSON.parse(raw)?.step ?? 0);
      return Number.isFinite(i) && i >= 0 && i < STEPS.length ? i : 0;
    } catch { return 0; }
  })();
  const [stepIdx, setStepIdxState] = useState(initialStep);
  function setStepIdx(i: number) {
    setStepIdxState(i);
    if (storeId && typeof window !== "undefined") {
      try { window.localStorage.setItem(LS_KEY(storeId), JSON.stringify({ step: i })); } catch {}
    }
  }

  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState<number>(0);
  const debounceRef = useRef<number | null>(null);
  const prevDoneRef = useRef<Set<StepId>>(new Set());

  // Bootstrap baseline of "already-done" steps so the wizard does NOT fire
  // confetti for steps that were already complete when the dashboard opened.
  useEffect(() => {
    prevDoneRef.current = new Set(STEPS.filter((s) => isStepDone(s.id, snap)).map((s) => s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = STEPS[stepIdx];
  const ratio = setupRatioFromState(snap);
  const allDone = ratio >= 1;

  // Find the first incomplete step — used by the dashboard "next task" CTA.
  const firstIncomplete = STEPS.findIndex((s) => !isStepDone(s.id, snap));
  useEffect(() => {
    if (!registerJump) return;
    registerJump(() => setStepIdx(firstIncomplete === -1 ? STEPS.length - 1 : firstIncomplete));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstIncomplete, registerJump]);

  // Auto-save (debounced 700ms). Persists the current snapshot to site_settings.
  // We only push the keys actually editable by this step's UI to avoid
  // accidentally overwriting other settings the merchant changed elsewhere.
  async function persist(next: Snapshot) {
    if (!storeId) return;
    setSaving(true);
    const rows: { key: string; value: any }[] = [
      { key: "store_name", value: next.store_name },
      { key: "store_tagline", value: next.store_tagline },
      { key: "store_phone", value: next.store_phone },
      { key: "whatsapp_business", value: next.whatsapp_business },
      { key: "store_address", value: next.store_address },
      { key: "operating_hours", value: next.hours },
      { key: "shipping_zones", value: next.zones },
    ];
    const { error } = await supabase
      .from("site_settings")
      .upsert(
        rows.map((r) => ({ store_id: storeId, key: r.key, value: r.value as any })),
        { onConflict: "store_id,key" },
      );
    setSaving(false);
    if (error) {
      toast.error("שמירה אוטומטית נכשלה: " + error.message);
      return;
    }
    setSavedTick(Date.now());

    // Dopamine moment: detect newly-completed steps and celebrate them.
    const nowDone = new Set(STEPS.filter((s) => isStepDone(s.id, next)).map((s) => s.id));
    for (const id of nowDone) {
      if (!prevDoneRef.current.has(id)) {
        const label = STEPS.find((s) => s.id === id)?.label || "המשימה";
        celebrate({ intense: false });
        toast.success(`כל הכבוד! \"${label}\" הושלם 🎉`);
      }
    }
    prevDoneRef.current = nowDone;
    if (nowDone.size === STEPS.length) {
      celebrate({ intense: true });
      onAllDone?.();
    }
  }

  function update(next: Snapshot) {
    setSnap(next);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => persist(next), 700);
  }

  async function saveAndExit() {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    await persist(snap);
    toast.success("נשמר. תוכלו להמשיך מאוחר יותר מהמקום בו עצרתם.");
  }

  return (
    <section dir="rtl" className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Stepper */}
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {STEPS.map((s, i) => {
            const done = isStepDone(s.id, snap);
            const active = i === stepIdx;
            const Icon = s.icon;
            return (
              <li key={s.id} className="flex items-center gap-1 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setStepIdx(i)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition border ${
                    active ? "bg-primary text-primary-foreground border-primary"
                    : done ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/40"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {done ? <Check size={14}/> : <Icon size={14}/>}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
                {i < STEPS.length - 1 && <ChevronLeft size={14} className="text-muted-foreground"/>}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid grid-cols-1 gap-0">
        {/* Main pane */}
        <div className="p-4 sm:p-5 space-y-4">
          <div>
            <h3 className="font-black text-lg flex items-center gap-2">
              <step.icon size={18} className="text-primary"/> {step.label}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">שלב {stepIdx + 1} מתוך {STEPS.length} · נשמר אוטומטית בזמן הקלדה</p>
          </div>

          {/* Compact, collapsible "why" tip — replaces the wide side rail */}
          <details className="group bg-primary/5 border border-primary/15 rounded-xl text-xs">
            <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-2 text-primary font-bold select-none">
              <Info size={14}/> למה זה חשוב · דוגמה
              <ChevronLeft size={14} className="ms-auto transition-transform group-open:-rotate-90"/>
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-2">
              <p className="text-muted-foreground leading-relaxed">{step.why}</p>
              <div className="bg-card border border-border rounded-lg p-2.5">
                <div className="font-bold mb-0.5 text-foreground">איך זה נראה בפועל</div>
                <p className="text-muted-foreground">{step.example}</p>
              </div>
            </div>
          </details>

          {step.id === "profile" && <ProfileStep snap={snap} onChange={update}/>}
          {step.id === "hours" && <HoursStep snap={snap} onChange={update}/>}
          {step.id === "shipping" && <ShippingStep snap={snap} onChange={update}/>}
          {step.id === "payment" && <PaymentStep snap={snap} reload={reload}/>}

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              {saving ? (<><Loader2 size={12} className="animate-spin"/> שומר…</>)
               : savedTick ? (<><Check size={12} className="text-emerald-600"/> כל השינויים נשמרו</>)
               : <span>הזינו נתונים — השמירה אוטומטית</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveAndExit}
                className="text-xs font-bold px-3 py-2 rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1.5"
              >
                <Save size={13}/> שמור והמשך אחר כך
              </button>
              <button
                type="button"
                disabled={stepIdx === 0}
                onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
                className="text-xs font-bold px-3 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40 inline-flex items-center gap-1"
              >
                <ChevronRight size={14}/> הקודם
              </button>
              <button
                type="button"
                disabled={stepIdx === STEPS.length - 1}
                onClick={() => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1))}
                className="text-xs font-bold px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1"
              >
                הבא <ChevronLeft size={14}/>
              </button>
            </div>
          </div>

          {allDone && (
            <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl px-4 py-3 text-sm text-emerald-800 font-bold">
              🚀 ההקמה הושלמה במלואה. החנות שלך מוכנה לקבל הזמנות אמיתיות.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- Step bodies ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function ProfileStep({ snap, onChange }: { snap: Snapshot; onChange: (s: Snapshot) => void }) {
  const set = <K extends keyof Snapshot>(k: K, v: Snapshot[K]) => {
    // Detect first successful entry of a WhatsApp number → fire the
    // brand-coloured celebration + onboarding sequence (once per browser).
    if (k === "whatsapp_business") {
      const before = snap.whatsapp_business.replace(/\D/g, "");
      const after = String(v).replace(/\D/g, "");
      if (before.length < 8 && after.length >= 8) {
        try {
          if (typeof window !== "undefined" && !localStorage.getItem(SEQUENCE_DONE_FLAG)) {
            celebrate({ intense: true, brand: true });
            // Kick off the gamified WhatsApp fly-in immediately, then the
            // sequencer takes over (~3.4s later) with the AI / PWA / next
            // action prompts.
            window.dispatchEvent(new Event(WA_FLY_EVENT));
            window.dispatchEvent(new Event(ONBOARDING_EVENT));
          }
        } catch {}
      }
    }
    onChange({ ...snap, [k]: v });
  };
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="שם החנות (חובה)">
        <input
          value={snap.store_name}
          onChange={(e) => set("store_name", e.target.value)}
          placeholder="לדוגמה: פרחי הגליל"
          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm"
        />
      </Field>
      <Field label="כותרת משנה / סלוגן">
        <input
          value={snap.store_tagline}
          onChange={(e) => set("store_tagline", e.target.value)}
          placeholder="פרחים טריים עם משלוח אקספרס"
          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm"
        />
      </Field>
      <Field label="טלפון לעסק">
        <input
          value={snap.store_phone}
          onChange={(e) => set("store_phone", e.target.value)}
          placeholder="050-1234567"
          dir="ltr"
          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-end"
        />
      </Field>
      <Field label="וואטסאפ עסקי (כולל קידומת בינלאומית)">
        <input
          value={snap.whatsapp_business}
          onChange={(e) => set("whatsapp_business", e.target.value)}
          placeholder="972501234567"
          dir="ltr"
          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-end"
        />
      </Field>
    </div>
  );
}

function HoursStep({ snap, onChange }: { snap: Snapshot; onChange: (s: Snapshot) => void }) {
  return (
    <div className="space-y-3">
      <Field label="כתובת העסק">
        <input
          value={snap.store_address}
          onChange={(e) => onChange({ ...snap, store_address: e.target.value })}
          placeholder="רחוב הרצל 12, חיפה"
          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm"
        />
      </Field>
      <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
        {DAYS.map((d) => {
          const h = snap.hours[d.key] || DEFAULT_HOURS[d.key];
          return (
            <div key={d.key} className="grid grid-cols-[60px_1fr_auto_1fr] items-center gap-2 px-3 py-2 bg-background">
              <span className="font-bold text-xs">{d.label}</span>
              <input
                type="time"
                disabled={h.closed}
                value={h.open}
                onChange={(e) => onChange({ ...snap, hours: { ...snap.hours, [d.key]: { ...h, open: e.target.value } } })}
                className="bg-transparent border border-input rounded-lg px-2 py-1 text-xs disabled:opacity-40"
              />
              <span className="text-xs text-muted-foreground">עד</span>
              <input
                type="time"
                disabled={h.closed}
                value={h.close}
                onChange={(e) => onChange({ ...snap, hours: { ...snap.hours, [d.key]: { ...h, close: e.target.value } } })}
                className="bg-transparent border border-input rounded-lg px-2 py-1 text-xs disabled:opacity-40"
              />
              <label className="col-span-4 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={h.closed}
                  onChange={(e) => onChange({ ...snap, hours: { ...snap.hours, [d.key]: { ...h, closed: e.target.checked } } })}
                />
                סגור ביום זה
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShippingStep({ snap, onChange }: { snap: Snapshot; onChange: (s: Snapshot) => void }) {
  function add() {
    onChange({ ...snap, zones: [...snap.zones, { id: crypto.randomUUID(), area: "", price: 25, eta: "" }] });
  }
  function patch(id: string, p: Partial<ShippingZone>) {
    onChange({ ...snap, zones: snap.zones.map((z) => (z.id === id ? { ...z, ...p } : z)) });
  }
  function remove(id: string) {
    onChange({ ...snap, zones: snap.zones.filter((z) => z.id !== id) });
  }
  return (
    <div className="space-y-3">
      {snap.zones.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-6 bg-muted/30 rounded-xl border border-dashed border-border">
          עוד לא הוגדרו אזורי משלוח. הוסיפו לפחות אזור אחד כדי שהקופה תדע לחשב מחיר.
        </div>
      ) : (
        <div className="space-y-2">
          {snap.zones.map((z) => (
            <div key={z.id} className="grid grid-cols-[1fr_110px_1fr_auto] gap-2 items-center bg-background border border-border rounded-xl p-2">
              <input
                value={z.area}
                onChange={(e) => patch(z.id, { area: e.target.value })}
                placeholder="לדוגמה: תל אביב"
                className="bg-transparent px-3 py-2 text-sm outline-none rounded-lg"
              />
              <div className="relative">
                <input
                  type="number"
                  value={z.price}
                  onChange={(e) => patch(z.id, { price: Number(e.target.value) })}
                  className="w-full bg-transparent px-3 py-2 text-sm outline-none rounded-lg pr-7 text-end"
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₪</span>
              </div>
              <input
                value={z.eta}
                onChange={(e) => patch(z.id, { eta: e.target.value })}
                placeholder="זמן הגעה (לדוגמה: עד 3 שעות)"
                className="bg-transparent px-3 py-2 text-sm outline-none rounded-lg"
              />
              <button
                type="button"
                onClick={() => remove(z.id)}
                aria-label="הסר אזור"
                className="text-destructive hover:bg-destructive/10 p-2 rounded-lg"
              >
                <Trash2 size={16}/>
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-dashed border-primary/50 text-primary hover:bg-primary/5"
      >
        <Plus size={14}/> הוסף אזור משלוח
      </button>
    </div>
  );
}

function PaymentStep({ snap, reload }: { snap: Snapshot; reload: () => Promise<void> }) {
  const [checking, setChecking] = useState(false);
  async function recheck() {
    setChecking(true);
    await reload();
    setChecking(false);
  }
  if (snap.hasBilling) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl px-4 py-3 text-sm text-emerald-800 font-bold inline-flex items-center gap-2">
        <Check size={16}/> מנוע הסליקה שלך מחובר ומוכן לקבלת כסף 🚀
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        כדי לקבל תשלומים ישירות לחשבון הבנק שלך, חבר ספק סליקה (Meshulam, ביט, אשראי).
        החיבור מתבצע פעם אחת ולוקח כ-3 דקות.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("tmm:admin-goto-section", { detail: "settings" }));
            // Scroll to top so the merchant lands at the start of the settings page.
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-bold px-4 py-2 rounded-lg text-sm hover:opacity-90"
        >
          <CreditCard size={14}/> פתח את חיבור הסליקה
          <ExternalLink size={12}/>
        </button>
        <button
          type="button"
          onClick={recheck}
          disabled={checking}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-bold hover:bg-muted disabled:opacity-50"
        >
          {checking ? <Loader2 size={12} className="animate-spin"/> : <Check size={12}/>}
          כבר חיברתי — בדוק שוב
        </button>
      </div>
    </div>
  );
}

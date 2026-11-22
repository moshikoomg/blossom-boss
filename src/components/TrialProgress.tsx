import { useEffect, useState } from "react";
import { Sparkles, Clock, ArrowLeft } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { TRIAL_DAYS, remainingTrialDays, trialTone } from "@/lib/plans";

type Sub = { is_trial: boolean; trial_ends_at: string | null; status: string; created_at: string };

const TONE = {
  normal: { chip: "text-muted-foreground bg-muted/60", bar: "opacity-70", text: "" },
  warning: { chip: "text-amber-800 bg-amber-100", bar: "[&>div]:bg-amber-500", text: "text-amber-700" },
  danger: { chip: "text-red-800 bg-red-100", bar: "[&>div]:bg-red-500", text: "text-red-700" },
} as const;

function goToBilling() {
  window.dispatchEvent(new CustomEvent("tmm:admin-goto-section", { detail: "settings" }));
}

type Props = {
  createdAt: string | null | undefined;
  /** 0..1 — fraction of setup tasks completed */
  setupRatio: number;
  /** Title of the next recommended task, when any */
  nextTaskLabel?: string | null;
  /** Optional click handler that jumps to the next task in the wizard */
  onJumpToNext?: () => void;
};

/**
 * Trial + Setup progress timeline (Decoupling Pain).
 *
 * Combines two progress signals into a single emotionally-positive band:
 *  - how far the merchant is in setup (calibration)
 *  - how many free trial days remain (urgency without pressure)
 *
 * Copy is intentionally encouraging and action-oriented in Hebrew.
 */
export function TrialProgress({ createdAt, setupRatio, nextTaskLabel, onJumpToNext }: Props) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { store } = useStore();
  const [sub, setSub] = useState<Sub | null>(null);
  useEffect(() => {
    if (!store?.id) return;
    let cancel = false;
    supabase
      .from("store_subscriptions")
      .select("is_trial,trial_ends_at,status,created_at")
      .eq("store_id", store.id)
      .maybeSingle()
      .then(({ data }) => { if (!cancel) setSub((data as Sub | null) ?? null); });
    return () => { cancel = true; };
  }, [store?.id]);

  // Countdown runs from the real trial end date; falls back to store creation.
  const created = createdAt ? new Date(createdAt).getTime() : now;
  const trialEnds = sub?.trial_ends_at ?? new Date(created + TRIAL_DAYS * 86_400_000).toISOString();
  const trialStart = sub?.created_at ? Date.parse(sub.created_at) : created;
  const totalDays = Math.max(1, Math.round((Date.parse(trialEnds) - trialStart) / 86_400_000)) || TRIAL_DAYS;
  const remainingDays = remainingTrialDays(trialEnds, now) ?? 0;
  const elapsedDays = Math.max(0, totalDays - remainingDays);
  const trialPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
  const isPaid = sub ? !sub.is_trial && sub.status === "active" : false;
  const tone = TONE[trialTone(remainingDays)];
  const setupPct = Math.max(0, Math.min(100, Math.round(setupRatio * 100)));
  const allDone = setupPct >= 100;

  const trialLine =
    remainingDays === 0
      ? "תקופת הניסיון הסתיימה. הפעילו מנוי כדי שהחנות תמשיך לקבל הזמנות."
      : remainingDays === 1
        ? "נשאר יום אחד לניסיון החינמי."
        : `נשארו ${remainingDays} ימי ניסיון חינם.`;
  const headline = allDone
    ? `🎉 כל הכבוד! החנות מוכנה לקבל הזמנות.${isPaid ? "" : ` ${trialLine}`}`
    : `החנות שלך מכוילת ב-${setupPct}%.${isPaid ? "" : ` ${trialLine}`}`;

  return (
    <div dir="rtl" className="bg-gradient-to-l from-primary/10 via-card to-card border border-primary/30 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-primary/15 text-primary p-2 rounded-xl"><Sparkles size={18}/></div>
          <div>
            <h3 className="font-black text-base leading-tight">המסע שלך לחנות חיה</h3>
            <p className="text-xs text-muted-foreground">כל משימה שתסיים מקרבת אותך להזמנה ראשונה</p>
          </div>
        </div>
        {!isPaid && (
          <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${tone.chip}`}>
            <Clock size={12}/> {remainingDays} ימים מתוך {totalDays}
          </div>
        )}
      </div>

      <p className={`text-sm font-medium mb-3 ${tone.text || "text-foreground"}`}>{headline}</p>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-[11px] font-bold text-muted-foreground mb-1">
            <span>השלמת ההקמה</span>
            <span className="text-primary">{setupPct}%</span>
          </div>
          <Progress value={setupPct} className="h-2.5"/>
        </div>
        {!isPaid && (
          <div>
            <div className="flex justify-between text-[11px] font-bold text-muted-foreground mb-1">
              <span>ימי ניסיון שנוצלו</span>
              <span>{elapsedDays}/{totalDays} ימים</span>
            </div>
            <Progress value={trialPct} className={`h-2.5 ${tone.bar}`}/>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
      {!isPaid && (
        <button
          type="button"
          onClick={goToBilling}
          className={`inline-flex items-center justify-center gap-2 font-bold px-4 py-2.5 rounded-xl text-sm transition ${
            remainingDays <= 5 ? "bg-foreground text-background hover:opacity-90" : "border-2 border-primary/40 text-primary hover:bg-primary/5"
          }`}
        >
          הפעל מנוי
        </button>
      )}
      {!allDone && nextTaskLabel && (
        <button
          type="button"
          onClick={onJumpToNext}
          className="w-full sm:w-auto inline-flex items-center justify-between gap-2 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl text-sm hover:opacity-90 transition"
        >
          <span>המשימה הבאה: {nextTaskLabel}</span>
          <ArrowLeft size={16}/>
        </button>
      )}
      </div>
    </div>
  );
}

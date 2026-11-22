import { useEffect, useState } from "react";
import { Sparkles, Clock, ArrowLeft } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const TRIAL_DAYS = 30;

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

  const created = createdAt ? new Date(createdAt).getTime() : now;
  const elapsedDays = Math.max(0, Math.floor((now - created) / 86_400_000));
  const remainingDays = Math.max(0, TRIAL_DAYS - elapsedDays);
  const trialPct = Math.min(100, Math.round((elapsedDays / TRIAL_DAYS) * 100));
  const setupPct = Math.max(0, Math.min(100, Math.round(setupRatio * 100)));
  const allDone = setupPct >= 100;

  const headline = allDone
    ? "🎉 כל הכבוד! החנות שלך מכוילת ב-100% ומוכנה לקבל הזמנות"
    : `החנות שלך מכוילת ב-${setupPct}%. נשארו עוד ${remainingDays} ימי הרצה חינם להתחיל להריץ לקוחות.`;

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
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full whitespace-nowrap">
          <Clock size={12}/> נותרו {remainingDays} ימים מתוך {TRIAL_DAYS}
        </div>
      </div>

      <p className="text-sm font-medium text-foreground mb-3">{headline}</p>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-[11px] font-bold text-muted-foreground mb-1">
            <span>השלמת ההקמה</span>
            <span className="text-primary">{setupPct}%</span>
          </div>
          <Progress value={setupPct} className="h-2.5"/>
        </div>
        <div>
          <div className="flex justify-between text-[11px] font-bold text-muted-foreground mb-1">
            <span>ניצול ימי ההרצה</span>
            <span>{elapsedDays}/{TRIAL_DAYS} ימים</span>
          </div>
          <Progress value={trialPct} className="h-2.5 opacity-70"/>
        </div>
      </div>

      {!allDone && nextTaskLabel && (
        <button
          type="button"
          onClick={onJumpToNext}
          className="mt-4 w-full sm:w-auto inline-flex items-center justify-between gap-2 bg-primary text-primary-foreground font-bold px-4 py-2.5 rounded-xl text-sm hover:opacity-90 transition"
        >
          <span>המשימה הבאה: {nextTaskLabel}</span>
          <ArrowLeft size={16}/>
        </button>
      )}
    </div>
  );
}

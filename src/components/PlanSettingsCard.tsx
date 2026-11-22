import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getPublicPlanSettings, savePlanSettings } from "@/lib/plan-settings.functions";
import { TRIAL_DAYS, MONTHLY_PRICE_ILS, withVat } from "@/lib/plans";

/** Super Admin: trial length + monthly price, applied to new stores and the landing page. */
export function PlanSettingsCard() {
  const getFn = useServerFn(getPublicPlanSettings);
  const saveFn = useServerFn(savePlanSettings);
  const [trialDays, setTrialDays] = useState(TRIAL_DAYS);
  const [price, setPrice] = useState(MONTHLY_PRICE_ILS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getFn().then((s) => { setTrialDays(s.trial_days); setPrice(s.monthly_price_ils); }).catch(() => {});
  }, [getFn]);

  async function save() {
    setSaving(true);
    try {
      await saveFn({ data: { trial_days: trialDays, monthly_price_ils: price } });
      toast.success("נשמר. חל על חנויות חדשות ועל דף הנחיתה.");
    } catch (e: any) {
      toast.error(e?.message === "forbidden" ? "אין הרשאה" : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }

  const { vat, total } = withVat(price || 0);
  return (
    <section dir="rtl" className="bg-card border border-border rounded-2xl p-4">
      <h3 className="font-black mb-1">מחיר ותקופת ניסיון</h3>
      <p className="text-xs text-muted-foreground mb-3">תקופת הניסיון חלה על חנויות שנפתחות מעכשיו. חנויות קיימות לא משתנות.</p>
      <div className="grid sm:grid-cols-3 gap-3 items-end">
        <label className="text-sm font-bold space-y-1">
          <span>ימי ניסיון</span>
          <input type="number" min={1} max={90} value={trialDays}
            onChange={(e) => setTrialDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
            className="w-full h-11 rounded-xl border border-border bg-background px-3" />
        </label>
        <label className="text-sm font-bold space-y-1">
          <span>מחיר חודשי (₪, לפני מע״מ)</span>
          <input type="number" min={1} step="1" value={price}
            onChange={(e) => setPrice(Math.max(1, Number(e.target.value) || 1))}
            className="w-full h-11 rounded-xl border border-border bg-background px-3" />
        </label>
        <button type="button" onClick={save} disabled={saving}
          className="h-11 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50">
          {saving ? "שומר..." : "שמירה"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">כולל מע״מ 18%: ₪{total} (מע״מ ₪{vat})</p>
    </section>
  );
}

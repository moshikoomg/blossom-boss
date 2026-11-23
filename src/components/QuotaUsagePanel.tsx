import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getStoreQuotas, type QuotaSummary } from "@/lib/quota.functions";
import { Progress } from "@/components/ui/progress";
import { ShieldAlert, Sparkles, MessageCircle, Mail, Bot, Image as ImageIcon } from "lucide-react";

const LABELS: Record<string, { name: string; icon: any }> = {
  whatsapp_outbound: { name: "הודעות WhatsApp", icon: MessageCircle },
  email_outbound:    { name: "מיילים יוצאים",  icon: Mail },
  ai_chat:           { name: "שיחות עם סוכן AI", icon: Bot },
  image_generation:  { name: "תמונות סטודיו AI", icon: ImageIcon },
};

export function QuotaUsagePanel({ storeId }: { storeId: string }) {
  const fetchQuotas = useServerFn(getStoreQuotas);
  const [data, setData] = useState<QuotaSummary | null>(null);
  useEffect(() => {
    (async () => {
      try { setData(await fetchQuotas({ data: { storeId } })); } catch {}
    })();
  }, [storeId]);
  // Hide the panel if the server answered with anything unexpected,
  // instead of breaking the whole subscription page.
  if (!data || typeof data.planKey !== "string" || !Array.isArray(data.quotas)) return null;

  return (
    <div dir="rtl" className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary"><Sparkles size={16}/></div>
          <div>
            <h3 className="font-black text-sm">המכסות שלך החודש</h3>
            <p className="text-[11px] text-muted-foreground">
              חבילה: <b>{data.planKey.toUpperCase()}</b>
              {data.isTrial && <> · <span className="text-amber-600">מצב ניסיון — מכסות מוגבלות ל-10%</span></>}
            </p>
          </div>
        </div>
        {data.isTrial && (
          <div className="text-[11px] flex items-center gap-1 text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-full px-2.5 py-1">
            <ShieldAlert size={12}/> הגנה מפני הוצאות
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.quotas.map((q) => {
          const meta = LABELS[q.key] || { name: q.key, icon: Sparkles };
          const Icon = meta.icon;
          const pct = q.effectiveLimit > 0 ? Math.min(100, Math.round((q.used / q.effectiveLimit) * 100)) : 0;
          return (
            <div key={q.key} className="border border-border rounded-xl p-3">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <Icon size={13}/> {meta.name}
                </div>
                <span className={q.exceeded ? "text-destructive font-bold" : "text-muted-foreground"}>
                  {q.used}/{q.effectiveLimit}
                  {q.isTrial && q.baseLimit > q.effectiveLimit && (
                    <span className="opacity-60"> (מתוך {q.baseLimit})</span>
                  )}
                </span>
              </div>
              <Progress value={pct} className="h-2"/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { LayoutSketch, type StorefrontLayout } from "@/components/OnboardingWizard";

const LAYOUTS: { id: StorefrontLayout; title: string }[] = [
  { id: "gallery", title: "גלריה" },
  { id: "shelves", title: "תפריט עליון ומדפים" },
  { id: "side", title: "תפריט צד" },
];

const ADDONS: { key: string; title: string; text: string; def: boolean }[] = [
  { key: "addon_sales_agent", title: "סוכן מכירות חכם באתר", text: "עונה ללקוחות ומציג זרים מתאימים.", def: false },
  { key: "addon_whatsapp", title: "כפתור וואטסאפ", text: "לקוחות פונים אליך בלחיצה אחת.", def: true },
];

/** Storefront style and sales add-ons. Each tap saves right away. */
export function StorefrontStyleSection() {
  const { store } = useStore();
  const storeId = store?.id ?? null;
  const [vals, setVals] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!storeId) return;
    void supabase
      .from("site_settings")
      .select("key,value")
      .eq("store_id", storeId)
      .in("key", ["storefront_layout", ...ADDONS.map((a) => a.key)])
      .then(({ data }) => {
        const m: Record<string, unknown> = {};
        for (const r of data || []) m[r.key] = r.value;
        setVals(m);
      });
  }, [storeId]);

  async function save(key: string, value: unknown) {
    if (!storeId) return;
    const prev = vals[key];
    setVals((v) => ({ ...v, [key]: value }));
    const { error } = await supabase
      .from("site_settings")
      .upsert({ store_id: storeId, key, value: value as never }, { onConflict: "store_id,key" });
    if (error) {
      setVals((v) => ({ ...v, [key]: prev }));
      toast.error("לא נשמר. נסו שוב.");
    } else toast.success("נשמר");
  }

  const layout = (vals.storefront_layout as StorefrontLayout) || "gallery";
  const isOn = (a: (typeof ADDONS)[number]) =>
    vals[a.key] === undefined ? a.def : vals[a.key] === true || vals[a.key] === "true";

  return (
    <section className="space-y-6">
      <div>
        <h3 className="font-black text-base mb-3">סגנון התצוגה</h3>
        <div className="grid grid-cols-3 gap-2.5">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => layout !== l.id && save("storefront_layout", l.id)}
              aria-pressed={layout === l.id}
              className={`rounded-2xl border-2 p-3 flex flex-col items-center gap-2 text-sm font-bold transition ${
                layout === l.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              <LayoutSketch id={l.id} />
              <span className="flex items-center gap-1 text-center">
                {layout === l.id && <Check size={14} className="text-primary" aria-hidden />}
                {l.title}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-black text-base mb-3">תוספות</h3>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          {ADDONS.map((a) => {
            const on = isOn(a);
            return (
              <button
                key={a.key}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => save(a.key, !on)}
                className="w-full flex items-center gap-3 p-4 text-right"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{a.title}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{a.text}</span>
                </span>
                <span className={`w-11 h-6 rounded-full p-0.5 shrink-0 transition-colors ${on ? "bg-primary" : "bg-muted"}`} aria-hidden>
                  <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "-translate-x-5" : ""}`} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

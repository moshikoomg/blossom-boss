import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, Palette, RotateCcw } from "lucide-react";
import { applyThemeColors } from "@/lib/theme-loader";
import { useStore } from "@/lib/store-context";

type Colors = { primary: string; primary_foreground: string; secondary: string; accent: string };

const DEFAULTS: Colors = {
  primary: "#2f7d5d",
  primary_foreground: "#ffffff",
  secondary: "#eef5f0",
  accent: "#dcefe2",
};

const FIELDS: { key: keyof Colors; label: string }[] = [
  { key: "primary", label: "צבע ראשי (כפתורים)" },
  { key: "primary_foreground", label: "טקסט על צבע ראשי" },
  { key: "secondary", label: "צבע משני" },
  { key: "accent", label: "צבע הדגשה" },
];

export function ThemeColorEditor() {
  const [c, setC] = useState<Colors>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  // Resolve the active store from StoreProvider — works for both store owners
  // and Super-Admin impersonation (StoreProvider already honours the
  // tmm_store_override localStorage flag during pre-hydration).
  const { store } = useStore();
  const storeId = store?.id ?? null;

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("store_id", storeId)
        .eq("key", "theme_colors")
        .maybeSingle();
      const v = (data as any)?.value as Partial<Colors> | undefined;
      if (v) setC({ ...DEFAULTS, ...v });
    })();
  }, [storeId]);

  function update(k: keyof Colors, v: string) {
    const next = { ...c, [k]: v };
    setC(next);
    applyThemeColors(next);
  }

  async function save() {
    if (!storeId) {
      toast.error("לא ניתן לשמור — חנות לא נטענה");
      return;
    }
    setSaving(true);
    // Explicit store_id + onConflict guarantees we write to THIS store's row,
    // never to whichever row default_store_id() happens to resolve to during
    // a header race.
    const { error } = await supabase
      .from("site_settings")
      .upsert(
        { store_id: storeId, key: "theme_colors", value: c as any },
        { onConflict: "store_id,key" },
      );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("צבעי האתר נשמרו");
  }

  function reset() {
    setC(DEFAULTS);
    applyThemeColors(DEFAULTS);
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <header className="flex items-center gap-2">
        <div className="bg-pink-500/10 text-pink-600 p-2 rounded-xl">
          <Palette size={18} />
        </div>
        <div>
          <h3 className="font-black text-base">צבעי האתר</h3>
          <p className="text-xs text-muted-foreground">צבעי הכפתורים והעיצוב הכללי. השינוי מיידי בתצוגה החיה.</p>
        </div>
      </header>
      <div className="grid sm:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block bg-background border border-border rounded-xl p-3">
            <span className="text-xs font-bold mb-2 block">{f.label}</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={c[f.key]}
                onChange={(e) => update(f.key, e.target.value)}
                className="w-12 h-10 rounded-lg border border-input cursor-pointer"
              />
              <input
                type="text"
                value={c[f.key]}
                onChange={(e) => update(f.key, e.target.value)}
                className="flex-1 bg-background border border-input rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={reset}
          className="bg-muted hover:bg-muted/70 font-bold px-3 py-2 rounded-lg text-sm flex items-center gap-1"
        >
          <RotateCcw size={14} /> איפוס
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="bg-primary text-primary-foreground font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
        >
          <Check size={14} /> שמור צבעים
        </button>
      </div>
    </section>
  );
}

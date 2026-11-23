import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { createStoreForUser } from "@/lib/store-create.functions";
import { supabase } from "@/integrations/supabase/client";

// One short form: the florist types only their own details. Nothing is copied
// from another site and no demo products are added, so the store starts clean.

interface OnboardingWizardProps {
  onComplete?: (ctx: OnboardingResult) => void;
  onClose?: () => void;
  initialBusinessName?: string;
  autoStart?: boolean;
  embedded?: boolean;
}

export interface OnboardingResult {
  track: "new";
  business_name?: string;
  storeId?: string;
}

const COLORS = [
  { id: "rose", label: "ורוד", primary: "#c9356b", accent: "#f8c8d8" },
  { id: "green", label: "ירוק", primary: "#2f7d4f", accent: "#cfe8d6" },
  { id: "black", label: "שחור וזהב", primary: "#1a1a1a", accent: "#c9a84c" },
];

export function OnboardingWizard({ onComplete, initialBusinessName }: OnboardingWizardProps) {
  const createStoreFn = useServerFn(createStoreForUser);
  const [name, setName] = useState(initialBusinessName ?? "");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [color, setColor] = useState(COLORS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneOk = phone.replace(/\D/g, "").length >= 9;
  const canSubmit = name.trim().length > 0 && phoneOk && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) throw new Error("not_signed_in");
      const c = COLORS.find((x) => x.id === color) ?? COLORS[0];
      const res = await createStoreFn({
        data: {
          name: name.trim(),
          city: city.trim(),
          phone: phone.trim(),
          theme: { primary: c.primary, accent: c.accent },
        },
      });
      if (!res?.storeId) throw new Error("missing_store_id");
      try {
        localStorage.setItem("tmm_current_store_id", res.storeId);
        localStorage.setItem("tmm_store_override", res.storeId);
      } catch {
        /* storage blocked */
      }
      onComplete?.({ track: "new", business_name: name.trim(), storeId: res.storeId });
    } catch (err) {
      console.error("create store failed", err);
      setError(
        err instanceof Error && err.message === "not_signed_in"
          ? "צריך להתחבר קודם. רעננו את הדף ונסו שוב."
          : "לא הצלחנו לפתוח את החנות. נסו שוב בעוד רגע.",
      );
      setBusy(false);
    }
  }

  const input =
    "w-full h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <form dir="rtl" onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="block text-sm font-bold mb-1.5">שם החנות</span>
        <input
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="לדוגמה: פרחי מורן"
          maxLength={80}
          autoFocus
          required
        />
      </label>
      <label className="block">
        <span className="block text-sm font-bold mb-1.5">טלפון / וואטסאפ להזמנות</span>
        <input
          className={input}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="050-0000000"
          type="tel"
          inputMode="tel"
          dir="ltr"
          required
        />
      </label>
      <label className="block">
        <span className="block text-sm font-bold mb-1.5">
          עיר <span className="font-normal text-muted-foreground">(לא חובה)</span>
        </span>
        <input
          className={input}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="לדוגמה: חיפה"
          maxLength={80}
        />
      </label>
      <fieldset>
        <legend className="block text-sm font-bold mb-1.5">צבע לחנות</legend>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setColor(c.id)}
              aria-pressed={color === c.id}
              className={`flex-1 h-12 rounded-xl border-2 flex items-center justify-center gap-2 text-sm font-bold ${
                color === c.id ? "border-primary" : "border-border"
              }`}
            >
              <span className="w-5 h-5 rounded-full" style={{ background: c.primary }} aria-hidden />
              {c.label}
              {color === c.id && <Check size={14} aria-hidden />}
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-black text-base disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {busy ? (
          <>
            <Loader2 className="animate-spin" size={18} /> פותחים את החנות…
          </>
        ) : (
          "פתיחת החנות"
        )}
      </button>
      <p className="text-xs text-muted-foreground text-center">
        את המוצרים, התמונות ושעות הפעילות מוסיפים אחר כך מתוך הניהול.
      </p>
    </form>
  );
}

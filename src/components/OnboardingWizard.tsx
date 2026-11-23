import { useState } from "react";
import { ArrowRight, Bot, Check, Loader2, MessageCircle, Wand2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { createStoreForUser } from "@/lib/store-create.functions";
import { supabase } from "@/integrations/supabase/client";

// Store opening as a short deck of cards, one question per card. The florist
// types only their own details. Nothing is copied from another site and no
// demo products are added, so the store starts clean.

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

export type StorefrontLayout = "gallery" | "shelves" | "side";

const LAYOUTS: { id: StorefrontLayout; title: string; text: string; recommended?: boolean }[] = [
  { id: "gallery", title: "גלריה", text: "כל הזרים ברשת תמונות גדולה, עם קטגוריות למעלה.", recommended: true },
  { id: "shelves", title: "תפריט עליון ומדפים", text: "שורה נגללת לכל קטגוריה, כמו מדפים בחנות." },
  { id: "side", title: "תפריט צד", text: "רשימת קטגוריות בצד, והמוצרים לידה." },
];

const COLORS = [
  { id: "rose", label: "ורוד", primary: "#c9356b", accent: "#f8c8d8" },
  { id: "green", label: "ירוק", primary: "#2f7d4f", accent: "#cfe8d6" },
  { id: "black", label: "שחור וזהב", primary: "#1a1a1a", accent: "#c9a84c" },
];

const STEPS = ["style", "name", "details", "color", "addons"] as const;

export function OnboardingWizard({ onComplete, initialBusinessName }: OnboardingWizardProps) {
  const createStoreFn = useServerFn(createStoreForUser);
  const [step, setStep] = useState(0);
  const [layout, setLayout] = useState<StorefrontLayout>("gallery");
  const [name, setName] = useState(initialBusinessName ?? "");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [color, setColor] = useState(COLORS[0].id);
  const [salesAgent, setSalesAgent] = useState(true);
  const [whatsapp, setWhatsapp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = STEPS[step];
  const phoneOk = phone.replace(/\D/g, "").length >= 9;
  const canNext =
    current === "name" ? name.trim().length > 0 : current === "details" ? phoneOk : true;
  const last = step === STEPS.length - 1;
  const theme = COLORS.find((x) => x.id === color) ?? COLORS[0];

  async function finish() {
    setError(null);
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) throw new Error("not_signed_in");
      const res = await createStoreFn({
        data: {
          name: name.trim(),
          city: city.trim(),
          phone: phone.trim(),
          layout,
          addons: { sales_agent: salesAgent, whatsapp },
          theme: { primary: theme.primary, accent: theme.accent },
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

  function next(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canNext || busy) return;
    if (last) void finish();
    else setStep(step + 1);
  }

  const input =
    "w-full h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <form dir="rtl" onSubmit={next} className="space-y-5">
      <div className="flex gap-1.5" aria-label={`שלב ${step + 1} מתוך ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>

      <div key={current} className="animate-in fade-in slide-in-from-left-2 duration-300 min-h-[17rem]">
        {current === "style" && (
          <Card title="איך תיראה החנות שלך?" hint="אפשר לשנות בכל רגע.">
            <div className="grid gap-2.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLayout(l.id)}
                  aria-pressed={layout === l.id}
                  className={`relative flex items-center gap-3 rounded-2xl border-2 p-3 text-right transition ${
                    layout === l.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <LayoutSketch id={l.id} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-bold">
                      {l.title}
                      {l.recommended && (
                        <span className="rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5">
                          מומלץ
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{l.text}</span>
                  </span>
                  {layout === l.id && <Check size={18} className="text-primary shrink-0" aria-hidden />}
                </button>
              ))}
            </div>
          </Card>
        )}

        {current === "name" && (
          <Card title="איך קוראים לחנות?" hint="השם יופיע בראש האתר ובקישור שלך.">
            <input
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: פרחי מורן"
              maxLength={80}
              autoFocus
              aria-label="שם החנות"
            />
          </Card>
        )}

        {current === "details" && (
          <Card title="איך לקוחות יגיעו אליך?" hint="לטלפון הזה יגיעו הזמנות והודעות וואטסאפ.">
            <div className="space-y-3">
              <label className="block">
                <span className="block text-sm font-bold mb-1.5">טלפון / וואטסאפ</span>
                <input
                  className={input}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="050-0000000"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  autoFocus
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
            </div>
          </Card>
        )}

        {current === "color" && (
          <Card title="איזה צבע מתאים לך?" hint="הצבע הראשי של הכפתורים והכותרות.">
            <div className="grid gap-2.5">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColor(c.id)}
                  aria-pressed={color === c.id}
                  className={`h-14 rounded-2xl border-2 px-4 flex items-center gap-3 font-bold transition ${
                    color === c.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="flex -space-x-1.5 space-x-reverse" aria-hidden>
                    <span className="w-7 h-7 rounded-full ring-2 ring-background" style={{ background: c.primary }} />
                    <span className="w-7 h-7 rounded-full ring-2 ring-background" style={{ background: c.accent }} />
                  </span>
                  {c.label}
                  {color === c.id && <Check size={18} className="text-primary mr-auto" aria-hidden />}
                </button>
              ))}
            </div>
          </Card>
        )}

        {current === "addons" && (
          <Card title="תוספות שמגדילות מכירות" hint="כלול בתקופת הניסיון. אפשר לכבות בכל רגע.">
            <div className="grid gap-2.5">
              <Toggle
                icon={<Bot size={20} />}
                title="סוכן מכירות חכם באתר"
                text="עונה ללקוחות, מציג זרים מתאימים ועוזר לסגור הזמנה."
                on={salesAgent}
                setOn={setSalesAgent}
              />
              <Toggle
                icon={<MessageCircle size={20} />}
                title="כפתור וואטסאפ"
                text="לקוחות פונים אליך בוואטסאפ בלחיצה אחת."
                on={whatsapp}
                setOn={setWhatsapp}
              />
              <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border p-3 text-muted-foreground">
                <Wand2 size={20} className="shrink-0" aria-hidden />
                <span className="text-sm">
                  <b className="text-foreground">שיפור תמונות לפי סגנון החנות</b> · בקרוב
                </span>
              </div>
            </div>
          </Card>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            disabled={busy}
            className="h-12 px-4 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5"
          >
            <ArrowRight size={16} aria-hidden /> חזרה
          </button>
        )}
        <button
          type="submit"
          disabled={!canNext || busy}
          className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-black text-base disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin" size={18} /> פותחים את החנות…
            </>
          ) : last ? (
            "פתיחת החנות 🌷"
          ) : (
            "המשך"
          )}
        </button>
      </div>
    </form>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xl font-black">{title}</h3>
      {hint && <p className="text-sm text-muted-foreground mt-1 mb-4">{hint}</p>}
      {children}
    </section>
  );
}

function Toggle({
  icon,
  title,
  text,
  on,
  setOn,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  on: boolean;
  setOn: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
      className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-right transition ${
        on ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <span className={`shrink-0 ${on ? "text-primary" : "text-muted-foreground"}`} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{text}</span>
      </span>
      <span
        className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${on ? "bg-primary" : "bg-muted"}`}
        aria-hidden
      >
        <span
          className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "-translate-x-5" : ""}`}
        />
      </span>
    </button>
  );
}

/** Tiny wireframe of each storefront style. */
export function LayoutSketch({ id }: { id: StorefrontLayout }) {
  const box = "fill-primary/25";
  return (
    <svg viewBox="0 0 64 48" className="w-16 h-12 shrink-0 rounded-lg bg-muted" aria-hidden>
      <rect x="4" y="4" width="56" height="5" rx="2" className="fill-primary/50" />
      {id === "gallery" && (
        <>
          {[0, 1, 2].map((i) => (
            <rect key={`c${i}`} x={40 - i * 12} y="12" width="10" height="3" rx="1.5" className="fill-primary/40" />
          ))}
          {[0, 1, 2].map((c) =>
            [0, 1].map((r) => (
              <rect key={`${c}${r}`} x={4 + c * 19} y={18 + r * 14} width="17" height="12" rx="2" className={box} />
            )),
          )}
        </>
      )}
      {id === "shelves" && (
        <>
          {[0, 1].map((r) => (
            <g key={r}>
              <rect x="44" y={13 + r * 17} width="16" height="3" rx="1.5" className="fill-primary/40" />
              {[0, 1, 2, 3].map((c) => (
                <rect key={c} x={46 - c * 14} y={18 + r * 17} width="12" height="10" rx="2" className={box} />
              ))}
            </g>
          ))}
        </>
      )}
      {id === "side" && (
        <>
          {[0, 1, 2, 3].map((i) => (
            <rect key={`s${i}`} x="46" y={13 + i * 7} width="14" height="4" rx="1.5" className="fill-primary/40" />
          ))}
          {[0, 1].map((c) =>
            [0, 1].map((r) => (
              <rect key={`${c}${r}`} x={4 + c * 20} y={13 + r * 17} width="18" height="15" rx="2" className={box} />
            )),
          )}
        </>
      )}
    </svg>
  );
}

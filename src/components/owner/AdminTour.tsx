import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Flower2,
  Package,
  Settings,
  Store,
  Sun,
  X,
} from "lucide-react";
import { SETUP_STEPS } from "@/lib/owner-setup";

// Step 1 of the owner's setup: a short deck of cards that names each part
// of the admin, one per card, while the matching menu item lights up.
const CARDS: { area?: string; icon: typeof Sun; title: string; text: string }[] = [
  {
    icon: Flower2,
    title: "ברוכים הבאים!",
    text: "בדקה אחת נכיר את מערכת הניהול. אחר כך נעצב את חזית החנות ונעלה מוצרים למדפים.",
  },
  {
    area: "today",
    icon: Sun,
    title: "היום",
    text: "כל בוקר מתחילים כאן: המשלוחים של היום ומחר, ומה צריך להכין.",
  },
  {
    area: "orders",
    icon: ClipboardList,
    title: "הזמנות",
    text: "כל הזמנה חדשה מגיעה לכאן. מעדכנים סטטוס בלחיצה אחת.",
  },
  {
    area: "catalog",
    icon: Package,
    title: "מוצרים",
    text: "הזרים, הקטגוריות והתוספות. תמונה, שם ומחיר, וזהו.",
  },
  {
    area: "settings",
    icon: Settings,
    title: "הגדרות",
    text: "פרטי העסק, משלוחים ושעות, עיצוב ותקנון. ממלאים פעם אחת.",
  },
  {
    icon: Store,
    title: "עכשיו לחזית החנות",
    text: "נעבור לחנות כמו שהלקוחות רואים אותה. שם מעצבים בלחיצה על מה שרוצים לשנות.",
  },
];

export function AdminTour({
  storeName,
  onArea,
  onFinish,
}: {
  storeName?: string;
  onArea: (area: string | null) => void;
  onFinish: () => void;
}) {
  const [i, setI] = useState(0);
  const card = CARDS[i];
  const last = i === CARDS.length - 1;
  const Icon = card.icon;

  useEffect(() => {
    onArea(card.area ?? null);
  }, [card.area, onArea]);
  useEffect(() => () => onArea(null), [onArea]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setI((n) => Math.min(CARDS.length - 1, n + 1));
      if (e.key === "ArrowRight") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 bottom-14 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:right-72 md:left-auto z-[90] p-3 md:p-0 pointer-events-none"
    >
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        className="pointer-events-auto mx-auto w-full max-w-md md:w-96 bg-card border-2 border-primary/30 shadow-2xl rounded-3xl p-6 animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-right-4 duration-300"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold text-primary">
            שלב 1 מתוך {SETUP_STEPS.length} · {SETUP_STEPS[0].label}
          </p>
          <button
            onClick={onFinish}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted"
            aria-label="דלג לחזית החנות"
          >
            דלג <X size={14} aria-hidden />
          </button>
        </div>
        <div
          key={i}
          className="animate-in fade-in slide-in-from-left-2 duration-300 min-h-[9.5rem]"
        >
          <span className="w-12 h-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-3">
            <Icon size={24} aria-hidden />
          </span>
          <h2 id="tour-title" className="text-xl font-black mb-1.5">
            {i === 0 && storeName ? `ברוכים הבאים ל${storeName}!` : card.title}
          </h2>
          <p className="text-[15px] text-muted-foreground leading-relaxed">{card.text}</p>
        </div>
        <div className="flex items-center justify-between gap-3 mt-5">
          <div className="flex gap-1.5" aria-label={`כרטיס ${i + 1} מתוך ${CARDS.length}`}>
            {CARDS.map((_, n) => (
              <button
                key={n}
                onClick={() => setI(n)}
                aria-label={`כרטיס ${n + 1}`}
                className={`h-2 rounded-full transition-all ${n === i ? "w-6 bg-primary" : "w-2 bg-muted hover:bg-primary/40"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                onClick={() => setI(i - 1)}
                className="h-11 w-11 rounded-xl border border-border grid place-items-center hover:bg-muted"
                aria-label="הקודם"
              >
                <ArrowRight size={18} aria-hidden />
              </button>
            )}
            <button
              onClick={() => (last ? onFinish() : setI(i + 1))}
              className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center gap-2 hover:opacity-90"
              autoFocus
            >
              {last ? "לחזית החנות" : "הבא"} <ArrowLeft size={18} aria-hidden />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

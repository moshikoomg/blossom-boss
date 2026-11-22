import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie, X } from "lucide-react";

const STORAGE_KEY = "tmm_cookies_v1";

type Choice = "all" | "essential";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (!v) {
        // Slight delay so it doesn't fight the page hero on first paint.
        const t = setTimeout(() => setVisible(true), 600);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  function persist(choice: Choice) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ choice, ts: new Date().toISOString() }),
      );
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-label="הסכמה לעוגיות"
      className="fixed bottom-4 left-4 right-4 md:left-6 md:right-auto md:max-w-md z-50 animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      <div className="bg-card text-foreground border border-border rounded-2xl shadow-2xl p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Cookie size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-sm">השימוש שלנו בעוגיות</h3>
              <button
                onClick={() => persist("essential")}
                aria-label="סגור"
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              אנחנו משתמשים בעוגיות חיוניות להפעלת האתר ובעוגיות שיווק/אנליטיקה כדי לשפר את החוויה. אפשר לקרוא פרטים ב
              <Link to="/privacy" className="text-primary underline mx-1">מדיניות הפרטיות</Link>
              ובהצהרת
              <Link to="/accessibility" className="text-primary underline mx-1">הנגישות</Link>
              שלנו.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => persist("all")}
                className="flex-1 min-w-[120px] bg-primary text-primary-foreground text-sm font-bold rounded-xl px-4 py-2 hover:bg-primary/90"
              >
                אשר את כולן
              </button>
              <button
                onClick={() => persist("essential")}
                className="flex-1 min-w-[120px] bg-secondary text-foreground text-sm font-bold rounded-xl px-4 py-2 hover:bg-secondary/80 border border-border"
              >
                חיוניות בלבד
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

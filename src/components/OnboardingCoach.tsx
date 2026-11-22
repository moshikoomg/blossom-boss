import { useCallback, useEffect, useState } from "react";
import { X, ChevronLeft, Sparkles, Rocket, ListChecks } from "lucide-react";
import { SetupWizard, useSetupSnapshot, setupRatioFromState } from "@/components/SetupWizard";
import { PULSE_BACKSTAGE_FLAG } from "@/components/OnboardingSequencer";

const GATE_KEY = "tmm_coach_gate_v3";
const OPEN_EVENT = "tmm:open-setup";

/** Anyone can open the wizard from anywhere: `window.dispatchEvent(new Event("tmm:open-setup"))` */
export function openSetupWizard() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Self-contained interactive onboarding wizard.
 *
 * - First visit: shows a gate modal asking the merchant to start setup.
 * - Wizard body is the full SetupWizard — every card has inline inputs that
 *   auto-save to the database; no jumping out to other admin pages.
 * - Can be reopened any time via {@link openSetupWizard} or by listening to
 *   the `tmm:open-setup` event (used by SetupShortcutButton).
 */
export function OnboardingCoach() {
  const [phase, setPhase] = useState<"hidden" | "gate" | "wizard">("hidden");
  const { snap, setSnap, reload, loaded } = useSetupSnapshot();
  const allDone = loaded && setupRatioFromState(snap) >= 1;

  // First-visit gate (only when setup is actually incomplete).
  useEffect(() => {
    if (typeof window === "undefined" || !loaded) return;
    if (allDone) return;
    try {
      if (window.localStorage.getItem(GATE_KEY)) return;
      setPhase("gate");
    } catch {}
  }, [loaded, allDone]);

  // External "open" trigger from the floating shortcut button.
  const open = useCallback(() => setPhase("wizard"), []);
  useEffect(() => {
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [open]);

  function close() { setPhase("hidden"); }
  function postponeGate() {
    try { window.localStorage.setItem(GATE_KEY, "1"); } catch {}
    setPhase("hidden");
  }
  function startWizard() {
    try { window.localStorage.setItem(GATE_KEY, "1"); } catch {}
    setPhase("wizard");
  }

  if (phase === "hidden") return null;

  if (phase === "gate") {
    return (
      <Backdrop onClose={postponeGate}>
        <div className="relative w-full max-w-md bg-card border-2 border-primary/30 shadow-2xl rounded-3xl p-6 sm:p-8 animate-in zoom-in-95">
          <CloseBtn onClick={postponeGate} label="סגור" />
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center mb-4 shadow-md">
            <Sparkles size={26} />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-foreground mb-2">החנות שלך מוכנה! 🎉</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            נשלים יחד את ההגדרות הבסיסיות ישירות מתוך אשף קצר — כל הנתונים נשמרים אוטומטית, ואפשר לדלג ולחזור מתי שנוח.
          </p>
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button
              onClick={postponeGate}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              אחר כך
            </button>
            <button
              onClick={startWizard}
              className="flex-1 bg-primary text-primary-foreground font-bold py-2.5 rounded-xl hover:opacity-90 transition inline-flex items-center justify-center gap-2"
            >
              בואו נתחיל <ChevronLeft size={16} />
            </button>
          </div>
        </div>
      </Backdrop>
    );
  }

  // Wizard modal — fully contained in viewport: fixed shell with sticky
  // header, scrollable inner content, fixed footer area handled by the
  // wizard's own action bar (kept visible because we cap height to 100dvh).
  return (
    <Backdrop onClose={close}>
      <div
        className="relative w-full max-w-3xl bg-card border-2 border-primary/30 shadow-2xl rounded-3xl animate-in slide-in-from-bottom-6 sm:zoom-in-95 flex flex-col overflow-hidden"
        style={{ maxHeight: "min(92dvh, 100vh - 1rem)" }}
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3 bg-card/95 backdrop-blur border-b border-border">
          <div className="flex items-center gap-2 font-black">
            <Rocket size={18} className="text-primary" />
            <span className="truncate">השלמת הגדרת החנות</span>
          </div>
          <button
            onClick={close}
            aria-label="סגור"
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1 flex-shrink-0"
          >
            <X size={14} /> <span className="hidden sm:inline">דלג / סגור</span>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
          <SetupWizard snap={snap} setSnap={setSnap} reload={reload} onAllDone={() => setPhase("hidden")} />
        </div>
      </div>
    </Backdrop>
  );
}

/**
 * Persistent floating shortcut. Always visible inside the admin while the
 * mandatory setup tasks are incomplete, and reopens the wizard from wherever
 * the merchant left off.
 */
export function SetupShortcutButton() {
  const { snap, loaded } = useSetupSnapshot();
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    try { setPulse(localStorage.getItem(PULSE_BACKSTAGE_FLAG) === "1"); } catch {}
    const off = () => {
      try { setPulse(localStorage.getItem(PULSE_BACKSTAGE_FLAG) === "1"); } catch {}
    };
    window.addEventListener("storage", off);
    return () => window.removeEventListener("storage", off);
  }, []);
  if (!loaded) return null;
  const ratio = setupRatioFromState(snap);
  if (ratio >= 1) return null;
  const pct = Math.round(ratio * 100);

  return (
    <button
      type="button"
      onClick={() => {
        try { localStorage.removeItem(PULSE_BACKSTAGE_FLAG); } catch {}
        setPulse(false);
        openSetupWizard();
      }}
      dir="rtl"
      title="פתח את אשף הגדרת החנות"
      className={`fixed bottom-4 left-4 z-40 group inline-flex items-center gap-1.5 ps-2.5 pe-2 py-1.5 rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:scale-[1.03] active:scale-100 transition-transform ${pulse ? "pulse-cta" : ""}`}
    >
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-foreground/15">
        <ListChecks size={13} />
      </span>
      <span className="text-[11px] font-bold whitespace-nowrap">
        <span className="hidden md:inline">הגדרת החנות · </span>{pct}%
      </span>
    </button>
  );
}

/* ---------- shared modal bits ---------- */

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in overflow-hidden"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full flex justify-center max-h-full">
        {children}
      </div>
    </div>
  );
}

function CloseBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="absolute top-3 left-3 p-1.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted"
    >
      <X size={18} />
    </button>
  );
}

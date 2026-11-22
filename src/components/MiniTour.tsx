import { useEffect, useLayoutEffect, useState } from "react";
import { X, ChevronLeft } from "lucide-react";

/**
 * Lightweight DOM-anchored mini tour.
 * Walks through all elements with [data-tour-step] in document order,
 * highlighting each one and showing its [data-tour-title] / [data-tour-text]
 * inside a floating popover. RTL-aware.
 */
export function MiniTour({ onClose }: { onClose: () => void }) {
  const [steps, setSteps] = useState<HTMLElement[]>([]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-tour-step]"),
    ).filter((el) => el.offsetParent !== null);
    els.sort((a, b) => {
      const ai = Number(a.dataset.tourStep || 0);
      const bi = Number(b.dataset.tourStep || 0);
      return ai - bi;
    });
    setSteps(els);
  }, []);

  const current = steps[idx];

  useLayoutEffect(() => {
    if (!current) return;
    current.scrollIntoView({ behavior: "smooth", block: "center" });
    const update = () => setRect(current.getBoundingClientRect());
    update();
    const t = window.setTimeout(update, 350);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" || e.key === "ArrowLeft") next();
      if (e.key === "ArrowRight") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function next() {
    if (idx >= steps.length - 1) onClose();
    else setIdx(idx + 1);
  }
  function prev() {
    if (idx > 0) setIdx(idx - 1);
  }

  if (steps.length === 0) {
    return (
      <div dir="rtl" className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-card border border-border rounded-2xl p-5 max-w-sm mx-4 shadow-2xl text-center">
          <p className="font-bold mb-2">אין כרגע סיור באזור הזה</p>
          <p className="text-xs text-muted-foreground mb-4">עברו ל"תחילת עבודה" כדי לפתוח את הסיור המודרך.</p>
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold">סגור</button>
        </div>
      </div>
    );
  }

  const title = current?.dataset.tourTitle || "טיפ";
  const text = current?.dataset.tourText || "";

  // Popover placement — below the element when possible, else above.
  const margin = 12;
  const popW = 320;
  const popH = 180;
  let top = 0;
  let left = 0;
  if (rect) {
    const placeBelow = rect.bottom + popH + margin < window.innerHeight;
    top = placeBelow ? rect.bottom + margin : Math.max(margin, rect.top - popH - margin);
    left = Math.min(
      Math.max(margin, rect.left + rect.width / 2 - popW / 2),
      window.innerWidth - popW - margin,
    );
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-[10000] pointer-events-none">
      {/* Dim overlay with cutout */}
      {rect && (
        <svg className="absolute inset-0 w-full h-full pointer-events-auto" onClick={onClose}>
          <defs>
            <mask id="tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect
                x={rect.left - 6}
                y={rect.top - 6}
                width={rect.width + 12}
                height={rect.height + 12}
                rx="14"
                fill="black"
              />
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
          <rect
            x={rect.left - 6}
            y={rect.top - 6}
            width={rect.width + 12}
            height={rect.height + 12}
            rx="14"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            strokeDasharray="6 4"
            className="animate-pulse"
          />
        </svg>
      )}

      {/* Popover */}
      {rect && (
        <div
          className="absolute bg-card border border-border rounded-2xl shadow-2xl p-4 pointer-events-auto"
          style={{ top, left, width: popW }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2 mb-2">
            <div className="flex-1">
              <p className="text-[11px] font-bold text-primary mb-0.5">
                שלב {idx + 1} מתוך {steps.length}
              </p>
              <h4 className="font-black text-base leading-tight">{title}</h4>
            </div>
            <button
              onClick={onClose}
              aria-label="סגור סיור"
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
            >
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{text}</p>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={prev}
              disabled={idx === 0}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40"
            >
              הקודם
            </button>
            <div className="flex items-center gap-1">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${i === idx ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>
            <button
              onClick={next}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground inline-flex items-center gap-1"
            >
              {idx === steps.length - 1 ? "סיום" : "המשך"}
              <ChevronLeft size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

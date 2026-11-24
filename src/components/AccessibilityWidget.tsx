import { useEffect, useState } from "react";
import { Accessibility, Plus, Minus, RotateCcw, X, Type, Link2, MousePointer2, Pause, BookOpen, Contrast, Eye, Droplet, Highlighter, ZoomIn, AlignJustify } from "lucide-react";

const STORAGE = "tmm_a11y_v2";

type Prefs = {
  fontScale: number;       // 0.8 - 1.6
  letterSpacing: number;   // 0 - 0.2em
  lineHeight: number;      // 1 - 2.2
  zoom: number;            // 1 - 1.5
  contrast: "off" | "high" | "dark" | "light" | "invert" | "mono";
  underlineLinks: boolean;
  highlightLinks: boolean;
  highlightHeadings: boolean;
  readableFont: boolean;
  bigCursor: boolean;
  pauseAnimations: boolean;
  readingGuide: boolean;
  hideImages: boolean;
};

const DEFAULT: Prefs = {
  fontScale: 1, letterSpacing: 0, lineHeight: 1.5, zoom: 1,
  contrast: "off", underlineLinks: false, highlightLinks: false, highlightHeadings: false,
  readableFont: false, bigCursor: false, pauseAnimations: false, readingGuide: false, hideImages: false,
};

export function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [guideY, setGuideY] = useState(0);

  useEffect(() => {
    try { const raw = localStorage.getItem(STORAGE); if (raw) setPrefs({ ...DEFAULT, ...JSON.parse(raw) }); } catch {}
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.style.fontSize = `${prefs.fontScale * 100}%`;
    body.style.letterSpacing = prefs.letterSpacing ? `${prefs.letterSpacing}em` : "";
    body.style.lineHeight = prefs.lineHeight !== 1.5 ? String(prefs.lineHeight) : "";
    body.style.zoom = prefs.zoom !== 1 ? String(prefs.zoom) : "";

    const modes = ["high", "dark", "light", "invert", "mono"];
    modes.forEach((m) => root.classList.toggle(`a11y-${m}`, prefs.contrast === m));
    // legacy
    root.classList.toggle("a11y-contrast", prefs.contrast === "high");

    root.classList.toggle("a11y-underline", prefs.underlineLinks);
    root.classList.toggle("a11y-highlight-links", prefs.highlightLinks);
    root.classList.toggle("a11y-highlight-headings", prefs.highlightHeadings);
    root.classList.toggle("a11y-readable", prefs.readableFont);
    root.classList.toggle("a11y-big-cursor", prefs.bigCursor);
    root.classList.toggle("a11y-pause", prefs.pauseAnimations);
    root.classList.toggle("a11y-hide-images", prefs.hideImages);

    try { localStorage.setItem(STORAGE, JSON.stringify(prefs)); } catch {}
  }, [prefs]);

  useEffect(() => {
    if (!prefs.readingGuide) return;
    const onMove = (e: MouseEvent) => setGuideY(e.clientY);
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [prefs.readingGuide]);

  // Close panel on Escape key.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const update = (p: Partial<Prefs>) => setPrefs((s) => ({ ...s, ...p }));
  const toggle = (k: keyof Prefs) => setPrefs((s) => ({ ...s, [k]: !s[k] } as Prefs));

  const Tile = ({ active, onClick, icon: Icon, label }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg text-[11px] leading-tight border transition min-h-[64px] ${active ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/50 border-border hover:bg-secondary"}`}>
      <Icon size={18} />
      <span className="text-center">{label}</span>
    </button>
  );

  const Slider = ({ label, value, min, max, step, onChange, fmt }: any) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))} className="w-6 h-6 rounded bg-secondary flex items-center justify-center"><Minus size={11}/></button>
          <span className="w-12 text-center font-medium">{fmt ? fmt(value) : value}</span>
          <button onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))} className="w-6 h-6 rounded bg-secondary flex items-center justify-center"><Plus size={11}/></button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed left-3 bottom-4 md:left-2 md:bottom-24 z-30 w-9 h-9 md:w-11 md:h-11 rounded-full bg-slate-400/90 text-white dark:bg-zinc-700 dark:text-zinc-100 shadow-md ring-1 ring-black/5 flex items-center justify-center opacity-80 hover:opacity-100 hover:scale-105 transition"
        aria-label="פתח כלי נגישות"
        title="נגישות"
      >
        <Accessibility size={20} />
      </button>

      {prefs.readingGuide && (
        <div className="pointer-events-none fixed left-0 right-0 z-[60] h-10 bg-yellow-300/30 border-y-2 border-yellow-500" style={{ top: guideY - 20 }} />
      )}

      {open && (
        <div dir="rtl" className="fixed left-2 bottom-36 z-50 w-[320px] max-w-[calc(100vw-1rem)] max-h-[80vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl p-4 animate-in fade-in slide-in-from-bottom-3 duration-150">
          <div className="flex items-center justify-between mb-3 sticky top-0 bg-card pb-2 border-b border-border">
            <h3 className="font-bold text-sm flex items-center gap-2"><Accessibility size={16}/> תפריט נגישות</h3>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="סגור"><X size={16}/></button>
          </div>

          <div className="space-y-4">
            <section className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground">טקסט וקריאה</h4>
              <Slider label="גודל טקסט" value={prefs.fontScale} min={0.8} max={1.6} step={0.1} onChange={(v: number) => update({ fontScale: v })} fmt={(v: number) => `${Math.round(v*100)}%`} />
              <Slider label="ריווח אותיות" value={prefs.letterSpacing} min={0} max={0.2} step={0.02} onChange={(v: number) => update({ letterSpacing: v })} fmt={(v: number) => v.toFixed(2)} />
              <Slider label="ריווח שורות" value={prefs.lineHeight} min={1} max={2.2} step={0.1} onChange={(v: number) => update({ lineHeight: v })} fmt={(v: number) => v.toFixed(1)} />
              <Slider label="הגדלת תוכן" value={prefs.zoom} min={1} max={1.5} step={0.1} onChange={(v: number) => update({ zoom: v })} fmt={(v: number) => `${Math.round(v*100)}%`} />
            </section>

            <section className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground">ניגודיות וצבע</h4>
              <div className="grid grid-cols-3 gap-2">
                <Tile active={prefs.contrast==="high"} onClick={() => update({ contrast: prefs.contrast==="high"?"off":"high" })} icon={Contrast} label="ניגודיות גבוהה" />
                <Tile active={prefs.contrast==="dark"} onClick={() => update({ contrast: prefs.contrast==="dark"?"off":"dark" })} icon={Eye} label="מצב כהה" />
                <Tile active={prefs.contrast==="light"} onClick={() => update({ contrast: prefs.contrast==="light"?"off":"light" })} icon={Droplet} label="מצב בהיר" />
                <Tile active={prefs.contrast==="invert"} onClick={() => update({ contrast: prefs.contrast==="invert"?"off":"invert" })} icon={Eye} label="הפוך צבעים" />
                <Tile active={prefs.contrast==="mono"} onClick={() => update({ contrast: prefs.contrast==="mono"?"off":"mono" })} icon={Droplet} label="גווני אפור" />
                <Tile active={prefs.readableFont} onClick={() => toggle("readableFont")} icon={Type} label="פונט קריא" />
              </div>
            </section>

            <section className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground">ניווט וסיוע</h4>
              <div className="grid grid-cols-3 gap-2">
                <Tile active={prefs.underlineLinks} onClick={() => toggle("underlineLinks")} icon={Link2} label="קו תחת קישורים" />
                <Tile active={prefs.highlightLinks} onClick={() => toggle("highlightLinks")} icon={Highlighter} label="הדגשת קישורים" />
                <Tile active={prefs.highlightHeadings} onClick={() => toggle("highlightHeadings")} icon={AlignJustify} label="הדגשת כותרות" />
                <Tile active={prefs.bigCursor} onClick={() => toggle("bigCursor")} icon={MousePointer2} label="סמן גדול" />
                <Tile active={prefs.readingGuide} onClick={() => toggle("readingGuide")} icon={BookOpen} label="קו עזר לקריאה" />
                <Tile active={prefs.pauseAnimations} onClick={() => toggle("pauseAnimations")} icon={Pause} label="עצור אנימציות" />
                <Tile active={prefs.hideImages} onClick={() => toggle("hideImages")} icon={ZoomIn} label="הסתר תמונות" />
              </div>
            </section>

            <button onClick={() => setPrefs(DEFAULT)} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30">
              <RotateCcw size={12}/> איפוס הגדרות
            </button>

            <a href="/accessibility" className="block text-center text-[11px] text-muted-foreground hover:text-foreground underline">הצהרת נגישות</a>
          </div>
        </div>
      )}
    </>
  );
}

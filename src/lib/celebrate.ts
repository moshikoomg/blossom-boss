import confetti from "canvas-confetti";

// Single, shared celebration helper so every "win" feels consistent.
// Reads brand colors from CSS variables (--primary / --primary-glow /
// --secondary / --accent) so confetti matches the store's theme. Falls
// back to a festive multi-color burst if the page hasn't themed yet.
function readBrandPalette(): string[] {
  if (typeof window === "undefined") return ["#22c55e", "#f59e0b", "#ec4899"];
  try {
    const cs = getComputedStyle(document.documentElement);
    const keys = ["--primary", "--primary-glow", "--secondary", "--accent", "--chart-1", "--chart-2"];
    const out: string[] = [];
    for (const k of keys) {
      const raw = cs.getPropertyValue(k).trim();
      if (!raw) continue;
      // canvas-confetti accepts any CSS color string the canvas understands —
      // oklch() is supported in modern Chromium/WebKit/Firefox. Wrap bare
      // tokens in oklch() if needed.
      out.push(raw.startsWith("oklch") || raw.startsWith("#") || raw.startsWith("rgb") || raw.startsWith("hsl")
        ? raw
        : `oklch(${raw})`);
    }
    if (out.length >= 2) return out;
  } catch {}
  return ["#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];
}

export function celebrate(opts: { intense?: boolean; brand?: boolean } = {}) {
  try {
    const palette = opts.brand !== false
      ? readBrandPalette()
      : ["#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];
    const base = {
      spread: 70,
      startVelocity: 45,
      ticks: 200,
      gravity: 0.9,
      scalar: 1,
      colors: palette,
    } as const;

    confetti({ ...base, particleCount: 80, origin: { x: 0.5, y: 0.3 } });

    if (opts.intense) {
      setTimeout(() => confetti({ ...base, particleCount: 60, angle: 60, origin: { x: 0, y: 0.6 } }), 150);
      setTimeout(() => confetti({ ...base, particleCount: 60, angle: 120, origin: { x: 1, y: 0.6 } }), 250);
      setTimeout(() => confetti({ ...base, particleCount: 100, spread: 120, origin: { x: 0.5, y: 0.4 } }), 450);
    }
  } catch {
    // confetti is best-effort, never block the success path
  }
}

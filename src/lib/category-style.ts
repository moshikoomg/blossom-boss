export type CategoryStyle = {
  id: string;
  name: string;
  bg_color?: string;
  bg_color_to?: string;
  bg_effect?: string;
  bg_image_url?: string;
  bg_shape?: string;     // 'fill' | 'rounded' | 'square' | 'circle' | 'pill'
  bg_size?: number;      // 0-100
  bg_position?: string;  // 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
};

function bgPaint(cat: CategoryStyle): string | undefined {
  const img = cat.bg_image_url?.trim();
  const a = cat.bg_color?.trim();
  const b = cat.bg_color_to?.trim();
  const eff = cat.bg_effect || "none";
  if (img) {
    if (eff === "gradient" || eff === "both") {
      return `linear-gradient(135deg, ${a || "transparent"}, ${b || "transparent"}), url(${img}) center/cover`;
    }
    return `url(${img}) center/cover`;
  }
  if (!a && !b) return undefined;
  const c1 = a || b!;
  const c2 = b || a!;
  if (eff === "gradient" || eff === "both") return `linear-gradient(135deg, ${c1}, ${c2})`;
  return c1;
}

export function categoryBg(cat?: CategoryStyle | null): React.CSSProperties {
  if (!cat) return {};
  const shape = cat.bg_shape || "fill";
  if (shape !== "fill") return {}; // shape rendered as overlay element
  const paint = bgPaint(cat);
  if (!paint) return {};
  return { background: paint };
}

export function categoryHaloClass(cat?: CategoryStyle | null): string {
  const eff = cat?.bg_effect;
  return eff === "halo" || eff === "both"
    ? "after:absolute after:inset-2 after:rounded-2xl after:bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.55),transparent_70%)] after:pointer-events-none"
    : "";
}

const POS_MAP: Record<string, React.CSSProperties> = {
  center:        { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
  top:           { top: "6%", left: "50%", transform: "translateX(-50%)" },
  bottom:        { bottom: "6%", left: "50%", transform: "translateX(-50%)" },
  left:          { top: "50%", left: "6%", transform: "translateY(-50%)" },
  right:         { top: "50%", right: "6%", transform: "translateY(-50%)" },
  "top-left":    { top: "6%", left: "6%" },
  "top-right":   { top: "6%", right: "6%" },
  "bottom-left": { bottom: "6%", left: "6%" },
  "bottom-right":{ bottom: "6%", right: "6%" },
};

export function categoryShapeStyle(cat?: CategoryStyle | null): React.CSSProperties | null {
  if (!cat) return null;
  const shape = cat.bg_shape || "fill";
  if (shape === "fill") return null;
  const paint = bgPaint(cat);
  if (!paint) return null;
  const sz = Math.max(10, Math.min(100, cat.bg_size ?? 60));
  const pos = POS_MAP[cat.bg_position || "center"] || POS_MAP.center;
  let radius = "0";
  let aspect: string | undefined;
  if (shape === "rounded") radius = "1rem";
  else if (shape === "square") { radius = "0.5rem"; aspect = "1 / 1"; }
  else if (shape === "circle") { radius = "9999px"; aspect = "1 / 1"; }
  else if (shape === "pill") { radius = "9999px"; aspect = "2 / 1"; }
  return {
    position: "absolute",
    width: `${sz}%`,
    ...(aspect ? { aspectRatio: aspect } : { height: `${sz}%` }),
    background: paint,
    borderRadius: radius,
    ...pos,
    zIndex: 0,
    pointerEvents: "none",
  };
}

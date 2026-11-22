import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@tanstack/react-router";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { PLATFORM_TEMPLATE_STORE_ID } from "@/lib/platform-template";
import { getStorefrontUrlSignature, isLazyPreviewMode } from "@/lib/preview-mode";

export type Popup = {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  bg_video_url: string | null;
  bg_color: string;
  text_color: string;
  cta_label: string | null;
  cta_url: string | null;
  auto_close_seconds: number | null;
  rotate_seconds: number | null;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  trigger_type: "immediate" | "delay" | "scroll" | "exit_intent" | "click" | "category";
  trigger_value: string;
  trigger_category_ids: string[];
  size: "sm" | "md" | "lg" | "xl" | "full";
  shape: "rounded" | "square" | "pill" | "circle";
  position: "center" | "top" | "bottom" | "corner";
  animation: "fade" | "zoom" | "slide-up" | "slide-down" | "bounce";
  overlay_opacity: number;
  bg_opacity: number;
  layout: "image-top" | "image-bottom" | "image-left" | "image-right" | "image-bg" | "image-only" | "text-only";
  text_align: "right" | "center" | "left";
  content_padding: number;
};

export const SIZE_CLASS: Record<Popup["size"], string> = {
  sm: "max-w-xs",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  full: "max-w-[95vw]",
};
export const SHAPE_CLASS: Record<Popup["shape"], string> = {
  rounded: "rounded-3xl",
  square: "rounded-none",
  pill: "rounded-[3rem]",
  circle: "rounded-full aspect-square flex items-center justify-center",
};
export const POSITION_CLASS: Record<Popup["position"], string> = {
  center: "items-center justify-center",
  top: "items-start justify-center pt-10",
  bottom: "items-end justify-center pb-10",
  corner: "items-end justify-end p-6",
};
export const ANIM_CLASS: Record<Popup["animation"], string> = {
  fade: "animate-in fade-in duration-300",
  zoom: "animate-in zoom-in-95 fade-in duration-300",
  "slide-up": "animate-in slide-in-from-bottom-8 fade-in duration-400",
  "slide-down": "animate-in slide-in-from-top-8 fade-in duration-400",
  bounce: "animate-in zoom-in-50 fade-in duration-500",
};

export function PopupCard({ popup, onClose, onCta, count, idx, onPrev, onNext }: {
  popup: Popup;
  onClose: () => void;
  onCta?: () => void;
  count?: number;
  idx?: number;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const hasVideo = !!popup.bg_video_url;
  const isCircle = popup.shape === "circle";
  const layout = popup.layout || "image-top";
  const showImageAsBg = layout === "image-bg" && !!popup.image_url && !hasVideo;
  const isImageOnly = layout === "image-only" && !!popup.image_url && !hasVideo;
  const padding = popup.content_padding ?? 24;
  const textAlignClass = popup.text_align === "left" ? "text-left" : popup.text_align === "right" ? "text-right" : "text-center";
  const bgRgba = (() => {
    const hex = (popup.bg_color || "#ffffff").replace("#", "");
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const r = parseInt(full.slice(0,2), 16) || 255;
    const g = parseInt(full.slice(2,4), 16) || 255;
    const b = parseInt(full.slice(4,6), 16) || 255;
    return `rgba(${r},${g},${b},${popup.bg_opacity ?? 1})`;
  })();

  const textBlock = (
    <div className={`flex-1 ${textAlignClass}`} style={{ padding }}>
      {popup.title && <h2 className="text-2xl font-black mb-2">{popup.title}</h2>}
      {popup.body && <p className="text-sm opacity-90 whitespace-pre-wrap">{popup.body}</p>}
      {popup.cta_label && (
        <button onClick={onCta} className="inline-block mt-4 px-6 py-3 rounded-full font-bold bg-black/90 text-white hover:bg-black transition">
          {popup.cta_label}
        </button>
      )}
      {count && count > 1 && idx !== undefined && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={onPrev} className="p-1 bg-black/10 rounded-full"><ChevronRight size={14}/></button>
          <div className="flex gap-1 items-center">
            {Array.from({ length: count }).map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full bg-current ${i === idx ? "opacity-100" : "opacity-30"}`}/>
            ))}
          </div>
          <button onClick={onNext} className="p-1 bg-black/10 rounded-full"><ChevronLeft size={14}/></button>
        </div>
      )}
    </div>
  );

  const imgBlock = popup.image_url && !hasVideo && layout !== "image-bg" && layout !== "text-only" ? (
    layout === "image-left" || layout === "image-right" ? (
      <img src={popup.image_url} alt="" className="w-1/2 h-full object-cover"/>
    ) : (
      <img src={popup.image_url} alt="" className="w-full h-44 object-cover"/>
    )
  ) : null;

  const flexDir =
    layout === "image-bottom" ? "flex-col-reverse" :
    layout === "image-left" ? "flex-row-reverse" :
    layout === "image-right" ? "flex-row" :
    "flex-col";

  // Image-only: the uploaded image IS the popup, in its natural shape — no frame, no crop.
  if (isImageOnly) {
    const hasOverlayText = !!popup.title || !!popup.body || !!popup.cta_label;
    return (
      <div
        className={`relative inline-block ${SHAPE_CLASS[popup.shape]} shadow-2xl overflow-hidden ${ANIM_CLASS[popup.animation]}`}
        style={{ color: popup.text_color, maxWidth: "min(95vw, 720px)", maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={popup.image_url!}
          alt={popup.title || ""}
          className={`block w-auto h-auto max-w-full ${popup.cta_url ? "cursor-pointer" : ""}`}
          style={{ maxHeight: "85vh" }}
          onClick={popup.cta_url ? onCta : undefined}
        />
        <button onClick={onClose} aria-label="סגור" className="absolute top-3 left-3 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 z-10">
          <X size={16}/>
        </button>
        {hasOverlayText && (
          <div className={`absolute inset-x-0 bottom-0 ${textAlignClass} bg-gradient-to-t from-black/70 to-transparent text-white`} style={{ padding }}>
            {popup.title && <h2 className="text-2xl font-black mb-1">{popup.title}</h2>}
            {popup.body && <p className="text-sm opacity-95 whitespace-pre-wrap">{popup.body}</p>}
            {popup.cta_label && (
              <button onClick={onCta} className="inline-block mt-3 px-6 py-2.5 rounded-full font-bold bg-white text-black hover:bg-white/90 transition">
                {popup.cta_label}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative w-full ${SIZE_CLASS[popup.size]} ${SHAPE_CLASS[popup.shape]} shadow-2xl overflow-hidden ${ANIM_CLASS[popup.animation]}`}
      style={{ backgroundColor: bgRgba, color: popup.text_color }}
      onClick={(e) => e.stopPropagation()}
    >
      {hasVideo && (
        <video src={popup.bg_video_url!} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover"/>
      )}
      {showImageAsBg && (
        <img src={popup.image_url!} alt="" className="absolute inset-0 w-full h-full object-cover"/>
      )}
      <div className="relative">
        <button onClick={onClose} aria-label="סגור" className="absolute top-3 left-3 bg-black/30 hover:bg-black/50 text-white rounded-full p-1.5 z-10">
          <X size={16}/>
        </button>
        {isCircle ? (
          <div className={`h-full flex flex-col items-center justify-center ${textAlignClass}`} style={{ padding }}>
            {popup.title && <h2 className="text-2xl font-black mb-2">{popup.title}</h2>}
            {popup.body && <p className="text-sm opacity-90 whitespace-pre-wrap">{popup.body}</p>}
            {popup.cta_label && (
              <button onClick={onCta} className="inline-block mt-4 px-6 py-3 rounded-full font-bold bg-black/90 text-white hover:bg-black transition">{popup.cta_label}</button>
            )}
          </div>
        ) : (
          <div className={`flex ${flexDir} ${hasVideo || showImageAsBg ? "bg-black/30 backdrop-blur-sm" : ""}`}>
            {imgBlock}
            {textBlock}
          </div>
        )}
      </div>
    </div>
  );
}

export function SitePopups() {
  const location = useLocation();
  const [popups, setPopups] = useState<Popup[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(sessionStorage.getItem("popup-dismissed") || "[]")); } catch { return new Set(); }
  });
  const [armed, setArmed] = useState<Set<string>>(new Set()); // popups whose trigger fired
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    (async () => {
      const now = new Date().toISOString();
      let q: any = supabase.from("site_popups").select("*").eq("active", true);
      if (isLazyPreviewMode()) q = q.eq("store_id", PLATFORM_TEMPLATE_STORE_ID);
      const { data } = await q.order("display_order");
      const filtered = (data || []).filter((p: any) =>
        (!p.starts_at || p.starts_at <= now) && (!p.ends_at || p.ends_at >= now)
      ) as Popup[];
      setPopups(filtered);
    })();
  }, [location.pathname, location.search, getStorefrontUrlSignature()]);

  // Trigger evaluation
  const timersRef = useRef<number[]>([]);
  useEffect(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    const handlers: Array<() => void> = [];
    const arm = (id: string) => setArmed((prev) => prev.has(id) ? prev : new Set(prev).add(id));

    for (const p of popups) {
      if (dismissed.has(p.id)) continue;
      const type = p.trigger_type || "immediate";
      if (type === "immediate") {
        arm(p.id);
      } else if (type === "delay") {
        const sec = Math.max(0, Number(p.trigger_value) || 3);
        const t = window.setTimeout(() => arm(p.id), sec * 1000);
        timersRef.current.push(t);
      } else if (type === "scroll") {
        const pct = Math.min(100, Math.max(1, Number(p.trigger_value) || 50));
        const onScroll = () => {
          const total = document.documentElement.scrollHeight - window.innerHeight;
          if (total <= 0) return;
          if ((window.scrollY / total) * 100 >= pct) arm(p.id);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        handlers.push(() => window.removeEventListener("scroll", onScroll));
        onScroll();
      } else if (type === "exit_intent") {
        const onLeave = (e: MouseEvent) => { if (e.clientY <= 0) arm(p.id); };
        document.addEventListener("mouseout", onLeave);
        handlers.push(() => document.removeEventListener("mouseout", onLeave));
      } else if (type === "click") {
        const sel = (p.trigger_value || "").trim();
        if (!sel) continue;
        const onClick = (e: Event) => {
          const target = e.target as Element | null;
          if (target && target.closest && target.closest(sel)) arm(p.id);
        };
        document.addEventListener("click", onClick, true);
        handlers.push(() => document.removeEventListener("click", onClick, true));
      } else if (type === "category") {
        const ids = p.trigger_category_ids || [];
        if (!ids.length) continue;
        const onCat = (e: Event) => {
          const id = (e as CustomEvent<{ id: string }>).detail?.id;
          if (id && ids.includes(id)) arm(p.id);
        };
        window.addEventListener("tmm:category-enter", onCat as EventListener);
        handlers.push(() => window.removeEventListener("tmm:category-enter", onCat as EventListener));
      }
    }
    return () => { handlers.forEach((fn) => fn()); timersRef.current.forEach((t) => clearTimeout(t)); };
  }, [popups, location.pathname, dismissed]);

  const visibleList = useMemo(
    () => popups.filter((p) => !dismissed.has(p.id) && armed.has(p.id)),
    [popups, dismissed, armed]
  );
  const safeIdx = visibleList.length ? idx % visibleList.length : 0;
  const visible = visibleList[safeIdx];

  function dismiss(id: string) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try { sessionStorage.setItem("popup-dismissed", JSON.stringify([...next])); } catch { /* noop */ }
  }

  useEffect(() => {
    if (!visible || !visible.auto_close_seconds) return;
    const t = setTimeout(() => dismiss(visible.id), visible.auto_close_seconds * 1000);
    return () => clearTimeout(t);
  }, [visible?.id]);

  useEffect(() => {
    if (visibleList.length < 2) return;
    const sec = visible?.rotate_seconds || 6;
    const t = setInterval(() => setIdx((i) => (i + 1) % visibleList.length), sec * 1000);
    return () => clearInterval(t);
  }, [visibleList.length, visible?.rotate_seconds]);

  if (!visible) return null;

  const claim = () => {
    if (visible.cta_url) {
      if (visible.cta_url.startsWith("/")) {
        window.history.pushState({}, "", visible.cta_url);
        window.dispatchEvent(new PopStateEvent("popstate"));
      } else {
        window.open(visible.cta_url, "_blank");
      }
    }
    dismiss(visible.id);
  };

  return (
    <div
      dir="rtl"
      className={`fixed inset-0 z-[100] flex p-4 backdrop-blur-sm ${POSITION_CLASS[visible.position || "center"]}`}
      style={{ backgroundColor: `rgba(0,0,0,${visible.overlay_opacity ?? 0.5})` }}
      onClick={() => dismiss(visible.id)}
    >
      <PopupCard
        popup={visible}
        onClose={() => dismiss(visible.id)}
        onCta={claim}
        count={visibleList.length}
        idx={safeIdx}
        onPrev={() => setIdx((i) => (i - 1 + visibleList.length) % visibleList.length)}
        onNext={() => setIdx((i) => (i + 1) % visibleList.length)}
      />
    </div>
  );
}

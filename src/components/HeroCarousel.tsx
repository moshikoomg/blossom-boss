import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { PLATFORM_TEMPLATE_STORE_ID } from "@/lib/platform-template";
import { getStorefrontUrlSignature, isLazyPreviewMode } from "@/lib/preview-mode";

export type HeroSlide = {
  id: string;
  title: string;
  subtitle: string;
  media_url: string;
  media_type: "image" | "video" | string;
  bg_color: string;
  text_color: string;
  cta_label: string;
  cta_url: string;
  coupon_code: string;
  autoplay_seconds: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  /**
   * Visual layout of the slide. Optional — falls back to "overlay" when
   * the DB column is not present.
   *   - "overlay"      : text on top of the background media (default)
   *   - "split-right"  : media on the right, text on the left (desktop);
   *                      stacks vertically on mobile (media above text)
   *   - "split-left"   : media on the left, text on the right (desktop);
   *                      stacks vertically on mobile (media above text)
   */
  layout?: "overlay" | "split-right" | "split-left";
};

export function HeroCarousel({ fallback }: { fallback?: React.ReactNode } = {}) {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const urlSignature = getStorefrontUrlSignature();

  useEffect(() => {
    (async () => {
      const now = new Date().toISOString();
      setSlides([]);
      const isPreview = isLazyPreviewMode();
      let q: any = (supabase as any).from("hero_slides").select("*").eq("active", true);
      if (isPreview) q = q.eq("store_id", PLATFORM_TEMPLATE_STORE_ID);
      const { data } = await q.order("display_order");
      const list = ((data || []) as HeroSlide[]).filter((s) => (!s.starts_at || s.starts_at <= now) && (!s.ends_at || s.ends_at >= now));
      setSlides(list);
      setIdx(0);
    })();
  }, [urlSignature]);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const sec = slides[idx]?.autoplay_seconds || 6;
    const t = setTimeout(() => setIdx((i) => (i + 1) % slides.length), sec * 1000);
    return () => clearTimeout(t);
  }, [idx, paused, slides]);

  // Static rule: only render when there is at least one real slide.
  // No fallback placeholders, no default gradient hero — keep the page clean.
  if (!slides.length) return fallback ? <>{fallback}</> : null;

  const go = (n: number) => setIdx(((n % slides.length) + slides.length) % slides.length);
  const next = () => go(idx + 1);
  const prev = () => go(idx - 1);

  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) > 40) (dx > 0 ? next : prev)(); // RTL: swipe right = next slide
    startX.current = null;
  };

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(true); toast.success(`קוד ${code} הועתק`); setTimeout(() => setCopied(false), 1600); }
    catch { toast.error("לא הצלחנו להעתיק"); }
  };

  return (
    <section
      className="relative rounded-3xl overflow-hidden shadow-[var(--shadow-soft)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={() => slides.length > 1 && next()}
    >
      <div ref={trackRef} className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(${idx * 100}%)` /* RTL: positive moves to next */ }}>
        {slides.map((s) => {
          const layout = s.layout || "overlay";
          const isSplit = layout === "split-right" || layout === "split-left";
          const hasMedia = !!s.media_url;

          const media = hasMedia ? (
            s.media_type === "video" ? (
              <video src={s.media_url} autoPlay loop muted playsInline
                className={isSplit ? "w-full h-full object-cover" : "absolute inset-0 w-full h-full object-cover opacity-70"}/>
            ) : (
              <img src={s.media_url} alt="" width={1600} height={600} fetchPriority="high" decoding="async"
                className={isSplit ? "w-full h-full object-cover" : "absolute inset-0 w-full h-full object-cover opacity-70"}/>
            )
          ) : null;

          const textBlock = (
            <div className="flex flex-col justify-center p-6 md:p-10 min-h-[180px] md:min-h-[220px]">
              {s.title && <h2 className="text-2xl md:text-4xl font-bold mb-1 tracking-tight">{s.title}</h2>}
              {s.subtitle && <p className="text-sm md:text-lg opacity-90 font-light">{s.subtitle}</p>}
              <div className="flex flex-wrap gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                {s.coupon_code && (
                  <button onClick={() => copy(s.coupon_code)} className="inline-flex items-center gap-2 bg-white/95 text-foreground font-bold px-4 py-2 rounded-full text-sm shadow hover:bg-white transition">
                    {copied ? <Check size={14}/> : <Copy size={14}/>}
                    קוד: <span className="font-mono">{s.coupon_code}</span>
                  </button>
                )}
                {s.cta_label && (
                  <a href={s.cta_url || "#"} onClick={(e) => { if (s.cta_url?.startsWith("/")) { e.preventDefault(); window.history.pushState({}, "", s.cta_url); window.dispatchEvent(new PopStateEvent("popstate")); } }}
                    className="inline-block bg-primary text-primary-foreground font-bold px-4 py-2 rounded-full text-sm shadow hover:opacity-90 transition">
                    {s.cta_label}
                  </a>
                )}
              </div>
            </div>
          );

          if (isSplit && hasMedia) {
            // RTL note: in our RTL section, the first grid column is the rightmost.
            // "split-right" => media on the right => media is first child.
            // "split-left"  => media on the left  => media is second child.
            const mediaFirst = layout === "split-right";
            return (
              <div key={s.id} className="min-w-full" style={{ background: s.bg_color || "var(--gradient-hero)", color: s.text_color || "#fff" }}>
                <div className="grid grid-cols-1 md:grid-cols-2 min-h-[180px] md:min-h-[260px]">
                  {mediaFirst ? (
                    <>
                      <div className="aspect-square md:aspect-auto md:h-full bg-black/10 overflow-hidden">{media}</div>
                      {textBlock}
                    </>
                  ) : (
                    <>
                      {/* On mobile we still want the image on top — order via Tailwind. */}
                      <div className="aspect-square md:aspect-auto md:h-full bg-black/10 overflow-hidden order-first md:order-last">{media}</div>
                      {textBlock}
                    </>
                  )}
                </div>
              </div>
            );
          }

          // Default: overlay
          return (
            <div key={s.id} className="min-w-full relative" style={{ background: s.bg_color || "var(--gradient-hero)", color: s.text_color || "#fff" }}>
              {media}
              <div className="relative" style={{ background: hasMedia ? "linear-gradient(135deg, rgba(0,0,0,0.45), rgba(0,0,0,0.15))" : "transparent" }}>
                {textBlock}
              </div>
            </div>
          );
        })}
      </div>
      {slides.length > 1 && (
        <>
          <button aria-label="שקופית קודמת" onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1.5"><ChevronRight size={16}/></button>
          <button aria-label="שקופית הבאה" onClick={(e) => { e.stopPropagation(); next(); }} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white rounded-full p-1.5"><ChevronLeft size={16}/></button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {slides.map((_, i) => (
              <button key={i} aria-label={`עבור לשקופית ${i + 1}`} onClick={(e) => { e.stopPropagation(); go(i); }} className={`h-1.5 rounded-full transition-all ${i === idx ? "bg-white w-6" : "bg-white/50 w-1.5"}`}/>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

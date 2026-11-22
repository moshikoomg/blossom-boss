import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  if (images.length === 0) return null;
  const safe = (n: number) => (n + images.length) % images.length;
  const goTo = (n: number) => {
    const next = safe(n);
    setI(next);
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || images.length < 2) return;
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (idx !== i) setI(safe(idx));
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-square rounded-3xl overflow-hidden bg-muted shadow-[var(--shadow-card)] group">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {images.map((src, k) => (
            <div key={src + k} className="relative flex-shrink-0 w-full h-full snap-center snap-always">
              <img
                src={src}
                alt={alt}
                width={800}
                height={800}
                fetchPriority={k === 0 ? "high" : "auto"}
                loading={k === 0 ? "eager" : "lazy"}
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <>
            <button onClick={() => goTo(i-1)} aria-label="קודם" className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-card/90 hover:bg-card text-foreground p-2 rounded-full shadow opacity-0 group-hover:opacity-100 transition">
              <ChevronRight size={18}/>
            </button>
            <button onClick={() => goTo(i+1)} aria-label="הבא" className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-card/90 hover:bg-card text-foreground p-2 rounded-full shadow opacity-0 group-hover:opacity-100 transition">
              <ChevronLeft size={18}/>
            </button>
            <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 z-10 pointer-events-none">
              {images.map((_, k) => (
                <span key={k} aria-hidden
                  className={`h-1.5 rounded-full transition-all ${k===i ? "bg-primary w-6" : "bg-white/70 w-1.5"}`}/>
              ))}
            </div>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((u, k) => (
            <button key={u+k} onClick={() => goTo(k)} className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition ${k===i ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}>
              <img src={u} alt="" width={64} height={64} loading="lazy" decoding="async" className="w-full h-full object-cover"/>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

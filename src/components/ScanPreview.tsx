import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock,
  Gift,
  Globe,
  Loader2,
  Package,
  Phone,
  Sparkles,
  Tag,
} from "lucide-react";
import type { ScanRow } from "@/lib/scan.functions";

/**
 * Premium SaaS preview of the scanned business.
 * Mobile-first card layout, RTL, with rich rendering of products, price
 * variations, add-ons, working hours and contact info. Renders fully
 * even when most fields are missing — every section is opt-in.
 */
export function ScanPreview({
  scan,
  sourceUrl,
  submitting,
  error,
  onBuild,
  onBack,
}: {
  scan: ScanRow;
  sourceUrl: string;
  submitting: boolean;
  error: string | null;
  onBuild: () => void;
  onBack: () => void;
}) {
  const name = scan.discovered_business_name?.trim() || "החנות שלך";
  const phone = scan.discovered_phone?.trim() || null;
  const logo = scan.discovered_logo_url?.trim() || null;
  const products = (scan.discovered_products ?? []).filter((p) => p?.name);
  const categories = scan.discovered_categories ?? [];
  const addons = scan.discovered_addons ?? [];
  const hours = scan.discovered_working_hours ?? [];
  const palette = scan.discovered_palette ?? {};

  const productCount = products.length;

  return (
    <div dir="rtl" className="min-h-screen bg-[oklch(0.16_0.04_265)] text-white">
      {/* Top app bar */}
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-[oklch(0.16_0.04_265)]/85 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            disabled={submitting}
            className="inline-flex items-center gap-1 text-xs font-bold text-white/70 hover:text-white disabled:opacity-50"
          >
            <ArrowLeft size={14} /> חזרה
          </button>
          <div className="hidden sm:inline-flex items-center gap-2 px-3 h-7 rounded-full bg-white/10 text-[11px] font-bold">
            <Sparkles size={12} /> תצוגה מקדימה של הסריקה
          </div>
          <div className="flex-1" />
          <button
            onClick={onBuild}
            disabled={submitting}
            className="hidden sm:inline-flex items-center gap-2 h-10 px-5 rounded-xl font-black text-sm bg-white text-[oklch(0.2_0.04_265)] shadow-lg hover:scale-[1.02] transition disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {submitting ? "מקים את החנות…" : "בנה את החנות שלי"}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-32 space-y-6">
        {/* Hero card */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-5 sm:p-7">
          <div
            className="absolute -top-24 -left-24 w-72 h-72 rounded-full blur-3xl opacity-50 pointer-events-none"
            style={{ background: palette.primary || "oklch(0.65 0.22 300)" }}
          />
          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 border border-white/15 grid place-items-center overflow-hidden flex-shrink-0">
              {logo ? (
                <img src={logo} alt={name} className="w-full h-full object-cover" />
              ) : (
                <Sparkles size={28} className="text-white/70" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-white/60 mb-1">סיימנו לסרוק את האתר שלך</div>
              <h1 className="text-2xl sm:text-3xl font-black leading-tight truncate">{name}</h1>
              {sourceUrl && (
                <a
                  href={normalizeHref(sourceUrl)}
                  target="_blank"
                  rel="noreferrer"
                  dir="ltr"
                  className="inline-flex items-center gap-1 mt-1 text-xs text-white/55 hover:text-white truncate"
                >
                  <Globe size={12} /> {sourceUrl}
                </a>
              )}
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-2 sm:gap-3">
            <Stat icon={<Package size={14} />} label="מוצרים" value={String(productCount)} />
            <Stat icon={<Tag size={14} />} label="קטגוריות" value={String(categories.length)} />
            <Stat icon={<Gift size={14} />} label="תוספות" value={String(addons.length)} />
          </div>

          {(phone || hours.length > 0) && (
            <div className="relative mt-4 grid sm:grid-cols-2 gap-2">
              {phone && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-xs">
                  <Phone size={14} className="text-white/60" />
                  <span dir="ltr" className="font-bold">{phone}</span>
                </div>
              )}
              {hours.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-xs">
                  <Clock size={14} className="text-white/60" />
                  <span className="font-bold">{hours.length} ימי פעילות</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Categories chips */}
        {categories.length > 0 && (
          <section>
            <SectionHeader title="קטגוריות שזיהינו" count={categories.length} />
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <span
                  key={c}
                  className="px-3 py-1.5 rounded-full text-xs font-bold bg-white/[0.06] border border-white/10"
                >
                  {c}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Products */}
        <section>
          <SectionHeader title="המוצרים שלך" count={productCount} />
          {productCount === 0 ? (
            <EmptyState
              icon={<Package size={20} />}
              title="לא זוהו מוצרים אוטומטית"
              hint="זה בסדר — אפשר להוסיף מוצרים ידנית מהדאשבורד אחרי שנקים את החנות."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {products.slice(0, 24).map((p, i) => (
                <ProductCard key={(p.name || "p") + i} p={p} />
              ))}
            </div>
          )}
        </section>

        {/* Add-ons */}
        {addons.length > 0 && (
          <section>
            <SectionHeader title="תוספות ושדרוגים" count={addons.length} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {addons.slice(0, 16).map((a, i) => (
                <div
                  key={(a.name || "a") + i}
                  className="rounded-2xl bg-white/[0.05] border border-white/10 overflow-hidden"
                >
                  {a.image_url ? (
                    <div className="aspect-square bg-white/5 overflow-hidden">
                      <img src={a.image_url} alt={a.name} loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-square bg-gradient-to-br from-white/10 to-white/5 grid place-items-center text-white/40">
                      <Gift size={22} />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="font-bold text-xs truncate">{a.name}</div>
                    {a.price !== undefined && a.price !== null && a.price !== "" && (
                      <div className="text-[11px] text-white/60 mt-0.5">{formatPrice(a.price)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Working hours */}
        {hours.length > 0 && (
          <section>
            <SectionHeader title="שעות פעילות" count={hours.length} />
            <div className="rounded-2xl bg-white/[0.05] border border-white/10 overflow-hidden">
              {hours.map((h, i) => (
                <div
                  key={(h.day || "d") + i}
                  className={`flex items-center justify-between px-4 py-3 text-sm ${
                    i > 0 ? "border-t border-white/5" : ""
                  }`}
                >
                  <span className="font-bold">{h.day}</span>
                  <span className={`text-xs ${h.closed ? "text-white/40" : "text-white/80"}`} dir="ltr">
                    {h.closed ? "סגור" : `${h.open ?? ""}${h.close ? ` – ${h.close}` : ""}`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-400/30 text-red-200 text-sm font-medium px-4 py-3">
            {error}
          </div>
        )}
      </main>

      {/* Sticky mobile CTA */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 p-4 bg-gradient-to-t from-[oklch(0.16_0.04_265)] via-[oklch(0.16_0.04_265)]/95 to-transparent">
        <button
          onClick={onBuild}
          disabled={submitting}
          className="w-full h-14 rounded-2xl font-black text-base bg-white text-[oklch(0.2_0.04_265)] shadow-xl hover:scale-[1.01] transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            <><Loader2 size={18} className="animate-spin" /> מקים את החנות…</>
          ) : (
            <><Check size={18} /> בנה את החנות שלי</>
          )}
        </button>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.05] border border-white/10 px-3 py-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-white/60 text-[10px] font-bold mb-1">
        {icon} {label}
      </div>
      <div className="text-xl sm:text-2xl font-black">{value}</div>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-base sm:text-lg font-black">{title}</h2>
      {count !== undefined && (
        <span className="text-[11px] font-bold text-white/50">{count}</span>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-center">
      <div className="mx-auto w-10 h-10 rounded-xl bg-white/5 grid place-items-center text-white/50 mb-2">
        {icon}
      </div>
      <div className="font-bold text-sm">{title}</div>
      <div className="text-xs text-white/55 mt-1 max-w-sm mx-auto">{hint}</div>
    </div>
  );
}

function ProductCard({ p }: { p: import("@/lib/scan.functions").DiscoveredProduct }) {
  const images = useMemo(() => {
    const list: string[] = [];
    if (p.image_url) list.push(p.image_url);
    for (const u of p.images ?? []) {
      if (u && !list.includes(u)) list.push(u);
    }
    return list;
  }, [p]);
  const [idx, setIdx] = useState(0);
  const cur = images[Math.min(idx, images.length - 1)];
  const variations = p.price_variations ?? [];
  const addons = p.addons ?? [];

  return (
    <article className="rounded-2xl bg-white/[0.05] border border-white/10 overflow-hidden flex flex-col">
      <div className="aspect-square bg-white/5 relative">
        {cur ? (
          <img src={cur} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-white/40">
            <Package size={28} />
          </div>
        )}
        {images.length > 1 && (
          <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1">
            {images.map((_, i) => (
              <button
                key={i}
                aria-label={`תמונה ${i + 1}`}
                onClick={() => setIdx(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "bg-white w-5" : "bg-white/40 w-1.5 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
        )}
        {p.category && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/50 backdrop-blur border border-white/15">
            {p.category}
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="font-black text-sm leading-snug line-clamp-2">{p.name}</div>
        {p.description && (
          <p className="text-[11px] text-white/55 leading-relaxed line-clamp-2">{p.description}</p>
        )}
        {variations.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-auto">
            {variations.slice(0, 4).map((v, i) => (
              <span
                key={(v.label || "v") + i}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-[10px] font-bold"
              >
                <span className="opacity-70">{v.label}</span>
                <span>{formatPrice(v.price)}</span>
              </span>
            ))}
          </div>
        ) : (
          p.price !== undefined && p.price !== null && p.price !== "" && (
            <div className="mt-auto font-black text-sm">{formatPrice(p.price)}</div>
          )
        )}
        {addons.length > 0 && (
          <div className="text-[10px] text-white/50 font-bold flex items-center gap-1">
            <Gift size={11} /> {addons.length} תוספות זמינות
          </div>
        )}
      </div>
    </article>
  );
}

function formatPrice(p: number | string | null | undefined): string {
  if (p === null || p === undefined || p === "") return "";
  const n = typeof p === "number" ? p : Number(String(p).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return String(p);
  return `₪${n.toLocaleString("he-IL")}`;
}

function normalizeHref(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u.replace(/^\/+/, "")}`;
}

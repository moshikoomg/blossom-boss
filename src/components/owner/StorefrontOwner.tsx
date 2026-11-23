import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  ImagePlus,
  LayoutDashboard,
  Loader2,
  Palette,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { applyThemeColors } from "@/lib/theme-loader";
import { toWebp } from "@/lib/to-webp";
import { COLORS, LayoutSketch, type StorefrontLayout } from "@/components/OnboardingWizard";
import { SETUP_STEPS, stepIndex, type SetupStep } from "@/lib/owner-setup";

// Owner tools on the storefront: a top bar (setup steps, back to the admin,
// customer view), click-to-edit texts, a style panel and quick product
// upload. Customers never see any of this.

export type OwnerPanel = "style" | "products" | null;

/* ------------------------------------------------------------------ */
/*  Top bar in edit mode                                               */
/* ------------------------------------------------------------------ */
export function OwnerBar({
  step,
  panel,
  onPanel,
  onView,
}: {
  step: SetupStep;
  panel: OwnerPanel;
  onPanel: (p: OwnerPanel) => void;
  onView: () => void;
}) {
  const current = stepIndex(step);
  const go = (id: string) => {
    if (id === "tour") window.location.href = "/admin?tour=1";
    if (id === "front") onPanel(panel === "style" ? null : "style");
    if (id === "products") onPanel(panel === "products" ? null : "products");
  };
  const btn =
    "h-9 px-3 rounded-full text-[13px] font-bold inline-flex items-center gap-1.5 transition whitespace-nowrap";
  return (
    <div
      dir="rtl"
      role="toolbar"
      aria-label="כלי עריכה של בעל החנות"
      className="fixed top-0 inset-x-0 z-[56] h-12 bg-foreground text-background px-2 sm:px-4 flex items-center gap-2 shadow-lg"
    >
      <span className="hidden md:inline-flex items-center gap-1.5 text-[13px] font-bold shrink-0">
        <Pencil size={15} aria-hidden /> מצב עריכה
      </span>
      <nav
        aria-label="שלבי ההקמה"
        className="flex-1 min-w-0 flex items-center justify-center gap-1 overflow-x-auto scrollbar-hide"
      >
        {step === "done" ? (
          <>
            <button
              onClick={() => go("front")}
              aria-pressed={panel === "style"}
              className={`${btn} ${panel === "style" ? "bg-background text-foreground" : "hover:bg-background/15"}`}
            >
              <Palette size={15} aria-hidden /> עיצוב
            </button>
            <button
              onClick={() => go("products")}
              aria-pressed={panel === "products"}
              className={`${btn} ${panel === "products" ? "bg-background text-foreground" : "hover:bg-background/15"}`}
            >
              <Plus size={15} aria-hidden /> הוספת מוצרים
            </button>
          </>
        ) : (
          SETUP_STEPS.map((s, n) => {
            const done = n < current;
            const active = n === current;
            const open =
              (s.id === "front" && panel === "style") ||
              (s.id === "products" && panel === "products");
            return (
              <button
                key={s.id}
                onClick={() => go(s.id)}
                aria-current={active ? "step" : undefined}
                className={`${btn} ${open || active ? "bg-background text-foreground" : done ? "text-background/80 hover:bg-background/15" : "text-background/55 hover:bg-background/15"}`}
              >
                <span
                  className={`w-5 h-5 rounded-full grid place-items-center text-[11px] ${done ? "bg-primary text-primary-foreground" : active || open ? "bg-foreground text-background" : "border border-current"}`}
                >
                  {done ? <Check size={12} aria-hidden /> : n + 1}
                </span>
                <span className={active || open ? "" : "hidden sm:inline"}>{s.label}</span>
              </button>
            );
          })
        )}
      </nav>
      <a href="/admin" className={`${btn} hover:bg-background/15 shrink-0`} title="חזרה ללוח הבקרה">
        <LayoutDashboard size={16} aria-hidden /> <span className="hidden sm:inline">לוח בקרה</span>
      </a>
      <button
        onClick={onView}
        className={`${btn} bg-background text-foreground hover:opacity-90 shrink-0`}
        title="לראות את החנות בדיוק כמו הלקוחות"
      >
        <Eye size={16} aria-hidden /> <span className="hidden sm:inline">תצוגת לקוח</span>
        <span className="sm:hidden">לקוח</span>
      </button>
    </div>
  );
}

/** Small pill in customer view, so the owner can always get back. */
export function OwnerViewPill({ onEdit }: { onEdit: () => void }) {
  return (
    <div
      dir="rtl"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[45] flex items-center gap-1 bg-foreground text-background rounded-full shadow-2xl p-1 text-[13px] font-bold"
    >
      <span className="px-3 hidden sm:inline-flex items-center gap-1.5 text-background/75">
        <Eye size={15} aria-hidden /> תצוגת לקוח
      </span>
      <button
        onClick={onEdit}
        className="h-10 px-4 rounded-full bg-background text-foreground inline-flex items-center gap-1.5 hover:opacity-90"
      >
        <Pencil size={15} aria-hidden /> חזרה לעריכה
      </button>
      <a
        href="/admin"
        className="h-10 px-3 rounded-full inline-flex items-center gap-1.5 hover:bg-background/15"
        aria-label="לוח בקרה"
      >
        <LayoutDashboard size={16} aria-hidden />
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Click-to-edit text                                                 */
/* ------------------------------------------------------------------ */
export function EditableText({
  editing,
  value,
  placeholder,
  label,
  onSave,
  className = "",
  as: Tag = "span",
}: {
  editing: boolean;
  value: string;
  placeholder: string;
  label: string;
  onSave: (v: string) => Promise<boolean>;
  className?: string;
  as?: "span" | "h1" | "p";
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (open) ref.current?.select();
  }, [open]);

  if (!editing) return <Tag className={className}>{value}</Tag>;

  async function commit() {
    const v = draft.trim();
    if (v === value.trim()) return setOpen(false);
    setBusy(true);
    const ok = await onSave(v);
    setBusy(false);
    if (ok) setOpen(false);
  }

  if (open) {
    return (
      <span className="flex items-center gap-1 min-w-0">
        <input
          ref={ref}
          value={draft}
          aria-label={label}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") {
              setDraft(value);
              setOpen(false);
            }
          }}
          onBlur={() => void commit()}
          className="min-w-0 w-full max-w-xs bg-background border-2 border-primary rounded-lg px-2 py-0.5 text-sm font-semibold outline-none"
        />
        {busy && <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={`לחצו לשינוי ${label}`}
      aria-label={`שינוי ${label}: ${value || placeholder}`}
      className="group relative block max-w-full text-right rounded-md outline-2 outline-dashed outline-primary/40 outline-offset-2 hover:outline-primary hover:bg-primary/5 transition"
    >
      <Tag className={`${className} ${value ? "" : "text-muted-foreground italic"}`}>
        {value || placeholder}
      </Tag>
      <span
        className="absolute -top-2.5 -left-2.5 w-5 h-5 rounded-full bg-primary text-primary-foreground grid place-items-center shadow md:opacity-0 md:group-hover:opacity-100 transition"
        aria-hidden
      >
        <Pencil size={11} />
      </span>
    </button>
  );
}

/** Logo that the owner can replace with a click in edit mode. */
export function EditableLogo({
  editing,
  src,
  alt,
}: {
  editing: boolean;
  src: string;
  alt: string;
}) {
  const { store, refresh } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const img = (
    <img
      src={src}
      alt={alt}
      className="w-10 h-10 rounded-2xl object-contain bg-primary/5 shrink-0"
    />
  );
  if (!editing || !store) return img;
  async function pick(file: File) {
    if (!store) return;
    if (!file.type.startsWith("image/")) return toast.error("נא לבחור תמונה");
    setBusy(true);
    try {
      const url = await uploadImage(file, store.id, "store-assets");
      const { error } = await supabase.from("stores").update({ logo_url: url }).eq("id", store.id);
      if (error) throw error;
      await refresh();
      toast.success("הלוגו הוחלף");
    } catch {
      toast.error("הלוגו לא עלה. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      title="לחצו להחלפת הלוגו"
      aria-label="החלפת הלוגו"
      className="group relative shrink-0 rounded-2xl outline-2 outline-dashed outline-primary/40 outline-offset-2 hover:outline-primary"
    >
      {img}
      <span className="absolute inset-0 rounded-2xl bg-black/45 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition">
        {busy ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : (
          <ImagePlus size={16} aria-hidden />
        )}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = "";
        }}
      />
    </button>
  );
}

async function uploadImage(file: File, storeId: string, bucket: "product-images" | "store-assets") {
  const up = await toWebp(file);
  const ext = up.name.split(".").pop() || "jpg";
  const path = `${storeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, up, { upsert: false, contentType: up.type });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/* ------------------------------------------------------------------ */
/*  Side panel shell                                                   */
/* ------------------------------------------------------------------ */
function Panel({
  title,
  hint,
  onClose,
  children,
  footer,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside
      dir="rtl"
      role="dialog"
      aria-label={title}
      className="fixed z-[55] bg-card border-border shadow-2xl flex flex-col animate-in duration-300
        inset-x-0 bottom-0 max-h-[62vh] rounded-t-3xl border-t slide-in-from-bottom-6
        md:inset-x-auto md:left-0 md:top-12 md:bottom-0 md:max-h-none md:w-[23rem] md:rounded-none md:border-t-0 md:border-r md:slide-in-from-left-6"
    >
      <header className="flex items-start gap-3 p-5 pb-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black">{title}</h2>
          {hint && <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label="סגירה"
          className="p-2 -m-1 rounded-full hover:bg-muted text-muted-foreground"
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-6">{children}</div>
      {footer && (
        <footer className="p-4 border-t border-border bg-card pb-[max(1rem,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Style panel (step 2)                                               */
/* ------------------------------------------------------------------ */
const LAYOUTS: { id: StorefrontLayout; title: string }[] = [
  { id: "gallery", title: "גלריה" },
  { id: "shelves", title: "מדפים" },
  { id: "side", title: "תפריט צד" },
];
const PALETTE = [
  ...COLORS,
  { id: "lavender", label: "לבנדר", primary: "#7b5ea7", accent: "#e6dcf3" },
  { id: "peach", label: "אפרסק", primary: "#d9683f", accent: "#fbdccd" },
  { id: "sky", label: "תכלת", primary: "#2f6f9f", accent: "#d3e6f3" },
];

export function StylePanel({
  layout,
  onLayout,
  isSetup,
  onApprove,
  onClose,
}: {
  layout: StorefrontLayout;
  onLayout: (l: StorefrontLayout) => void;
  isSetup: boolean;
  onApprove: () => void;
  onClose: () => void;
}) {
  const { store, refresh } = useStore();
  const currentPrimary = (store?.theme?.primary || "").toLowerCase();

  async function pickColor(c: (typeof PALETTE)[number]) {
    if (!store) return;
    const theme = {
      ...(store.theme || {}),
      primary: c.primary,
      accent: c.accent,
      secondary: c.accent,
    };
    applyThemeColors(theme);
    const { error } = await supabase
      .from("stores")
      .update({ theme: theme as never })
      .eq("id", store.id);
    if (error) return toast.error("הצבע לא נשמר. נסו שוב.");
    await refresh();
  }

  return (
    <Panel
      title="עיצוב החזית"
      hint="לחצו על שם החנות, על השורה שמתחתיו או על הלוגו כדי לשנות אותם. כל שינוי נשמר מיד."
      onClose={onClose}
      footer={
        isSetup ? (
          <button
            onClick={onApprove}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2 hover:opacity-90"
          >
            <Check size={18} aria-hidden /> אישור החזית, ממשיכים למוצרים
          </button>
        ) : (
          <button
            onClick={onClose}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90"
          >
            סיום
          </button>
        )
      }
    >
      <section>
        <h3 className="font-bold text-sm mb-2.5">סגנון תצוגה</h3>
        <div className="grid grid-cols-3 gap-2">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              onClick={() => onLayout(l.id)}
              aria-pressed={layout === l.id}
              className={`rounded-2xl border-2 p-2 flex flex-col items-center gap-1.5 text-xs font-bold transition ${layout === l.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            >
              <LayoutSketch id={l.id} />
              {l.title}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="font-bold text-sm mb-2.5">צבע</h3>
        <div className="grid grid-cols-3 gap-2">
          {PALETTE.map((c) => {
            const on = currentPrimary === c.primary.toLowerCase();
            return (
              <button
                key={c.id}
                onClick={() => void pickColor(c)}
                aria-pressed={on}
                className={`rounded-2xl border-2 p-2.5 flex flex-col items-center gap-1.5 text-xs font-bold transition ${on ? "border-primary" : "border-border hover:border-primary/40"}`}
              >
                <span className="flex -space-x-1.5 space-x-reverse" aria-hidden>
                  <span
                    className="w-6 h-6 rounded-full border-2 border-card"
                    style={{ background: c.primary }}
                  />
                  <span
                    className="w-6 h-6 rounded-full border-2 border-card"
                    style={{ background: c.accent }}
                  />
                </span>
                {c.label}
              </button>
            );
          })}
        </div>
      </section>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick product upload (step 3)                                      */
/* ------------------------------------------------------------------ */
type Draft = {
  key: string;
  preview: string;
  url: string | null;
  failed?: boolean;
  name: string;
  price: string;
  cat: string;
};

export function ProductsPanel({
  storeId,
  categories,
  firstProducts,
  isSetup,
  onSaved,
  onFinishSetup,
  onView,
  onClose,
}: {
  storeId: string;
  categories: { id: string; name: string }[];
  firstProducts: boolean;
  isSetup: boolean;
  onSaved: () => void;
  onFinishSetup: () => void;
  onView: () => void;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 20);
    if (!list.length) return toast.error("נא לבחור תמונות");
    for (const f of list) {
      const key = Math.random().toString(36).slice(2);
      setDrafts((ds) => [
        ...ds,
        {
          key,
          preview: URL.createObjectURL(f),
          url: null,
          name: "",
          price: "",
          cat: categories[0]?.id ?? "",
        },
      ]);
      uploadImage(f, storeId, "product-images")
        .then((url) => patch(key, { url }))
        .catch(() => patch(key, { failed: true }));
    }
  }

  const ready =
    drafts.length > 0 && drafts.every((d) => d.url && d.name.trim() && Number(d.price) > 0);
  const missing = drafts.filter((d) => !d.name.trim() || !(Number(d.price) > 0)).length;

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId);
    const base = count ?? 0;
    const rows = drafts.map((d, i) => ({
      store_id: storeId,
      name: d.name.trim(),
      price: Number(d.price),
      image_url: d.url as string,
      category_id: d.cat || null,
      stock: 100,
      active: true,
      display_order: base + i,
      description: "",
    }));
    const { data, error } = await supabase.from("products").insert(rows).select("id,category_id");
    if (error || !data) {
      setSaving(false);
      return toast.error("המוצרים לא נשמרו. נסו שוב.");
    }
    await supabase
      .from("product_images")
      .insert(
        data.map((r, i) => ({ product_id: r.id, image_url: rows[i].image_url, display_order: 0 })),
      );
    const links = data
      .filter((r) => r.category_id)
      .map((r) => ({ product_id: r.id, category_id: r.category_id as string }));
    if (links.length) await supabase.from("product_categories").insert(links);
    setSaving(false);
    setDrafts([]);
    onSaved();
    if (firstProducts) toast.success("המוצרים על המדף! פריטי הדוגמה הוסרו מהחנות.");
    else toast.success(rows.length === 1 ? "המוצר על המדף" : `${rows.length} מוצרים על המדף`);
    if (isSetup) {
      onFinishSetup();
      setCelebrate(true);
    }
  }

  if (celebrate) {
    return (
      <Panel title="החנות מוכנה! 🎉" onClose={onClose}>
        <p className="text-[15px] text-muted-foreground leading-relaxed">
          המוצרים שלך על המדף ופריטי הדוגמה ירדו. מכאן אפשר להמשיך להוסיף מוצרים, לראות את החנות כמו
          לקוח, או לחזור ללוח הבקרה.
        </p>
        <div className="grid gap-2">
          <button
            onClick={() => setCelebrate(false)}
            className="h-12 rounded-xl border border-border font-bold inline-flex items-center justify-center gap-2 hover:bg-muted"
          >
            <Plus size={18} aria-hidden /> להוסיף עוד מוצרים
          </button>
          <button
            onClick={onView}
            className="h-12 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2 hover:opacity-90"
          >
            <Eye size={18} aria-hidden /> לראות כמו לקוח
          </button>
          <a
            href="/admin"
            className="h-12 rounded-xl border border-border font-bold inline-flex items-center justify-center gap-2 hover:bg-muted"
          >
            <LayoutDashboard size={18} aria-hidden /> ללוח הבקרה
          </a>
        </div>
      </Panel>
    );
  }

  const field =
    "h-11 w-full rounded-xl border border-border bg-background px-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <Panel
      title="מוצרים למדפים"
      hint={
        firstProducts
          ? "בחרו תמונות של הזרים שלכם. לכל תמונה רושמים שם ומחיר. פריטי הדוגמה יורדו מעצמם."
          : "בחרו תמונות. לכל תמונה רושמים שם ומחיר."
      }
      onClose={onClose}
      footer={
        drafts.length > 0 ? (
          <button
            onClick={() => void save()}
            disabled={!ready || saving}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold inline-flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin" aria-hidden />
            ) : (
              <Upload size={18} aria-hidden />
            )}
            {ready
              ? `העלאה למדף (${drafts.length})`
              : drafts.some((d) => d.failed)
                ? "תמונה לא עלתה. מחקו אותה ונסו שוב"
                : missing
                  ? missing === 1
                    ? "חסר שם או מחיר במוצר אחד"
                    : `חסר שם או מחיר ב-${missing} מוצרים`
                  : "התמונות עולות…"}
          </button>
        ) : undefined
      }
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`w-full rounded-2xl border-2 border-dashed p-6 flex flex-col items-center gap-2 text-center transition ${dragOver ? "border-primary bg-primary/10" : "border-primary/40 bg-primary/5 hover:bg-primary/10"}`}
      >
        <ImagePlus size={30} className="text-primary" aria-hidden />
        <span className="font-bold">{drafts.length ? "עוד תמונות" : "בחירת תמונות"}</span>
        <span className="text-xs text-muted-foreground">מהטלפון או מהמחשב, אפשר כמה בבת אחת</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {drafts.length > 0 && (
        <ul className="space-y-3">
          {drafts.map((d, n) => (
            <li key={d.key} className="flex gap-3 rounded-2xl border border-border p-2.5">
              <div className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-muted">
                <img src={d.preview} alt="" className="w-full h-full object-cover" />
                {!d.url && !d.failed && (
                  <span className="absolute inset-0 bg-black/40 grid place-items-center text-white">
                    <Loader2 size={18} className="animate-spin" aria-label="מעלה" />
                  </span>
                )}
                {d.failed && (
                  <span className="absolute inset-0 bg-destructive/80 grid place-items-center text-white text-[11px] font-bold p-1 text-center">
                    לא עלתה
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  className={field}
                  placeholder="שם, למשל: זר ורדים"
                  aria-label={`שם מוצר ${n + 1}`}
                  value={d.name}
                  onChange={(e) => patch(d.key, { name: e.target.value })}
                  autoFocus={n === drafts.length - 1}
                />
                <div className="flex flex-wrap gap-2">
                  <div className="relative w-28 shrink-0">
                    <input
                      className={`${field} pl-7`}
                      placeholder="מחיר"
                      inputMode="decimal"
                      aria-label={`מחיר מוצר ${n + 1}`}
                      value={d.price}
                      onChange={(e) =>
                        patch(d.key, { price: e.target.value.replace(/[^\d.]/g, "") })
                      }
                    />
                    <span
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm"
                      aria-hidden
                    >
                      ₪
                    </span>
                  </div>
                  {categories.length > 0 && (
                    <select
                      className={`${field} min-w-0 flex-1 basis-32`}
                      aria-label={`קטגוריה למוצר ${n + 1}`}
                      value={d.cat}
                      onChange={(e) => patch(d.key, { cat: e.target.value })}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
                aria-label={`הסרת מוצר ${n + 1}`}
                className="self-start p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!firstProducts && drafts.length === 0 && (
        <a
          href="/admin?section=products"
          className="text-sm text-primary font-bold inline-flex items-center gap-1 hover:underline"
        >
          לעריכת מוצרים קיימים בלוח הבקרה <ArrowLeft size={14} aria-hidden />
        </a>
      )}
    </Panel>
  );
}

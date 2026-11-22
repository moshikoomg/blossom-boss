import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowRight, Plus, Trash2, Save, Loader2, Image as ImageIcon, ListChecks } from "lucide-react";
import { ImageUpload } from "@/lib/image-upload";
import { DEFAULT_LANDING, mergeLanding, type LandingContent } from "@/lib/landing-content";

export const Route = createFileRoute("/super-admin/landing")({
  head: () => ({ meta: [{ title: "תוכן דף הבית — Super Admin" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: LandingEditorGate,
});

function LandingEditorGate() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
        setAllowed(!!roles?.some((r) => r.role === "admin"));
      }
      setReady(true);
    })();
  }, []);
  if (!ready) return <div dir="rtl" className="min-h-screen grid place-items-center text-muted-foreground">טוען…</div>;
  if (!allowed) return (
    <div dir="rtl" className="min-h-screen grid place-items-center p-6">
      <div className="bg-card rounded-3xl p-8 border border-border max-w-md text-center">
        <h1 className="font-black text-xl mb-2">אין הרשאת מנהל פלטפורמה</h1>
        <Link to="/auth" className="text-sm underline">להתחברות</Link>
      </div>
    </div>
  );
  return <LandingEditor />;
}

function LandingEditor() {
  const [content, setContent] = useState<LandingContent>(DEFAULT_LANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("platform_content" as any).select("data").eq("key", "landing").maybeSingle();
      if (data && (data as any).data) setContent(mergeLanding((data as any).data));
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("platform_content" as any)
      .upsert({ key: "landing", data: content as any, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("נשמר! שינויים מופיעים מיידית בדף הבית.");
  }

  function resetSection<K extends keyof LandingContent>(k: K) {
    setContent((c) => ({ ...c, [k]: JSON.parse(JSON.stringify(DEFAULT_LANDING[k])) }));
  }

  if (loading) return <div dir="rtl" className="min-h-screen grid place-items-center text-muted-foreground"><Loader2 className="animate-spin"/></div>;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black">תוכן דף הבית</h1>
            <p className="text-xs text-muted-foreground">כל הטקסטים והתמונות שמופיעים במסך הכניסה</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/super-admin" className="text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted flex items-center gap-1"><ArrowRight size={14}/> חזרה</Link>
            <a href="/" target="_blank" rel="noopener" className="text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted">פתח בכרטיסייה חדשה</a>
            <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold flex items-center gap-1">
              {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} שמירה
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-5 pb-24">
        {/* HERO */}
        <Section title="Hero — חלק עליון" onReset={() => resetSection("hero")}>
          <Field label="תג קטן מעל הכותרת"><Input value={content.hero.badge} onChange={(v) => setContent({ ...content, hero: { ...content.hero, badge: v } })}/></Field>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="שורה 1 בכותרת"><Input value={content.hero.title1} onChange={(v) => setContent({ ...content, hero: { ...content.hero, title1: v } })}/></Field>
            <Field label="שורה 2 בכותרת (מודגשת)"><Input value={content.hero.title2} onChange={(v) => setContent({ ...content, hero: { ...content.hero, title2: v } })}/></Field>
          </div>
          <Field label="תיאור"><Textarea value={content.hero.lede} onChange={(v) => setContent({ ...content, hero: { ...content.hero, lede: v } })}/></Field>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="כפתור ראשי"><Input value={content.hero.ctaPrimary} onChange={(v) => setContent({ ...content, hero: { ...content.hero, ctaPrimary: v } })}/></Field>
            <Field label="כפתור משני"><Input value={content.hero.ctaSecondary} onChange={(v) => setContent({ ...content, hero: { ...content.hero, ctaSecondary: v } })}/></Field>
          </div>
          <div>
            <h3 className="text-sm font-bold mb-2 flex items-center gap-1"><ImageIcon size={14}/> 4 תמונות זרים</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {content.heroImages.map((url, i) => (
                <ImageUpload key={i} bucket="store-assets" label={`תמונה ${i + 1}`} value={url} onChange={(u) => {
                  const a = [...content.heroImages]; a[i] = u; setContent({ ...content, heroImages: a });
                }} />
              ))}
            </div>
          </div>
        </Section>

        {/* EXAMPLES */}
        <Section title="חנויות לדוגמה (קרוסלה)" onReset={() => resetSection("examples")}>
          <Field label="תג"><Input value={content.examples.badge} onChange={(v) => setContent({ ...content, examples: { ...content.examples, badge: v } })}/></Field>
          <Field label="כותרת"><Input value={content.examples.title} onChange={(v) => setContent({ ...content, examples: { ...content.examples, title: v } })}/></Field>
          <Field label="תיאור"><Input value={content.examples.lede} onChange={(v) => setContent({ ...content, examples: { ...content.examples, lede: v } })}/></Field>
          <ListEditor
            items={content.examples.items}
            empty={{ name: "", city: "", img: "", price: 0 }}
            onChange={(items) => setContent({ ...content, examples: { ...content.examples, items } })}
            render={(it, set) => (
              <div className="grid md:grid-cols-[1fr_1fr_120px_180px] gap-2">
                <Input placeholder="שם חנות" value={it.name} onChange={(v) => set({ ...it, name: v })}/>
                <Input placeholder="עיר" value={it.city} onChange={(v) => set({ ...it, city: v })}/>
                <Input placeholder="מחיר" type="number" value={String(it.price)} onChange={(v) => set({ ...it, price: Number(v) || 0 })}/>
                <ImageUpload bucket="store-assets" label="תמונה" value={it.img} onChange={(u) => set({ ...it, img: u })}/>
              </div>
            )}
          />
        </Section>

        {/* FEATURES */}
        <Section title="יכולות (Features)" onReset={() => resetSection("features")}>
          <Field label="כותרת"><Input value={content.features.title} onChange={(v) => setContent({ ...content, features: { ...content.features, title: v } })}/></Field>
          <Field label="תיאור"><Input value={content.features.lede} onChange={(v) => setContent({ ...content, features: { ...content.features, lede: v } })}/></Field>
          <ListEditor
            items={content.features.items}
            empty={{ icon: "Sparkles", title: "", body: "" }}
            onChange={(items) => setContent({ ...content, features: { ...content.features, items } })}
            render={(it, set) => (
              <div className="grid gap-2">
                <div className="grid md:grid-cols-[180px_1fr] gap-2">
                  <select className="bg-background border border-border rounded-lg px-3 py-2 text-sm" value={it.icon} onChange={(e) => set({ ...it, icon: e.target.value })}>
                    {["MessageCircle","Boxes","CreditCard","Tag","Truck","Bot","Sparkles","Flower2","Star","Check"].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <Input placeholder="כותרת" value={it.title} onChange={(v) => set({ ...it, title: v })}/>
                </div>
                <Textarea placeholder="תיאור" value={it.body} onChange={(v) => set({ ...it, body: v })}/>
              </div>
            )}
          />
        </Section>

        {/* TESTIMONIALS */}
        <Section title="המלצות" onReset={() => resetSection("testimonials")}>
          <Field label="כותרת"><Input value={content.testimonials.title} onChange={(v) => setContent({ ...content, testimonials: { ...content.testimonials, title: v } })}/></Field>
          <ListEditor
            items={content.testimonials.items}
            empty={{ name: "", store: "", quote: "" }}
            onChange={(items) => setContent({ ...content, testimonials: { ...content.testimonials, items } })}
            render={(it, set) => (
              <div className="grid gap-2">
                <div className="grid md:grid-cols-2 gap-2">
                  <Input placeholder="שם" value={it.name} onChange={(v) => set({ ...it, name: v })}/>
                  <Input placeholder="חנות · עיר" value={it.store} onChange={(v) => set({ ...it, store: v })}/>
                </div>
                <Textarea placeholder="ציטוט" value={it.quote} onChange={(v) => set({ ...it, quote: v })}/>
              </div>
            )}
          />
        </Section>

        {/* FAQ */}
        <Section title="שאלות נפוצות" onReset={() => resetSection("faq")}>
          <Field label="כותרת"><Input value={content.faq.title} onChange={(v) => setContent({ ...content, faq: { ...content.faq, title: v } })}/></Field>
          <ListEditor
            items={content.faq.items}
            empty={{ q: "", a: "" }}
            onChange={(items) => setContent({ ...content, faq: { ...content.faq, items } })}
            render={(it, set) => (
              <div className="grid gap-2">
                <Input placeholder="שאלה" value={it.q} onChange={(v) => set({ ...it, q: v })}/>
                <Textarea placeholder="תשובה" value={it.a} onChange={(v) => set({ ...it, a: v })}/>
              </div>
            )}
          />
        </Section>

        {/* FINAL CTA */}
        <Section title="קריאה לפעולה סופית" onReset={() => resetSection("finalCta")}>
          <Field label="כותרת (שורה חדשה = \\n)"><Textarea value={content.finalCta.title} onChange={(v) => setContent({ ...content, finalCta: { ...content.finalCta, title: v } })}/></Field>
          <Field label="תיאור"><Input value={content.finalCta.lede} onChange={(v) => setContent({ ...content, finalCta: { ...content.finalCta, lede: v } })}/></Field>
          <Field label="טקסט כפתור"><Input value={content.finalCta.button} onChange={(v) => setContent({ ...content, finalCta: { ...content.finalCta, button: v } })}/></Field>
        </Section>
      </main>

      {/* Sticky save bar on mobile */}
      <div className="fixed bottom-3 inset-x-3 z-30 md:hidden">
        <button onClick={save} disabled={saving} className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black shadow-xl flex items-center justify-center gap-2">
          {saving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} שמור שינויים
        </button>
      </div>
    </div>
  );
}

/* ---------------- Small primitives ---------------- */

function Section({ title, children, onReset }: { title: string; children: React.ReactNode; onReset?: () => void }) {
  return (
    <section className="bg-card rounded-3xl border border-border p-5 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="font-black flex items-center gap-2"><ListChecks size={16}/> {title}</h2>
        {onReset && <button onClick={onReset} className="text-xs text-muted-foreground hover:text-foreground underline">איפוס לברירת מחדל</button>}
      </header>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="block mb-1 text-muted-foreground">{label}</span>{children}</label>;
}

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"/>;
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[80px]"/>;
}

function ListEditor<T>({ items, onChange, render, empty }: {
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, set: (next: T) => void) => React.ReactNode;
  empty: T;
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="rounded-2xl border border-border bg-background/40 p-3">
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-muted-foreground">פריט {i + 1}</span>
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-destructive p-1 rounded hover:bg-destructive/10"><Trash2 size={14}/></button>
          </div>
          {render(it, (next) => { const a = [...items]; a[i] = next; onChange(a); })}
        </div>
      ))}
      <button onClick={() => onChange([...items, JSON.parse(JSON.stringify(empty))])}
        className="w-full h-10 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:bg-muted flex items-center justify-center gap-1">
        <Plus size={14}/> הוסף פריט
      </button>
    </div>
  );
}

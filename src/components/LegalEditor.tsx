import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Check } from "lucide-react";
import { useStore } from "@/lib/store-context";

type Section = { heading: string; paragraphs: string[] };
type Doc = { id?: string; slug: "terms" | "privacy"; title: string; intro: string; sections: Section[] };

const TABS: { slug: "terms" | "privacy"; label: string }[] = [
  { slug: "terms", label: "תקנון אתר" },
  { slug: "privacy", label: "מדיניות פרטיות" },
];

export function LegalEditor() {
  const { store } = useStore();
  const [slug, setSlug] = useState<"terms" | "privacy">("terms");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [saving, setSaving] = useState(false);

  async function load(s: "terms" | "privacy") {
    if (!store?.id) return;
    const { data } = await (supabase as any)
      .from("legal_documents")
      .select("*")
      .eq("slug", s)
      .eq("store_id", store.id)
      .maybeSingle();
    if (data) setDoc(data as Doc);
    else
      setDoc({
        slug: s,
        title: s === "terms" ? "תקנון האתר" : "מדיניות פרטיות",
        intro: "",
        sections: [],
      });
  }
  useEffect(() => {
    load(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, store?.id]);

  if (!store?.id || !doc) return <div className="text-muted-foreground">טוען...</div>;

  function update(patch: Partial<Doc>) {
    setDoc((d) => (d ? { ...d, ...patch } : d));
  }
  function setSec(i: number, patch: Partial<Section>) {
    setDoc((d) =>
      d ? { ...d, sections: d.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) } : d
    );
  }
  function addSection() {
    setDoc((d) => (d ? { ...d, sections: [...d.sections, { heading: "סעיף חדש", paragraphs: [""] }] } : d));
  }
  function delSection(i: number) {
    setDoc((d) => (d ? { ...d, sections: d.sections.filter((_, k) => k !== i) } : d));
  }
  function move(i: number, dir: -1 | 1) {
    setDoc((d) => {
      if (!d) return d;
      const j = i + dir;
      if (j < 0 || j >= d.sections.length) return d;
      const arr = d.sections.slice();
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, sections: arr };
    });
  }

  async function save() {
    if (!doc || !store?.id) return;
    setSaving(true);
    const payload = {
      slug: doc.slug,
      title: doc.title,
      intro: doc.intro,
      sections: doc.sections,
      store_id: store.id,
    };
    const { error } = doc.id
      ? await (supabase as any).from("legal_documents").update(payload).eq("id", doc.id).eq("store_id", store.id)
      : await (supabase as any).from("legal_documents").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("נשמר בהצלחה");
    load(slug);
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.slug}
            onClick={() => setSlug(t.slug)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
              slug === t.slug ? "bg-primary text-primary-foreground" : "bg-card border border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <label className="block">
          <span className="text-xs font-bold mb-1 block">כותרת המסמך</span>
          <input
            value={doc.title}
            onChange={(e) => update({ title: e.target.value })}
            className="w-full bg-background border border-input rounded-lg px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold mb-1 block">פסקת פתיחה</span>
          <textarea
            value={doc.intro}
            rows={3}
            onChange={(e) => update({ intro: e.target.value })}
            className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="space-y-3">
        {doc.sections.map((s, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground">סעיף #{i + 1}</span>
              <div className="flex-1" />
              <button onClick={() => move(i, -1)} className="p-1.5 rounded-lg hover:bg-muted" aria-label="העלה">
                <ArrowUp size={14} />
              </button>
              <button onClick={() => move(i, 1)} className="p-1.5 rounded-lg hover:bg-muted" aria-label="הורד">
                <ArrowDown size={14} />
              </button>
              <button
                onClick={() => delSection(i)}
                className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"
                aria-label="מחק"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <input
              value={s.heading}
              onChange={(e) => setSec(i, { heading: e.target.value })}
              placeholder="כותרת הסעיף"
              className="w-full bg-background border border-input rounded-lg px-3 py-2 font-bold"
            />
            <textarea
              value={s.paragraphs.join("\n\n")}
              onChange={(e) => setSec(i, { paragraphs: e.target.value.split(/\n\n+/).map((p) => p.trim()).filter(Boolean) })}
              rows={6}
              placeholder="פסקאות (הפרד בין פסקאות עם שורה ריקה)"
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm leading-relaxed"
            />
          </div>
        ))}
        <button
          onClick={addSection}
          className="w-full bg-muted hover:bg-muted/70 font-bold rounded-xl py-3 flex items-center justify-center gap-2 text-sm"
        >
          <Plus size={16} /> הוסף סעיף
        </button>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={save}
          disabled={saving}
          className="bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 disabled:opacity-50"
        >
          <Check size={16} /> {saving ? "שומר..." : "שמור מסמך"}
        </button>
      </div>
    </div>
  );
}

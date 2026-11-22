import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Plus, Pencil, X, Check, Palette, LogOut, ArrowRight, Power, FileText } from "lucide-react";
import { ImageUpload } from "@/lib/image-upload";
import { useServerFn } from "@tanstack/react-start";
import { seedStoreCatalog } from "@/lib/seed-store.functions";
import { backfillStoreFromTemplate } from "@/lib/backfill-store.functions";
import { adminListStoresFull } from "@/lib/platform-admin.functions";

type Store = {
  id: string;
  slug: string;
  name: string;
  description: string;
  primary_domain: string | null;
  extra_domains: string[];
  owner_user_id: string | null;
  active: boolean;
  plan: string;
  logo_url: string;
  favicon_url: string;
  contact_email: string;
  contact_phone: string;
  whatsapp_business: string;
  theme: Record<string, string>;
};

const EMPTY: Partial<Store> = {
  slug: "", name: "", description: "", primary_domain: "", extra_domains: [],
  owner_user_id: "", active: true, plan: "free", logo_url: "", favicon_url: "",
  contact_email: "", contact_phone: "", whatsapp_business: "", theme: {},
};

export const Route = createFileRoute("/super-admin")({
  head: () => ({ meta: [{ title: "Super Admin — ניהול פלטפורמה" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: SuperAdminGate,
});

function SuperAdminGate() {
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      if (data.user) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
        setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div dir="rtl" className="min-h-screen flex items-center justify-center text-muted-foreground">טוען...</div>;
  if (!email) {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <p>נדרשת התחברות כמנהל פלטפורמה</p>
        <Link to="/auth" className="bg-primary text-primary-foreground px-6 py-2 rounded-xl font-bold">כניסה</Link>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div dir="rtl" className="min-h-screen p-6 max-w-2xl mx-auto">
        <div className="bg-card rounded-3xl p-8 border border-border">
          <h1 className="text-xl font-black mb-2">אין הרשאת מנהל פלטפורמה</h1>
          <p className="text-sm text-muted-foreground mb-4">המסך הזה זמין רק למנהלי הפלטפורמה (Super Admin). מחובר: {email}</p>
          <button onClick={() => supabase.auth.signOut().then(() => location.reload())} className="text-sm text-destructive hover:underline">התנתק</button>
        </div>
      </div>
    );
  }
  return <SuperAdminShell email={email} />;
}

function SuperAdminShell({ email }: { email: string }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [stats, setStats] = useState<Record<string, { orders: number; revenue: number }>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Store | null>(null);
  const [creating, setCreating] = useState(false);
  const fetchStoresFull = useServerFn(adminListStoresFull);

  async function load() {
    setLoading(true);
    let list: Store[] = [];
    try {
      const data = await fetchStoresFull();
      list = (data as unknown as Store[]) || [];
      setStores(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שגיאה בטעינת חנויות");
    }

    // Per-store stats (orders + revenue). Single query, group on client.
    const { data: orders } = await supabase.from("orders").select("store_id,total").is("deleted_at", null);
    const s: Record<string, { orders: number; revenue: number }> = {};
    (orders || []).forEach((o: any) => {
      const k = o.store_id as string;
      if (!k) return;
      if (!s[k]) s[k] = { orders: 0, revenue: 0 };
      s[k].orders += 1;
      s[k].revenue += Number(o.total || 0);
    });
    setStats(s);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-card/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary p-2 rounded-xl"><Building2 size={18} /></div>
            <div>
              <h1 className="text-lg font-black leading-tight">ניהול פלטפורמה</h1>
              <p className="text-xs text-muted-foreground">{email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/super-admin/landing" className="text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted flex items-center gap-1"><FileText size={14}/> תוכן דף הבית</Link>
            <Link to="/admin" className="text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted flex items-center gap-1"><ArrowRight size={14}/> אזור ניהול חנות</Link>
            <button onClick={() => supabase.auth.signOut().then(() => location.reload())} className="text-sm px-3 py-2 rounded-xl border border-border hover:bg-muted flex items-center gap-1"><LogOut size={14}/> התנתק</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black">חנויות ({stores.length})</h2>
            <p className="text-sm text-muted-foreground">סקירה של כל החנויות בפלטפורמה</p>
          </div>
          <button onClick={() => setCreating(true)} className="bg-primary text-primary-foreground rounded-xl px-4 py-2 font-bold flex items-center gap-1"><Plus size={16}/> חנות חדשה</button>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-12">טוען חנויות…</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {stores.map((s) => {
              const st = stats[s.id] || { orders: 0, revenue: 0 };
              return (
                <article key={s.id} className="bg-card border border-border rounded-2xl p-4">
                  <header className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {s.logo_url ? <img src={s.logo_url} className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground"><Building2 size={18}/></div>}
                      <div className="min-w-0">
                        <div className="font-black truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground truncate">/{s.slug} · {s.primary_domain || "—"}</div>
                      </div>
                    </div>
                    <span className={"text-xs px-2 py-1 rounded-full " + (s.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                      {s.active ? "פעיל" : "מושבת"}
                    </span>
                  </header>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs my-3">
                    <div className="bg-muted/40 rounded-lg py-2"><div className="font-black text-base">{st.orders}</div><div className="text-muted-foreground">הזמנות</div></div>
                    <div className="bg-muted/40 rounded-lg py-2"><div className="font-black text-base">₪{Math.round(st.revenue)}</div><div className="text-muted-foreground">הכנסות</div></div>
                    <div className="bg-muted/40 rounded-lg py-2"><div className="font-black text-base">{s.plan}</div><div className="text-muted-foreground">תוכנית</div></div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditing(s)} className="text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted flex items-center gap-1"><Pencil size={14}/> עריכה</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {(creating || editing) && (
        <StoreEditor
          initial={editing || EMPTY}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); void load(); }}
        />
      )}
    </div>
  );
}

function StoreEditor({ initial, onClose, onSaved }: { initial: Partial<Store>; onClose: () => void; onSaved: () => void }) {
  const isNew = !initial.id;
  const [v, setV] = useState<Partial<Store>>({ ...EMPTY, ...initial, theme: { ...(initial.theme || {}) } });
  const [extraText, setExtraText] = useState((initial.extra_domains || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<{ user_id: string; email: string }[]>([]);
  const seedCatalog = useServerFn(seedStoreCatalog);
  const backfillFromTemplate = useServerFn(backfillStoreFromTemplate);
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (!error && data) setUsers((data as any[]).map((u) => ({ user_id: u.user_id, email: u.email })));
    })();
  }, []);

  function set<K extends keyof Store>(k: K, val: Store[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }
  function setTheme(k: string, val: string) {
    setV((prev) => ({ ...prev, theme: { ...(prev.theme || {}), [k]: val } }));
  }

  async function save() {
    if (!v.slug || !v.name) return toast.error("נדרש שם וסלאג");
    setSaving(true);
    const payload: any = {
      slug: v.slug,
      name: v.name,
      description: v.description || "",
      primary_domain: v.primary_domain || null,
      extra_domains: extraText.split(",").map((x) => x.trim()).filter(Boolean),
      owner_user_id: v.owner_user_id || null,
      active: !!v.active,
      plan: v.plan || "free",
      logo_url: v.logo_url || "",
      favicon_url: v.favicon_url || "",
      contact_email: v.contact_email || "",
      contact_phone: v.contact_phone || "",
      whatsapp_business: v.whatsapp_business || "",
      theme: v.theme || {},
    };
    let error: any;
    let newStoreId: string | null = null;
    if (isNew) {
      const { data: created, error: insErr } = await supabase
        .from("stores" as any)
        .insert(payload)
        .select("id")
        .single();
      error = insErr;
      newStoreId = (created as any)?.id ?? null;
    } else {
      ({ error } = await supabase.from("stores" as any).update(payload).eq("id", initial.id!));
    }
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    if (isNew && newStoreId) {
      try {
        toast.message("מאכלס את החנות ב-30 מוצרים לדוגמה...");
        const res = await seedCatalog({ data: { storeId: newStoreId } });
        if ((res as any)?.seeded) toast.success("החנות נוצרה ואוכלסה ב-30 מוצרים");
        else toast.success("החנות נוצרה");
      } catch (e: any) {
        toast.warning("החנות נוצרה אך אכלוס המוצרים נכשל: " + (e?.message || ""));
      }
    } else {
      toast.success("נשמר");
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl border border-border max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between">
          <h3 className="font-black">{isNew ? "חנות חדשה" : `עריכת חנות: ${initial.name}`}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X size={16}/></button>
        </header>
        <div className="p-5 space-y-4">
          {!isNew && initial.id && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-bold">השלמת נתוני דיפולט חסרים</div>
                <div className="text-xs text-muted-foreground">משלים מהדיפולט רק נתונים שחסרים בחנות (תמונות גלריה, גדלים, שיוכי קטגוריות, תמונה ראשית ריקה). לא מוחק ולא משכתב עבודה קיימת.</div>
              </div>
              <button
                disabled={backfilling}
                onClick={async () => {
                  try {
                    setBackfilling(true);
                    const res: any = await backfillFromTemplate({ data: { storeId: initial.id! } });
                    toast.success(`הושלם: ${res?.matched ?? 0} מוצרים תאומו · גלריות חדשות: ${res?.images ?? 0} · גדלים: ${res?.sizes ?? 0} · קטגוריות: ${res?.categoryLinks ?? 0} · תמונה ראשית: ${res?.imagesPrimary ?? 0}`);
                  } catch (e: any) {
                    toast.error(e?.message || "השלמה נכשלה");
                  } finally {
                    setBackfilling(false);
                  }
                }}
                className="text-sm px-3 py-2 rounded-xl bg-primary text-primary-foreground font-bold whitespace-nowrap"
              >
                {backfilling ? "פועל…" : "השלם מדיפולט"}
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="שם החנות *"><input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" value={v.name||""} onChange={(e)=>set("name", e.target.value)} /></Field>
            <Field label="סלאג (slug) *"><input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" value={v.slug||""} onChange={(e)=>set("slug", e.target.value.toLowerCase().trim().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"").replace(/-+/g,"-"))} disabled={!isNew}/></Field>
            <Field label="דומיין ראשי"><input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="store.example.com" value={v.primary_domain||""} onChange={(e)=>set("primary_domain", e.target.value)} /></Field>
            <Field label="דומיינים נוספים (מופרדים בפסיק)"><input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" value={extraText} onChange={(e)=>setExtraText(e.target.value)} /></Field>
            <Field label="בעלים (Owner)">
              <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" value={v.owner_user_id||""} onChange={(e)=>set("owner_user_id", e.target.value)}>
                <option value="">— ללא —</option>
                {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.email}</option>)}
              </select>
            </Field>
            <Field label="תוכנית">
              <select className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" value={v.plan||"free"} onChange={(e)=>set("plan", e.target.value)}>
                <option value="free">Free</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option>
              </select>
            </Field>
            <Field label="מייל"><input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" value={v.contact_email||""} onChange={(e)=>set("contact_email", e.target.value)} /></Field>
            <Field label="טלפון"><input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" value={v.contact_phone||""} onChange={(e)=>set("contact_phone", e.target.value)} /></Field>
            <Field label="ווטסאפ עסקי"><input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" value={v.whatsapp_business||""} onChange={(e)=>set("whatsapp_business", e.target.value)} /></Field>
            <Field label="סטטוס">
              <button onClick={()=>set("active", !v.active)} className={"w-full bg-background border border-border rounded-lg px-3 py-2 text-sm flex items-center gap-2 " + (v.active ? "text-emerald-600" : "text-muted-foreground")}>
                <Power size={14}/> {v.active ? "פעיל" : "מושבת"}
              </button>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ImageUpload bucket="store-assets" label="לוגו" value={v.logo_url||""} onChange={(url)=>set("logo_url", url)} />
            <ImageUpload bucket="store-assets" label="Favicon" value={v.favicon_url||""} onChange={(url)=>set("favicon_url", url)} />
          </div>
          <Field label="תיאור"><textarea className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[60px]" value={v.description||""} onChange={(e)=>set("description", e.target.value)} /></Field>

          <section className="border-t border-border pt-4">
            <h4 className="font-black mb-3 flex items-center gap-2"><Palette size={16}/> Theme Builder</h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                ["primary", "צבע ראשי"],
                ["primary_foreground", "טקסט על ראשי"],
                ["secondary", "צבע משני"],
                ["accent", "צבע הדגשה"],
                ["background", "רקע"],
                ["foreground", "טקסט"],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <div className="flex gap-2 items-center">
                    <input type="color" className="w-12 h-10 rounded border border-border" value={(v.theme as any)?.[key] || "#ffffff"} onChange={(e)=>setTheme(key, e.target.value)} />
                    <input className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" placeholder="#hex או oklch(...)" value={(v.theme as any)?.[key] || ""} onChange={(e)=>setTheme(key, e.target.value)} />
                  </div>
                </Field>
              ))}
            </div>
          </section>
        </div>
        <footer className="sticky bottom-0 bg-card border-t border-border px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border hover:bg-muted">ביטול</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold flex items-center gap-1"><Check size={16}/> {saving ? "שומר..." : "שמירה"}</button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

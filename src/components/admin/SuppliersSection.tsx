import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store-context";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus,
  Pencil,
  Trash2,
  Phone,
  MessageCircle,
  X,
  Copy,
  PackageCheck,
  Send,
} from "lucide-react";
import type { Json } from "@/integrations/supabase/types";
import {
  PO_UNITS,
  SUPPLIER_CATEGORIES,
  WEEKDAYS,
  cleanPOItems,
  formatPurchaseOrderMessage,
  poTotal,
  tomorrowISO,
  toWhatsAppNumber,
  whatsappLink,
  type POItem,
  type PrepLine,
} from "@/lib/florist";
import { PREP_DRAFT_KEY } from "./TodaySection";

type Supplier = {
  id: string;
  name: string;
  category: string;
  contact_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  order_days: string[];
  notes: string | null;
  active: boolean;
};
type PO = {
  id: string;
  supplier_id: string | null;
  status: "draft" | "sent" | "received" | "cancelled";
  needed_by: string | null;
  items: POItem[];
  notes: string | null;
  total: number;
  created_at: string;
};
type PODraft = {
  id?: string;
  supplier_id: string;
  needed_by: string;
  items: POItem[];
  notes: string;
};

const PO_STATUS: Record<PO["status"], { label: string; cls: string }> = {
  draft: { label: "טיוטה", cls: "bg-muted text-foreground" },
  sent: { label: "נשלחה", cls: "bg-blue-100 text-blue-900" },
  received: { label: "התקבלה", cls: "bg-emerald-100 text-emerald-900" },
  cancelled: { label: "בוטלה", cls: "bg-rose-100 text-rose-900" },
};
const emptyItem = (): POItem => ({ name: "", qty: 1, unit: PO_UNITS[0], price: null });
const catOf = (v: string) =>
  SUPPLIER_CATEGORIES.find((c) => c.value === v) ??
  SUPPLIER_CATEGORIES[SUPPLIER_CATEGORIES.length - 1];

export function SuppliersSection() {
  const { store } = useStore();
  const storeId = store?.id ?? null;
  const [tab, setTab] = useState<"orders" | "suppliers">("orders");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PO[]>([]);
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier> | null>(null);
  const [draft, setDraft] = useState<PODraft | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const [{ data: s, error: se }, { data: o }] = await Promise.all([
      supabase.from("suppliers").select("*").eq("store_id", storeId).order("name"),
      supabase
        .from("purchase_orders")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (se) toast.error("לא הצלחנו לטעון את הספקים");
    setSuppliers((s || []) as unknown as Supplier[]);
    setOrders(
      ((o || []) as unknown as PO[]).map((x) => ({
        ...x,
        items: Array.isArray(x.items) ? x.items : [],
      })),
    );
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Arriving from "order from supplier" on the Today screen.
  useEffect(() => {
    let prefill: PrepLine[] | null = null;
    try {
      const raw = sessionStorage.getItem(PREP_DRAFT_KEY);
      if (raw) {
        prefill = JSON.parse(raw);
        sessionStorage.removeItem(PREP_DRAFT_KEY);
      }
    } catch {
      /* storage blocked */
    }
    if (prefill && prefill.length) {
      setTab("orders");
      setDraft({
        supplier_id: "",
        needed_by: tomorrowISO(),
        notes: "",
        items: prefill.map((p) => ({ name: p.name, qty: p.qty, unit: PO_UNITS[0], price: null })),
      });
    }
  }, []);

  const supplierById = (id: string | null) => suppliers.find((s) => s.id === id) ?? null;

  async function saveSupplier(s: Partial<Supplier>) {
    if (!storeId) return;
    const row = {
      name: (s.name || "").trim(),
      category: s.category || "flowers",
      contact_name: s.contact_name?.trim() || null,
      phone: s.phone?.trim() || null,
      whatsapp: s.whatsapp?.trim() || null,
      email: s.email?.trim() || null,
      order_days: s.order_days || [],
      notes: s.notes?.trim() || null,
    };
    if (!row.name) {
      toast.error("צריך שם לספק");
      return;
    }
    const { error } = s.id
      ? await supabase.from("suppliers").update(row).eq("id", s.id).eq("store_id", storeId)
      : await supabase.from("suppliers").insert({ ...row, store_id: storeId });
    if (error) {
      toast.error("השמירה נכשלה");
      return;
    }
    toast.success("הספק נשמר");
    setEditingSupplier(null);
    void load();
  }

  async function deleteSupplier(s: Supplier) {
    if (!storeId || !window.confirm(`למחוק את ${s.name}? הזמנות קודמות יישמרו.`)) return;
    const { error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", s.id)
      .eq("store_id", storeId);
    if (error) {
      toast.error("המחיקה נכשלה");
      return;
    }
    void load();
  }

  /** Saves the draft; with send=true also opens WhatsApp with the order text. */
  async function savePO(d: PODraft, send: boolean) {
    if (!storeId) return;
    const items = cleanPOItems(d.items);
    if (!items.length) {
      toast.error("הוסיפו לפחות פריט אחד עם כמות");
      return;
    }
    const supplier = supplierById(d.supplier_id || null);
    let waWindow: Window | null = null;
    let link: string | null = null;
    if (send) {
      const phone = supplier?.whatsapp || supplier?.phone;
      if (!supplier) {
        toast.error("בחרו ספק כדי לשלוח");
        return;
      }
      if (!toWhatsAppNumber(phone)) {
        toast.error("לספק אין מספר וואטסאפ תקין");
        return;
      }
      link = whatsappLink(
        phone,
        formatPurchaseOrderMessage({
          storeName: store?.name || "",
          supplierName: supplier.contact_name || supplier.name,
          neededBy: d.needed_by,
          items,
          notes: d.notes,
        }),
      );
      // Open synchronously so pop-up blockers allow it.
      waWindow = window.open("about:blank", "_blank");
    }
    const row = {
      supplier_id: d.supplier_id || null,
      needed_by: d.needed_by || null,
      items: items as unknown as Json,
      notes: d.notes.trim() || null,
      total: poTotal(items),
      ...(send ? { status: "sent", sent_at: new Date().toISOString() } : {}),
    };
    const { error } = d.id
      ? await supabase.from("purchase_orders").update(row).eq("id", d.id).eq("store_id", storeId)
      : await supabase.from("purchase_orders").insert({ ...row, store_id: storeId });
    if (error) {
      waWindow?.close();
      toast.error("השמירה נכשלה");
      return;
    }
    if (send && link) {
      if (waWindow) waWindow.location.href = link;
      else window.location.href = link;
      toast.success("ההזמנה נשמרה. שלחו את ההודעה בוואטסאפ ✓");
    } else toast.success("הטיוטה נשמרה");
    setDraft(null);
    void load();
  }

  async function setPOStatus(po: PO, status: PO["status"]) {
    if (!storeId) return;
    const patch = {
      status,
      ...(status === "received" ? { received_at: new Date().toISOString() } : {}),
    };
    const { error } = await supabase
      .from("purchase_orders")
      .update(patch)
      .eq("id", po.id)
      .eq("store_id", storeId);
    if (error) {
      toast.error("העדכון נכשל");
      return;
    }
    setOrders((prev) => prev.map((x) => (x.id === po.id ? { ...x, status } : x)));
  }

  const openOrders = orders.filter((o) => o.status === "draft" || o.status === "sent");
  const pastOrders = orders.filter((o) => o.status === "received" || o.status === "cancelled");

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black">ספקים ורכש</h1>
          <p className="text-sm text-muted-foreground">
            מזמינים מהספקים בוואטסאפ בלחיצה, ושומרים מעקב מה הוזמן ומה הגיע.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditingSupplier({ category: "flowers", order_days: [] })}
            className="h-10 px-3 rounded-xl border border-border bg-card text-sm font-bold hover:bg-muted flex items-center gap-1.5"
          >
            <Plus size={16} aria-hidden /> ספק חדש
          </button>
          <button
            onClick={() =>
              setDraft({
                supplier_id: suppliers[0]?.id ?? "",
                needed_by: tomorrowISO(),
                items: [emptyItem()],
                notes: "",
              })
            }
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 flex items-center gap-1.5"
          >
            <Plus size={16} aria-hidden /> הזמנה לספק
          </button>
        </div>
      </div>

      <div role="tablist" className="inline-flex bg-muted rounded-xl p-1">
        {(
          [
            ["orders", `הזמנות (${openOrders.length})`],
            ["suppliers", `ספקים (${suppliers.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition ${tab === id ? "bg-card shadow-sm" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">טוען…</p>
      ) : tab === "suppliers" ? (
        suppliers.length === 0 ? (
          <EmptyState
            title="עוד אין ספקים"
            text="הוסיפו את הסיטונאי, ספק האגרטלים וספק האריזות, ותוכלו לשלוח להם הזמנה בוואטסאפ בלחיצה."
            action="הוספת ספק ראשון"
            onAction={() => setEditingSupplier({ category: "flowers", order_days: [] })}
          />
        ) : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {suppliers.map((s) => {
              const c = catOf(s.category);
              const wa = whatsappLink(s.whatsapp || s.phone, `שלום ${s.contact_name || s.name}, `);
              return (
                <li
                  key={s.id}
                  className="bg-card border border-border rounded-2xl p-4 flex flex-col"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl" aria-hidden>
                      {c.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-black truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.label}
                        {s.contact_name ? ` · ${s.contact_name}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => setEditingSupplier(s)}
                      className="p-2 rounded-lg hover:bg-muted"
                      aria-label={`עריכת ${s.name}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => void deleteSupplier(s)}
                      className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
                      aria-label={`מחיקת ${s.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {s.order_days.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ימי הזמנה:{" "}
                      {WEEKDAYS.filter((d) => s.order_days.includes(d.key))
                        .map((d) => d.label)
                        .join(" ")}
                    </p>
                  )}
                  {s.notes && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.notes}</p>
                  )}
                  <div className="flex gap-2 mt-auto pt-3">
                    <button
                      onClick={() => {
                        setTab("orders");
                        setDraft({
                          supplier_id: s.id,
                          needed_by: tomorrowISO(),
                          items: [emptyItem()],
                          notes: "",
                        });
                      }}
                      className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90"
                    >
                      הזמנה
                    </button>
                    {s.phone && (
                      <a
                        href={`tel:${s.phone}`}
                        className="h-10 w-10 grid place-items-center rounded-xl border border-border hover:bg-muted"
                        aria-label={`חיוג ל${s.name}`}
                      >
                        <Phone size={16} />
                      </a>
                    )}
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="h-10 w-10 grid place-items-center rounded-xl border border-border hover:bg-muted"
                        aria-label={`וואטסאפ ל${s.name}`}
                      >
                        <MessageCircle size={16} />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : orders.length === 0 ? (
        <EmptyState
          title="עוד אין הזמנות רכש"
          text={
            suppliers.length
              ? "צרו הזמנה, בחרו ספק ושלחו בוואטסאפ. ההזמנה נשמרת כאן למעקב."
              : "התחילו בהוספת ספק, ואז צרו הזמנה ראשונה."
          }
          action={suppliers.length ? "הזמנה ראשונה" : "הוספת ספק"}
          onAction={() =>
            suppliers.length
              ? setDraft({
                  supplier_id: suppliers[0].id,
                  needed_by: tomorrowISO(),
                  items: [emptyItem()],
                  notes: "",
                })
              : setEditingSupplier({ category: "flowers", order_days: [] })
          }
        />
      ) : (
        <div className="space-y-5">
          <POList
            title="פתוחות"
            list={openOrders}
            supplierById={supplierById}
            onEdit={(po) =>
              setDraft({
                id: po.id,
                supplier_id: po.supplier_id ?? "",
                needed_by: po.needed_by ?? "",
                items: po.items.length ? po.items : [emptyItem()],
                notes: po.notes ?? "",
              })
            }
            onStatus={setPOStatus}
            onRepeat={(po) =>
              setDraft({
                supplier_id: po.supplier_id ?? "",
                needed_by: tomorrowISO(),
                items: po.items,
                notes: po.notes ?? "",
              })
            }
          />
          {pastOrders.length > 0 && (
            <POList
              title="היסטוריה"
              list={pastOrders}
              supplierById={supplierById}
              onEdit={() => {}}
              onStatus={setPOStatus}
              onRepeat={(po) =>
                setDraft({
                  supplier_id: po.supplier_id ?? "",
                  needed_by: tomorrowISO(),
                  items: po.items,
                  notes: po.notes ?? "",
                })
              }
            />
          )}
        </div>
      )}

      {editingSupplier && (
        <SupplierForm
          value={editingSupplier}
          onCancel={() => setEditingSupplier(null)}
          onSave={saveSupplier}
        />
      )}
      {draft && (
        <POEditor
          draft={draft}
          setDraft={setDraft}
          suppliers={suppliers}
          onAddSupplier={() => setEditingSupplier({ category: "flowers", order_days: [] })}
          onSave={(send) => void savePO(draft, send)}
        />
      )}
    </div>
  );
}

function EmptyState({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
      <p className="text-3xl mb-2" aria-hidden>
        🌼
      </p>
      <p className="font-black">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{text}</p>
      <button
        onClick={onAction}
        className="mt-4 h-11 px-5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90"
      >
        {action}
      </button>
    </div>
  );
}

function POList({
  title,
  list,
  supplierById,
  onEdit,
  onStatus,
  onRepeat,
}: {
  title: string;
  list: PO[];
  supplierById: (id: string | null) => Supplier | null;
  onEdit: (po: PO) => void;
  onStatus: (po: PO, s: PO["status"]) => void;
  onRepeat: (po: PO) => void;
}) {
  return (
    <section>
      <h2 className="font-black mb-2">{title}</h2>
      <ul className="space-y-2">
        {list.map((po) => {
          const s = supplierById(po.supplier_id);
          const st = PO_STATUS[po.status];
          const open = po.status === "draft" || po.status === "sent";
          return (
            <li key={po.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold">{s?.name || "ספק שנמחק"}</p>
                <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${st.cls}`}>
                  {st.label}
                </span>
                {po.needed_by && (
                  <span className="text-xs text-muted-foreground">
                    לתאריך {format(new Date(po.needed_by + "T00:00:00"), "dd/MM")}
                  </span>
                )}
                {po.total > 0 && (
                  <span className="text-xs text-muted-foreground mr-auto tabular-nums">
                    ₪{po.total.toLocaleString("he-IL")}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {po.items.map((i) => `${i.name} ×${i.qty}`).join(" · ") || "ללא פריטים"}
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                {po.status === "sent" && (
                  <button
                    onClick={() => onStatus(po, "received")}
                    className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 flex items-center gap-1.5"
                  >
                    <PackageCheck size={15} aria-hidden /> הסחורה הגיעה
                  </button>
                )}
                {open && (
                  <button
                    onClick={() => onEdit(po)}
                    className="h-9 px-3 rounded-xl border border-border text-sm hover:bg-muted"
                  >
                    {po.status === "draft" ? "המשך ושליחה" : "עריכה"}
                  </button>
                )}
                <button
                  onClick={() => onRepeat(po)}
                  className="h-9 px-3 rounded-xl border border-border text-sm hover:bg-muted flex items-center gap-1.5"
                >
                  <Copy size={14} aria-hidden /> הזמנה חוזרת
                </button>
                {open && (
                  <button
                    onClick={() => onStatus(po, "cancelled")}
                    className="h-9 px-3 rounded-xl text-sm text-destructive hover:bg-destructive/10"
                  >
                    ביטול
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-xl"
      >
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="font-black text-lg">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted" aria-label="סגירה">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-background border border-input rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary";

function SupplierForm({
  value,
  onCancel,
  onSave,
}: {
  value: Partial<Supplier>;
  onCancel: () => void;
  onSave: (s: Partial<Supplier>) => void;
}) {
  const [s, setS] = useState<Partial<Supplier>>(value);
  const days = s.order_days || [];
  return (
    <Modal title={s.id ? "עריכת ספק" : "ספק חדש"} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(s);
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="text-sm font-bold">שם הספק *</span>
          <input
            required
            autoFocus
            value={s.name || ""}
            onChange={(e) => setS({ ...s, name: e.target.value })}
            placeholder="למשל: פרחי השרון סיטונאות"
            className={inputCls + " mt-1"}
          />
        </label>
        <fieldset>
          <legend className="text-sm font-bold mb-1">מה הוא מספק</legend>
          <div className="flex flex-wrap gap-2">
            {SUPPLIER_CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.value}
                onClick={() => setS({ ...s, category: c.value })}
                aria-pressed={s.category === c.value}
                className={`px-3 py-2 rounded-xl text-sm border ${s.category === c.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-bold">איש קשר</span>
            <input
              value={s.contact_name || ""}
              onChange={(e) => setS({ ...s, contact_name: e.target.value })}
              className={inputCls + " mt-1"}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">טלפון</span>
            <input
              type="tel"
              inputMode="tel"
              value={s.phone || ""}
              onChange={(e) => setS({ ...s, phone: e.target.value })}
              placeholder="050-0000000"
              className={inputCls + " mt-1"}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">וואטסאפ להזמנות</span>
            <input
              type="tel"
              inputMode="tel"
              value={s.whatsapp || ""}
              onChange={(e) => setS({ ...s, whatsapp: e.target.value })}
              placeholder="אם שונה מהטלפון"
              className={inputCls + " mt-1"}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">אימייל</span>
            <input
              type="email"
              value={s.email || ""}
              onChange={(e) => setS({ ...s, email: e.target.value })}
              className={inputCls + " mt-1"}
            />
          </label>
        </div>
        <fieldset>
          <legend className="text-sm font-bold mb-1">ימים שבהם מזמינים ממנו</legend>
          <div className="flex gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = days.includes(d.key);
              return (
                <button
                  type="button"
                  key={d.key}
                  aria-pressed={on}
                  onClick={() =>
                    setS({
                      ...s,
                      order_days: on ? days.filter((x) => x !== d.key) : [...days, d.key],
                    })
                  }
                  className={`w-10 h-10 rounded-xl text-sm font-bold border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="block">
          <span className="text-sm font-bold">הערות</span>
          <textarea
            rows={2}
            value={s.notes || ""}
            onChange={(e) => setS({ ...s, notes: e.target.value })}
            placeholder="מינימום הזמנה, שעות איסוף, תנאי תשלום…"
            className={inputCls + " mt-1"}
          />
        </label>
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90"
          >
            שמירה
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-11 px-5 rounded-xl border border-border hover:bg-muted"
          >
            ביטול
          </button>
        </div>
      </form>
    </Modal>
  );
}

function POEditor({
  draft,
  setDraft,
  suppliers,
  onAddSupplier,
  onSave,
}: {
  draft: PODraft;
  setDraft: (d: PODraft | null) => void;
  suppliers: Supplier[];
  onAddSupplier: () => void;
  onSave: (send: boolean) => void;
}) {
  const setItem = (i: number, patch: Partial<POItem>) => {
    const items = draft.items.map((it, j) => (j === i ? { ...it, ...patch } : it));
    setDraft({ ...draft, items });
  };
  const total = poTotal(draft.items);
  return (
    <Modal title={draft.id ? "עריכת הזמנה לספק" : "הזמנה חדשה לספק"} onClose={() => setDraft(null)}>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-bold">ספק</span>
            {suppliers.length ? (
              <select
                value={draft.supplier_id}
                onChange={(e) => setDraft({ ...draft, supplier_id: e.target.value })}
                className={inputCls + " mt-1"}
              >
                <option value="">בחרו ספק…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {catOf(s.category).emoji} {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={onAddSupplier}
                className={inputCls + " mt-1 text-right text-primary font-bold"}
              >
                + הוספת ספק
              </button>
            )}
          </label>
          <label className="block">
            <span className="text-sm font-bold">לתאריך</span>
            <input
              type="date"
              value={draft.needed_by}
              onChange={(e) => setDraft({ ...draft, needed_by: e.target.value })}
              className={inputCls + " mt-1"}
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-bold mb-2">פריטים</legend>
          <div className="space-y-2">
            {draft.items.map((it, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  aria-label="פריט"
                  value={it.name}
                  onChange={(e) => setItem(i, { name: e.target.value })}
                  placeholder="ורדים אדומים"
                  className={inputCls + " flex-1 min-w-0"}
                />
                <input
                  aria-label="כמות"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={it.qty}
                  onChange={(e) => setItem(i, { qty: Number(e.target.value) })}
                  className={inputCls + " w-20"}
                />
                <select
                  aria-label="יחידה"
                  value={it.unit}
                  onChange={(e) => setItem(i, { unit: e.target.value })}
                  className={inputCls + " w-28"}
                >
                  {PO_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      items:
                        draft.items.length > 1
                          ? draft.items.filter((_, j) => j !== i)
                          : [emptyItem()],
                    })
                  }
                  className="p-2 rounded-lg hover:bg-destructive/10 text-destructive shrink-0"
                  aria-label="הסרת פריט"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDraft({ ...draft, items: [...draft.items, emptyItem()] })}
            className="mt-2 text-sm font-bold text-primary flex items-center gap-1"
          >
            <Plus size={15} aria-hidden /> הוספת פריט
          </button>
        </fieldset>

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            מחירים (לא חובה, למעקב עלויות)
          </summary>
          <div className="space-y-2 mt-2">
            {draft.items.map((it, i) =>
              it.name.trim() ? (
                <label key={i} className="flex items-center gap-2">
                  <span className="flex-1 truncate">{it.name}</span>
                  <span className="text-muted-foreground text-xs">₪ ליחידה</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.1"
                    value={it.price ?? ""}
                    onChange={(e) =>
                      setItem(i, { price: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    className={inputCls + " w-24"}
                  />
                </label>
              ) : null,
            )}
            {total > 0 && <p className="font-bold">סה״כ משוער: ₪{total.toLocaleString("he-IL")}</p>}
          </div>
        </details>

        <label className="block">
          <span className="text-sm font-bold">הערות לספק</span>
          <textarea
            rows={2}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="למשל: איסוף ב-7:00, ורדים באורך 60"
            className={inputCls + " mt-1"}
          />
        </label>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            onClick={() => onSave(true)}
            className="flex-1 h-12 rounded-xl bg-[#25D366] text-white font-bold hover:brightness-95 flex items-center justify-center gap-2"
          >
            <Send size={17} aria-hidden /> שליחה לספק בוואטסאפ
          </button>
          <button
            onClick={() => onSave(false)}
            className="h-12 px-5 rounded-xl border border-border font-bold hover:bg-muted"
          >
            שמירה כטיוטה
          </button>
        </div>
      </div>
    </Modal>
  );
}

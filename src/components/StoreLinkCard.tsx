import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Check, Copy, Link2, MessageCircle, Pencil, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useStore } from "@/lib/store-context";
import { PUBLIC_APP_ORIGIN } from "@/lib/oauth-flow";
import { updateStoreSlug } from "@/lib/store-slug.functions";

/** "The link to your store": copy, share on WhatsApp, QR, and edit the slug. */
export function StoreLinkCard() {
  const { store, refresh } = useStore();
  const saveFn = useServerFn(updateStoreSlug);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  if (!store?.slug) return null;
  const url = `${PUBLIC_APP_ORIGIN}/s/${store.slug}`;
  const shareText = `הזמינו אצלנו פרחים אונליין 🌸 ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("לא הצלחנו להעתיק. סמנו את הקישור והעתיקו ידנית.");
    }
  }

  async function save() {
    if (!store) return;
    setSaving(true);
    const res = await saveFn({ data: { storeId: store.id, slug: draft } }).catch(() => null);
    setSaving(false);
    if (!res) return toast.error("שמירה נכשלה, נסו שוב");
    if (!res.ok) return toast.error(res.error);
    toast.success("הקישור עודכן");
    setEditing(false);
    try { localStorage.removeItem("tmm_current_store"); } catch {}
    await refresh();
  }

  function downloadQr() {
    const canvas = document.getElementById("store-qr") as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${store?.slug}.png`;
    a.click();
  }

  return (
    <section dir="rtl" className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <header className="flex items-center gap-2 mb-3">
        <div className="bg-primary/15 text-primary p-2 rounded-xl"><Link2 size={18} /></div>
        <div>
          <h3 className="font-black text-base leading-tight">הקישור לחנות שלך</h3>
          <p className="text-xs text-muted-foreground">שלחו ללקוחות, שימו בביו באינסטגרם או הדפיסו כ-QR</p>
        </div>
      </header>

      {editing ? (
        <div className="space-y-2">
          <div dir="ltr" className="flex items-center rounded-xl border border-border bg-background overflow-hidden">
            <span className="px-3 text-xs text-muted-foreground whitespace-nowrap">{PUBLIC_APP_ORIGIN.replace(/^https?:\/\//, "")}/s/</span>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="flex-1 min-w-0 h-11 bg-transparent outline-none font-bold"
              maxLength={40}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">אותיות באנגלית, מספרים ומקפים. קישור ישן יפסיק לעבוד.</p>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={saving || draft.length < 3}
              className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50">
              {saving ? "שומר..." : "שמירה"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="h-11 px-4 rounded-xl border border-border font-bold">
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div dir="ltr" className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 h-11 mb-3">
            <span className="flex-1 truncate font-bold text-sm">{url.replace(/^https?:\/\//, "")}</span>
            <button type="button" onClick={() => { setDraft(store.slug); setEditing(true); }}
              className="text-muted-foreground hover:text-foreground" aria-label="עריכת הקישור">
              <Pencil size={15} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={copy}
              className="h-11 rounded-xl bg-primary text-primary-foreground font-bold text-sm inline-flex items-center justify-center gap-1.5">
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "הועתק" : "העתקה"}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer"
              className="h-11 rounded-xl bg-[#25D366] text-white font-bold text-sm inline-flex items-center justify-center gap-1.5">
              <MessageCircle size={16} /> וואטסאפ
            </a>
            <button type="button" onClick={() => setShowQr((v) => !v)}
              className="h-11 rounded-xl border-2 border-border font-bold text-sm inline-flex items-center justify-center gap-1.5">
              <QrCode size={16} /> QR
            </button>
          </div>
          {showQr && (
            <div className="mt-4 flex flex-col items-center gap-2">
              <div className="bg-white p-3 rounded-2xl border border-border">
                <QRCodeCanvas id="store-qr" value={url} size={180} marginSize={1} />
              </div>
              <button type="button" onClick={downloadQr} className="text-sm font-bold text-primary underline">הורדת QR להדפסה</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { writeProductDescription } from "@/lib/ai-writer.functions";
import { useStore } from "@/lib/store-context";

const TONES = [
  { id: "warm", label: "חם" },
  { id: "elegant", label: "יוקרתי" },
  { id: "fun", label: "קליל" },
] as const;

/** "Write it for me" under a product description. The result lands in the box for editing. */
export function AiDescribeButton({
  name,
  price,
  current,
  onText,
}: {
  name: string;
  price?: number;
  current: string;
  onText: (text: string) => void;
}) {
  const write = useServerFn(writeProductDescription);
  const { store } = useStore();
  const [tone, setTone] = useState<(typeof TONES)[number]["id"]>("warm");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function run() {
    if (!store?.id) return;
    if (!name.trim()) {
      toast.error("כתבו קודם את שם המוצר.");
      return;
    }
    setBusy(true);
    try {
      const res = await write({
        data: {
          storeId: store.id,
          name: name.trim(),
          price: Number(price) > 0 ? Number(price) : undefined,
          // What the owner already typed is used as hints, not thrown away.
          notes: done ? "" : current.slice(0, 600),
          tone,
        },
      });
      if (res.ok) {
        onText(res.text);
        setDone(true);
      } else toast.error(res.error);
    } catch {
      toast.error("הכתיבה לא הצליחה כרגע. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="h-9 px-3 rounded-lg bg-primary/10 text-primary text-sm font-bold inline-flex items-center gap-1.5 hover:bg-primary/15 disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {done ? "כתבו שוב" : "כתבו לי עם AI"}
      </button>
      <div className="flex gap-1" role="radiogroup" aria-label="סגנון כתיבה">
        {TONES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tone === t.id}
            onClick={() => setTone(t.id)}
            className={`h-9 px-2.5 rounded-lg text-xs font-bold border ${
              tone === t.id ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {done && <span className="text-xs text-muted-foreground w-full">אפשר לערוך את הטקסט לפני השמירה.</span>}
    </div>
  );
}

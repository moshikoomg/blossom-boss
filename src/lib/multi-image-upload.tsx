import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { toWebp } from "@/lib/to-webp";
import { resolveUploadPrefix } from "@/lib/upload-prefix";

type Img = { url: string; order: number };
type Props = {
  values: string[];
  onChange: (urls: string[]) => void;
  bucket?: "product-images" | "site-assets";
  label?: string;
  max?: number;
};

export function MultiImageUpload({ values, onChange, bucket = "product-images", label = "תמונות (ניתן להעלות כמה)", max = 10 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function uploadFiles(files: FileList) {
    if (values.length + files.length > max) return toast.error(`מקסימום ${max} תמונות`);
    setBusy(true);
    const uploaded: string[] = [];
    try {
      const prefix = await resolveUploadPrefix();
      if (!prefix) { toast.error("אין הרשאה להעלות לחנות זו"); return; }
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name}: גודל עד 8MB`); continue; }
        const up = await toWebp(file);
        const ext = up.name.split(".").pop() || "jpg";
        const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const { error } = await supabase.storage.from(bucket).upload(path, up, { contentType: up.type });
        if (error) { toast.error(error.message); continue; }
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      if (uploaded.length) {
        onChange([...values, ...uploaded]);
        toast.success(`הועלו ${uploaded.length} תמונות`);
      }
    } finally { setBusy(false); }
  }

  function remove(i: number) { onChange(values.filter((_, j) => j !== i)); }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div>
      <p className="text-sm font-medium mb-1.5 text-foreground">{label}</p>
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files); }}
        className="relative border-2 border-dashed border-border rounded-2xl p-4 bg-muted/30 hover:bg-muted/50 cursor-pointer transition flex flex-col items-center justify-center min-h-24 text-center"
      >
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value=""; }}/>
        {busy ? <><Loader2 className="animate-spin text-muted-foreground"/><p className="text-xs text-muted-foreground mt-2">מעלה...</p></>
              : <><Upload className="text-muted-foreground" size={22}/><p className="text-xs text-muted-foreground mt-2">גרור תמונות לכאן או לחץ לבחירה (אפשר לבחור כמה ביחד)</p></>}
      </div>
      {values.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
          {values.map((u, i) => (
            <div key={u+i} className="relative group rounded-xl overflow-hidden border border-border bg-muted">
              <img src={u} alt="" className="w-full h-24 object-cover"/>
              <span className="absolute top-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 rounded">#{i+1}</span>
              <div className="absolute inset-x-0 bottom-0 bg-black/70 flex justify-center gap-1 p-1 opacity-0 group-hover:opacity-100 transition">
                <button type="button" onClick={(e)=>{e.stopPropagation();move(i,-1);}} disabled={i===0} className="text-white p-1 rounded hover:bg-white/20 disabled:opacity-30"><ArrowUp size={12}/></button>
                <button type="button" onClick={(e)=>{e.stopPropagation();move(i,1);}} disabled={i===values.length-1} className="text-white p-1 rounded hover:bg-white/20 disabled:opacity-30"><ArrowDown size={12}/></button>
                <button type="button" onClick={(e)=>{e.stopPropagation();remove(i);}} className="text-white p-1 rounded hover:bg-rose-600"><X size={12}/></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

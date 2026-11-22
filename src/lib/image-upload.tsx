import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, Loader2 } from "lucide-react";
import { toWebp } from "@/lib/to-webp";
import { resolveUploadPrefix } from "@/lib/upload-prefix";

type Props = {
  value?: string | null;
  onChange: (url: string) => void;
  bucket?: "product-images" | "site-assets" | "store-assets";
  label?: string;
  className?: string;
  accept?: string;
  kind?: "image" | "video";
  maxMB?: number;
};

export function ImageUpload({ value, onChange, bucket = "product-images", label = "תמונה", className = "", accept = "image/*", kind = "image", maxMB }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const limit = (maxMB ?? (kind === "video" ? 40 : 8)) * 1024 * 1024;

  async function handleFile(file: File) {
    const wanted = kind === "video" ? "video/" : "image/";
    if (!file.type.startsWith(wanted)) return toast.error(kind === "video" ? "נא לבחור קובץ וידאו" : "נא לבחור קובץ תמונה");
    if (file.size > limit) return toast.error(`גודל הקובץ עד ${Math.round(limit/1024/1024)}MB`);
    setBusy(true);
    try {
      const upload = kind === "image" ? await toWebp(file) : file;
      const ext = upload.name.split(".").pop() || "jpg";
      const prefix = await resolveUploadPrefix();
      if (!prefix) throw new Error("אין הרשאה להעלות לחנות זו");
      const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, upload, { upsert: false, contentType: upload.type });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success(kind === "video" ? "הוידאו הועלה" : "התמונה הועלתה");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "שגיאה בהעלאה";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <p className="text-sm font-medium mb-1.5 text-foreground">{label}</p>
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        className="relative border-2 border-dashed border-border rounded-2xl p-4 bg-muted/30 hover:bg-muted/50 cursor-pointer transition flex flex-col items-center justify-center min-h-32 text-center"
      >
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}/>
        {value ? (
          <div className="relative">
            {kind === "video"
              ? <video src={value} className="max-h-32 rounded-xl" muted loop autoPlay playsInline/>
              : <img src={value} alt="preview" className="max-h-32 rounded-xl object-cover"/>}
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(""); }} className="absolute -top-2 -left-2 bg-destructive text-destructive-foreground rounded-full p-1">
              <X size={12}/>
            </button>
          </div>
        ) : busy ? (
          <><Loader2 className="animate-spin text-muted-foreground" /><p className="text-xs text-muted-foreground mt-2">מעלה...</p></>
        ) : (
          <><Upload className="text-muted-foreground" size={24}/><p className="text-xs text-muted-foreground mt-2">{kind === "video" ? "גרור או לחץ לבחירת וידאו" : "גרור לכאן או לחץ לבחירת תמונה"}</p></>
        )}
      </div>
    </div>
  );
}

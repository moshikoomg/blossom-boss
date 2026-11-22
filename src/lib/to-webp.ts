// Convert any browser-decodable image File to WebP via canvas.
// Falls back to the original file if conversion fails (e.g. HEIC, SVG, very large).
export async function toWebp(file: File, quality = 0.85, maxDim = 2000): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/webp" || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file).catch(() => null);
    let width: number, height: number;
    let source: CanvasImageSource;
    if (bitmap) {
      width = bitmap.width; height = bitmap.height; source = bitmap;
    } else {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = URL.createObjectURL(file);
      });
      width = img.naturalWidth; height = img.naturalHeight; source = img;
    }
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(source, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/webp", quality));
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}

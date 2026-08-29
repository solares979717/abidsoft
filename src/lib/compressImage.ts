/**
 * Shrinks a photo before it is uploaded.
 *
 * A phone camera X-ray photo is often 4–6 MB, which eats the 1 GB free
 * storage limit in a few months. Resizing to at most 2000px and re-encoding
 * as JPEG typically brings that under 500 KB with no loss of readable
 * detail — roughly ten times more files fit in the same space.
 *
 * PDFs and anything that isn't an image are returned untouched: a lab
 * report PDF is already small, and re-encoding it would damage it.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Already small enough to not be worth touching.
  if (file.size < 400 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 2000;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    if (!blob || blob.size >= file.size) return file;   // no gain, keep original

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // If anything about the browser's image handling fails, upload the
    // original rather than losing the file.
    return file;
  }
}

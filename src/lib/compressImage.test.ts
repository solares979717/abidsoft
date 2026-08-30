import { describe, it, expect, vi, afterEach } from "vitest";
import { compressImage } from "./compressImage";

function fakeFile(name: string, type: string, size: number): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("compressImage", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("leaves PDFs completely alone — re-encoding would damage a lab report", async () => {
    const pdf = fakeFile("report.pdf", "application/pdf", 5 * 1024 * 1024);
    expect(await compressImage(pdf)).toBe(pdf);
  });

  it("leaves a small image alone — nothing to gain", async () => {
    const small = fakeFile("thumb.jpg", "image/jpeg", 100 * 1024);
    expect(await compressImage(small)).toBe(small);
  });

  it("returns the original if the browser can't decode the image", async () => {
    // No createImageBitmap in this environment, so the try/catch path runs.
    const big = fakeFile("xray.jpg", "image/jpeg", 5 * 1024 * 1024);
    const out = await compressImage(big);
    expect(out).toBe(big);
  });

  it("never throws, whatever the input", async () => {
    const odd = fakeFile("weird.image", "image/tiff", 9 * 1024 * 1024);
    await expect(compressImage(odd)).resolves.toBeDefined();
  });
});

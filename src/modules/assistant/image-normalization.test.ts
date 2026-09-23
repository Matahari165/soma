import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { assistantUploadMimeType, normalizeAssistantImage } from "./image-normalization";

describe("assistant image normalization", () => {
  it("recognizes browser MIME types and HEIC filenames without a MIME type", () => {
    expect(assistantUploadMimeType({ type: "image/webp", name: "meal.webp" })).toBe("image/webp");
    expect(assistantUploadMimeType({ type: "", name: "IMG_1234.HEIC" })).toBe("image/heic");
    expect(assistantUploadMimeType({ type: "application/pdf", name: "meal.pdf" })).toBeNull();
  });

  it("converts WebP to a valid JPEG accepted by the assistant provider", async () => {
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#e85d3f" } }).webp().toBuffer();
    const result = await normalizeAssistantImage(webp, "image/webp");
    expect(result.mediaType).toBe("image/jpeg");
    const metadata = await sharp(result.data).metadata();
    expect(metadata.format).toBe("jpeg");
    expect((metadata.width ?? 0) * (metadata.height ?? 0)).toBeGreaterThanOrEqual(512);
  });

  it("rejects a file whose contents do not match its declared type", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#111111" } }).png().toBuffer();
    await expect(normalizeAssistantImage(png, "image/jpeg")).rejects.toThrow(/declared format/);
  });
});

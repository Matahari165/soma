import "server-only";

import sharp from "sharp";

export const assistantUploadMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export type AssistantUploadMimeType = typeof assistantUploadMimeTypes[number];
export type AssistantStoredMimeType = "image/jpeg" | "image/png";

const MAX_INPUT_PIXELS = 40_000_000;

export function assistantUploadMimeType(file: { type: string; name: string }): AssistantUploadMimeType | null {
  if (assistantUploadMimeTypes.includes(file.type as AssistantUploadMimeType)) return file.type as AssistantUploadMimeType;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic" || extension === "heif") return "image/heic";
  return null;
}

export async function normalizeAssistantImage(input: Buffer, declaredMimeType: AssistantUploadMimeType) {
  let pipeline = sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image dimensions are unavailable.");
  const detected = metadata.format;
  const expectedFormats: Record<AssistantUploadMimeType, string[]> = {
    "image/jpeg": ["jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/heic": ["heif"],
  };
  if (!detected || !expectedFormats[declaredMimeType].includes(detected)) throw new Error("Image content does not match its declared format.");
  if (metadata.width * metadata.height < 512) {
    const scale = Math.sqrt(512 / (metadata.width * metadata.height));
    pipeline = pipeline.resize({
      width: Math.max(1, Math.ceil(metadata.width * scale)),
      height: Math.max(1, Math.ceil(metadata.height * scale)),
      fit: "fill",
    });
  }

  if (declaredMimeType === "image/png") {
    return { data: await pipeline.png({ compressionLevel: 9 }).toBuffer(), mediaType: "image/png" as const };
  }
  return {
    data: await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer(),
    mediaType: "image/jpeg" as const,
  };
}

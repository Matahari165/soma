// Up to six photos are sent to the primary model and, when configured, to the
// validator. A readable 1024px JPEG keeps that multimodal payload comfortably
// below the Worker memory ceiling on mobile uploads and speeds up vision tiling.
const MAX_IMAGE_EDGE = 1024;
const IMAGE_QUALITY = 0.75;
const REENCODE_AFTER_BYTES = 800 * 1024;
const MAX_NORMALIZED_BYTES = 8 * 1024 * 1024;

function imageExtension(name: string) {
  const extension = name.lastIndexOf(".");
  return extension >= 0 ? name.slice(extension).toLowerCase() : "";
}

function needsJpegNormalization(file: File) {
  return file.type === "image/heic" || file.type === "image/heif" || file.type === "image/webp" || imageExtension(file.name) === ".heic" || imageExtension(file.name) === ".heif" || imageExtension(file.name) === ".webp";
}

function supportedPhoto(file: File) {
  const extension = imageExtension(file.name);
  return file.type === "image/jpeg" || file.type === "image/png" || needsJpegNormalization(file) || extension === ".jpg" || extension === ".jpeg" || extension === ".png";
}

function shouldReencode(file: File, scale: number) {
  return file.type !== "image/jpeg"
    || needsJpegNormalization(file)
    || scale < 1
    || file.size > REENCODE_AFTER_BYTES;
}

async function decodeImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall back to the browser image decoder when createImageBitmap cannot read HEIC.
    }
  }
  if (typeof window === "undefined") throw new Error("Cette image ne peut pas être lue ici.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = "async";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Image illisible"));
      element.src = objectUrl;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function normalizeMealImage(file: File) {
  if (!supportedPhoto(file)) throw new Error("Ce format photo n’est pas compatible. Prends une nouvelle photo en JPEG ou PNG.");
  if (typeof document === "undefined") throw new Error("La conversion photo est disponible dans le navigateur.");
  const decoded = await decodeImage(file).catch(() => null);
  if (!decoded || decoded.width <= 0 || decoded.height <= 0) throw new Error("Cette photo n’a pas pu être lue. Prends-la à nouveau en JPEG ou PNG.");
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(decoded.width, decoded.height));
  if (!shouldReencode(file, scale)) {
    decoded.close?.();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(decoded.width * scale));
  canvas.height = Math.max(1, Math.round(decoded.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    decoded.close?.();
    throw new Error("La conversion photo n’est pas disponible. Prends-la à nouveau en JPEG ou PNG.");
  }
  context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
  decoded.close?.();
  const mimeType = "image/jpeg";
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, IMAGE_QUALITY));
  if (!blob) throw new Error("Cette photo n’a pas pu être convertie. Prends-la à nouveau en JPEG ou PNG.");
  if (blob.size > MAX_NORMALIZED_BYTES) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, 0.62));
  }
  if (!blob || blob.size > MAX_NORMALIZED_BYTES) throw new Error("Cette photo est trop lourde après conversion. Choisis une photo plus légère.");
  const baseName = file.name.replace(/\.[^.]+$/, "") || "repas";
  return new File([blob], `${baseName}.jpg`, { type: mimeType, lastModified: file.lastModified });
}

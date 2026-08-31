import { MAX_MEAL_MULTIPART_BYTES } from "@/domain/meals";

export class MealMultipartError extends Error {
  constructor(readonly code: "invalid" | "too_large", message: string) {
    super(message);
    this.name = "MealMultipartError";
  }
}

/**
 * Parse a meal upload with a hard byte ceiling before multipart parsing can
 * materialise arbitrarily large files in memory. Content-Length is only an
 * early fast path; the stream is still counted for chunked requests.
 */
export async function parseMealMultipart(request: Request, limit = MAX_MEAL_MULTIPART_BYTES) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new MealMultipartError("invalid", "Send the meal photos as multipart form data.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new MealMultipartError("too_large", "The selected photos are too large together.");
  }

  if (!request.body) throw new MealMultipartError("invalid", "Send the meal photos as multipart form data.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new Uint8Array(value);
      total += chunk.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new MealMultipartError("too_large", "The selected photos are too large together.");
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const rebuiltRequest = new Request(request.url, { method: "POST", headers: { "Content-Type": contentType }, body });
    return await rebuiltRequest.formData();
  } catch {
    throw new MealMultipartError("invalid", "Send the meal photos as multipart form data.");
  }
}

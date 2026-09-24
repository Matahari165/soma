import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 90;

const MODEL = "gpt-transcribe";
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const noStore = { "Cache-Control": "private, no-store" };
const mediaTypes = new Map([
  ["audio/webm", "webm"],
  ["audio/mp4", "mp4"],
  ["audio/mpeg", "mp3"],
  ["audio/wav", "wav"],
]);

function error(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, message, code }, { status, headers: noStore });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Authentification requise.", "unauthorized", 401);

  const apiKey = process.env.OPENAI_TRANSCRIPTION_API_KEY;
  if (!apiKey?.trim()) return error("La dictée est momentanément indisponible.", "transcription_not_configured", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("L’enregistrement est invalide.", "invalid_audio", 400);
  }
  const files = form.getAll("file");
  const file = files.length === 1 ? files[0] : null;
  if (!(file instanceof File) || !file.size) return error("Aucun enregistrement audio valide.", "invalid_audio", 400);
  if (file.size > MAX_AUDIO_BYTES) return error("L’enregistrement dépasse 4 Mo. Essaie une note plus courte.", "audio_too_large", 413);
  const mediaType = file.type.split(";")[0]?.toLowerCase();
  const extension = mediaType ? mediaTypes.get(mediaType) : null;
  if (!extension) return error("Format audio non pris en charge.", "unsupported_audio", 415);

  const upload = new FormData();
  upload.set("model", MODEL);
  upload.append("languages[]", "fr");
  upload.set("file", new File([await file.arrayBuffer()], `dictee.${extension}`, { type: mediaType }));

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upload,
      signal: AbortSignal.timeout(75_000),
      cache: "no-store",
    });
    if (!response.ok) return error("La transcription a échoué. Réessaie.", "transcription_failed", 502);
    const payload: unknown = await response.json();
    const text = payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string"
      ? payload.text.trim()
      : "";
    if (!text) return error("Aucune parole n’a été reconnue. Réessaie.", "empty_transcription", 422);
    if (text.length > 50_000) return error("La transcription est trop longue pour un message.", "transcription_too_long", 413);
    return NextResponse.json({ text }, { headers: noStore });
  } catch {
    return error("La transcription a échoué. Réessaie.", "transcription_failed", 502);
  }
}

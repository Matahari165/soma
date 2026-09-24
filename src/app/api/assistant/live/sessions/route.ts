import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isAssistantLiveOriginAllowed } from "@/lib/assistant-live-origin";
import { AssistantLiveError, createAssistantLiveSession } from "@/modules/assistant/live-session";

export const runtime = "nodejs";
export const maxDuration = 45;

const noStore = { "Cache-Control": "private, no-store" };
const maxBodyBytes = 128 * 1024;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "unauthorized", message: "Authentication required." }, { status: 401, headers: noStore });
  if (!isAssistantLiveOriginAllowed(request)) return NextResponse.json({ code: "invalid_origin", message: "Origine non autorisée." }, { status: 403, headers: noStore });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ code: "invalid_request", message: "Le corps JSON est requis." }, { status: 415, headers: noStore });
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    return NextResponse.json({ code: "invalid_request", message: "L’offre WebRTC est trop volumineuse." }, { status: 413, headers: noStore });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ code: "invalid_request", message: "Le corps de la demande est invalide." }, { status: 400, headers: noStore });
  }
  if (Buffer.byteLength(rawBody, "utf8") > maxBodyBytes) {
    return NextResponse.json({ code: "invalid_request", message: "L’offre WebRTC est trop volumineuse." }, { status: 413, headers: noStore });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ code: "invalid_request", message: "Le corps JSON est invalide." }, { status: 400, headers: noStore });
  }

  try {
    return NextResponse.json(await createAssistantLiveSession(user.id, body), { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ code: "invalid_request", message: "La demande vocale est invalide." }, { status: 400, headers: noStore });
    if (error instanceof AssistantLiveError) return NextResponse.json({ code: error.code, message: error.message }, { status: error.status, headers: noStore });
    return NextResponse.json({ code: "assistant_live_session_failed", message: "Impossible de démarrer la session vocale." }, { status: 500, headers: noStore });
  }
}

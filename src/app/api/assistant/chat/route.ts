import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { PreviewChatError, respondToPreviewChat } from "@/modules/assistant/local-preview-chat";
import { AssistantResponseError, respondToAssistant } from "@/modules/assistant/respond";

export const runtime = "nodejs";
export const maxDuration = 120;

const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", message: "Authentication required.", code: "unauthorized" }, { status: 401, headers: noStore });
  if (isLocalPreviewMode()) {
    const origin = request.headers.get("Origin");
    const localHost = (value: string) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
    if (origin && !localHost(origin)) {
      return NextResponse.json({ error: "Origine non autorisée.", message: "Origine non autorisée.", code: "invalid_origin" }, { status: 403, headers: noStore });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Le corps JSON est invalide.", message: "Le corps JSON est invalide.", code: "invalid_request" }, { status: 400, headers: noStore });
  }

  const requestId = request.headers.get("Idempotency-Key");
  if (requestId && body && typeof body === "object") body = { ...body, requestId };
  try {
    if (isLocalPreviewMode()) return NextResponse.json(await respondToPreviewChat(body), { status: 201, headers: noStore });
    return NextResponse.json(await respondToAssistant(user.id, body), { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "La demande assistant est invalide.", message: "La demande assistant est invalide.", code: "invalid_request" }, { status: 400, headers: noStore });
    if (error instanceof PreviewChatError) return NextResponse.json({ error: error.message, message: error.message, code: error.code }, { status: error.status, headers: noStore });
    if (error instanceof AssistantResponseError) return NextResponse.json({ error: error.message, message: error.message, code: error.code }, { status: error.status, headers: noStore });
    return NextResponse.json({ error: "L’assistant Soma est momentanément indisponible.", message: "L’assistant Soma est momentanément indisponible.", code: "assistant_unavailable" }, { status: 500, headers: noStore });
  }
}

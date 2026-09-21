import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { AssistantResponseError, respondToAssistant } from "@/modules/assistant/respond";

export const runtime = "nodejs";
export const maxDuration = 120;

const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", message: "Authentication required.", code: "unauthorized" }, { status: 401, headers: noStore });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Le corps JSON est invalide.", message: "Le corps JSON est invalide.", code: "invalid_request" }, { status: 400, headers: noStore });
  }

  const requestId = request.headers.get("Idempotency-Key");
  if (requestId && body && typeof body === "object") body = { ...body, requestId };
  try {
    return NextResponse.json(await respondToAssistant(user.id, body), { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "La demande assistant est invalide.", message: "La demande assistant est invalide.", code: "invalid_request" }, { status: 400, headers: noStore });
    if (error instanceof AssistantResponseError) return NextResponse.json({ error: error.message, message: error.message, code: error.code }, { status: error.status, headers: noStore });
    return NextResponse.json({ error: "L’assistant Soma est momentanément indisponible.", message: "L’assistant Soma est momentanément indisponible.", code: "assistant_unavailable" }, { status: 500, headers: noStore });
  }
}

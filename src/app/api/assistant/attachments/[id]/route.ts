import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { deleteR2AssistantAttachment, getR2AssistantAttachment } from "@/lib/r2";
import { deleteAssistantAttachmentMetadata, findAssistantAttachment } from "@/modules/assistant/repository";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

async function ownedAttachment(userId: string, value: string) {
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? findAssistantAttachment(userId, parsed.data) : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Authentification requise." }, { status: 401, headers: noStore });
  const attachment = await ownedAttachment(user.id, (await context.params).id);
  if (!attachment || attachment.status === "deleted") return NextResponse.json({ error: "attachment_not_found", message: "Photo introuvable." }, { status: 404, headers: noStore });
  const object = await getR2AssistantAttachment(attachment.object_path);
  if (!object?.body) return NextResponse.json({ error: "attachment_not_found", message: "Photo introuvable." }, { status: 404, headers: noStore });
  return new Response(object.body, { headers: { ...noStore, "Content-Type": attachment.media_type } });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Authentification requise." }, { status: 401, headers: noStore });
  const attachment = await ownedAttachment(user.id, (await context.params).id);
  if (!attachment) return NextResponse.json({ error: "attachment_not_found", message: "Photo introuvable." }, { status: 404, headers: noStore });
  try {
    await deleteR2AssistantAttachment(attachment.object_path);
    await deleteAssistantAttachmentMetadata(user.id, attachment.id);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "attachment_delete_failed", message: "La photo n’a pas pu être supprimée." }, { status: 503, headers: noStore });
  }
}

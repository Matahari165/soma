import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { assistantAttachmentObjectPath, deleteR2AssistantAttachment, putR2AssistantAttachment } from "@/lib/r2";
import {
  createAssistantAttachment,
  deleteAssistantAttachmentMetadata,
  findAssistantConversation,
} from "@/modules/assistant/repository";
import { assistantUploadMimeType, normalizeAssistantImage } from "@/modules/assistant/image-normalization";
import { MealMultipartError, parseMealMultipart } from "@/services/meal-multipart";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const conversationIdSchema = z.uuid();
const maxFiles = 4;
const maxFileBytes = 4 * 1024 * 1024;
const maxTotalBytes = 4 * 1024 * 1024;

function publicAttachment(row: Awaited<ReturnType<typeof createAssistantAttachment>>) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    purpose: row.purpose,
    status: row.status,
    createdAt: row.created_at,
    url: `/api/assistant/attachments/${encodeURIComponent(row.id)}`,
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Authentification requise." }, { status: 401, headers: noStore });

  let form: FormData;
  try {
    form = await parseMealMultipart(request);
  } catch (error) {
    const tooLarge = error instanceof MealMultipartError && error.code === "too_large";
    return NextResponse.json(
      { error: tooLarge ? "attachments_too_large" : "invalid_multipart", message: tooLarge ? "Les photos sont trop volumineuses." : "Envoie les photos au format multipart." },
      { status: tooLarge ? 413 : 400, headers: noStore },
    );
  }

  const parsedConversationId = conversationIdSchema.safeParse(form.get("conversationId"));
  if (!parsedConversationId.success) return NextResponse.json({ error: "invalid_conversation", message: "Conversation invalide." }, { status: 400, headers: noStore });
  const conversation = await findAssistantConversation(user.id, parsedConversationId.data);
  if (!conversation) return NextResponse.json({ error: "conversation_not_found", message: "Conversation introuvable." }, { status: 404, headers: noStore });

  const files = form.getAll("files").filter((value): value is File => typeof File !== "undefined" && value instanceof File);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (!files.length || files.length > maxFiles) return NextResponse.json({ error: "invalid_attachment_count", message: `Ajoute entre 1 et ${maxFiles} photos.` }, { status: 400, headers: noStore });
  if (files.some((file) => !assistantUploadMimeType(file) || file.size < 1 || file.size > maxFileBytes) || totalBytes > maxTotalBytes) {
    return NextResponse.json({ error: "invalid_attachment", message: "Utilise des images JPEG, PNG, WebP ou HEIC pour un total maximal de 4 Mo." }, { status: 400, headers: noStore });
  }

  const stored: Array<{ row: Awaited<ReturnType<typeof createAssistantAttachment>>; objectPath: string }> = [];
  try {
    for (const file of files) {
      const attachmentId = crypto.randomUUID();
      const inputMimeType = assistantUploadMimeType(file);
      if (!inputMimeType) throw new Error("Unsupported assistant image type.");
      const normalized = await normalizeAssistantImage(Buffer.from(await file.arrayBuffer()), inputMimeType);
      if (normalized.data.byteLength > maxFileBytes) throw new Error("Normalized assistant image is too large.");
      const objectPath = assistantAttachmentObjectPath({ userId: user.id, conversationId: conversation.id, attachmentId, mimeType: normalized.mediaType });
      await putR2AssistantAttachment(objectPath, normalized.data.buffer.slice(normalized.data.byteOffset, normalized.data.byteOffset + normalized.data.byteLength), normalized.mediaType);
      try {
        const row = await createAssistantAttachment({
          userId: user.id,
          conversationId: conversation.id,
          objectPath,
          mediaType: normalized.mediaType,
          byteSize: normalized.data.byteLength,
          sha256: createHash("sha256").update(normalized.data).digest("hex"),
          purpose: "context",
        });
        stored.push({ row, objectPath });
      } catch (error) {
        await deleteR2AssistantAttachment(objectPath).catch(() => undefined);
        throw error;
      }
    }
    return NextResponse.json({ attachments: stored.map(({ row }) => publicAttachment(row)) }, { status: 201, headers: noStore });
  } catch {
    await Promise.all(stored.map(async ({ row, objectPath }) => {
      await deleteR2AssistantAttachment(objectPath).catch(() => undefined);
      await deleteAssistantAttachmentMetadata(user.id, row.id).catch(() => undefined);
    }));
    return NextResponse.json({ error: "attachment_upload_failed", message: "Les photos n’ont pas pu être enregistrées." }, { status: 503, headers: noStore });
  }
}

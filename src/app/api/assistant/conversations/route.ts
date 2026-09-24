import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { deleteR2AssistantAttachment } from "@/lib/r2";
import { createPreviewConversation, deletePreviewConversation, getPreviewConversation, listPreviewConversations } from "@/modules/assistant/local-preview-chat";
import {
  createAssistantConversation,
  deleteAssistantConversation,
  findAssistantConversation,
  listAssistantAttachments,
  listAssistantConversations,
  listAssistantMessages,
} from "@/modules/assistant/repository";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const createSchema = z.object({ title: z.string().trim().min(1).max(160).nullable().optional() });

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", code: "unauthorized" }, { status: 401, headers: noStore });
  const searchParams = new URL(request.url).searchParams;
  const conversationId = searchParams.get("conversationId");
  if (isLocalPreviewMode()) {
    if (conversationId) {
      const conversation = getPreviewConversation(conversationId);
      if (!conversation) return NextResponse.json({ error: "Conversation introuvable.", code: "conversation_not_found" }, { status: 404, headers: noStore });
      return NextResponse.json({ conversation, messages: conversation.messages, preview: true }, { headers: noStore });
    }
    return NextResponse.json({ conversations: listPreviewConversations(), preview: true }, { headers: noStore });
  }
  if (conversationId) {
    const parsedId = z.uuid().safeParse(conversationId);
    if (!parsedId.success) return NextResponse.json({ error: "La conversation est invalide.", code: "invalid_request" }, { status: 400, headers: noStore });
    const conversation = await findAssistantConversation(user.id, parsedId.data);
    if (!conversation) return NextResponse.json({ error: "Conversation introuvable.", code: "conversation_not_found" }, { status: 404, headers: noStore });
    const messages = await listAssistantMessages(user.id, conversation.id);
    return NextResponse.json({ conversation, messages }, { headers: noStore });
  }
  const limitValue = searchParams.get("limit");
  const limit = limitValue ? Number(limitValue) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return NextResponse.json({ error: "La limite est invalide.", code: "invalid_request" }, { status: 400, headers: noStore });
  return NextResponse.json({ conversations: await listAssistantConversations(user.id, limit) }, { headers: noStore });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", code: "unauthorized" }, { status: 401, headers: noStore });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Le corps JSON est invalide.", code: "invalid_request" }, { status: 400, headers: noStore });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "La conversation est invalide.", code: "invalid_request" }, { status: 400, headers: noStore });
  if (isLocalPreviewMode()) {
    return NextResponse.json({ conversation: createPreviewConversation(parsed.data.title ?? null), preview: true }, { status: 201, headers: noStore });
  }
  const conversation = await createAssistantConversation(user.id, parsed.data.title ?? null);
  return NextResponse.json({ conversation }, { status: 201, headers: noStore });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", code: "unauthorized" }, { status: 401, headers: noStore });
  const parsedId = z.uuid().safeParse(new URL(request.url).searchParams.get("conversationId"));
  if (!parsedId.success) return NextResponse.json({ error: "La conversation est invalide.", code: "invalid_request" }, { status: 400, headers: noStore });
  if (isLocalPreviewMode()) return NextResponse.json({ deleted: deletePreviewConversation(parsedId.data), preview: true }, { headers: noStore });

  const conversation = await findAssistantConversation(user.id, parsedId.data);
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable.", code: "conversation_not_found" }, { status: 404, headers: noStore });

  let offset = 0;
  while (true) {
    const attachments = await listAssistantAttachments(user.id, conversation.id, 100, offset);
    if (!attachments.length) break;
    await Promise.all(attachments.map((attachment) => deleteR2AssistantAttachment(attachment.object_path)));
    offset += attachments.length;
    if (attachments.length < 100) break;
  }
  await deleteAssistantConversation(user.id, conversation.id);
  return NextResponse.json({ deleted: true }, { headers: noStore });
}

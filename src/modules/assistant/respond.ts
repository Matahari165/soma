import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";
import { getR2AssistantAttachment } from "@/lib/r2";

import { createSomaAssistantAgent, SOMA_ASSISTANT_MODEL, SOMA_ASSISTANT_PROVIDER, type SomaAssistantAgent } from "./agent";
import { classifyAssistantQuality } from "./policy";
import { dataSummaryFromSteps } from "./evidence-summary";
import {
  ASSISTANT_COMPACTION_RECENT_MESSAGES,
  ASSISTANT_COMPACTION_TRIGGER_MESSAGES,
  createConversationSummary,
  modelHistory,
  recentWindowFitsBudget,
  storedConversationSummaryNeedsRebuild,
} from "./conversation-memory";
import { SOMA_ASSISTANT_PROMPT_VERSION } from "./prompt";
import {
  appendAssistantMessage,
  attachAssistantAttachmentToMessage,
  createAssistantConversation,
  createAssistantRun,
  findAssistantConversation,
  findAssistantAttachment,
  findAssistantMessage,
  findAssistantRunByRequestId,
  forkAssistantConversationAtMessage,
  listAssistantMessages,
  updateAssistantConversation,
  updateAssistantRun,
} from "./repository";

const requestSchema = z.object({
  conversationId: z.uuid().nullable().default(null),
  requestId: z.string().trim().min(8).max(200),
  text: z.string().trim().min(1).max(50_000),
  attachmentIds: z.array(z.uuid()).max(4).default([]),
  editMessageId: z.uuid().optional(),
}).superRefine((input, context) => {
  if (input.editMessageId && !input.conversationId) {
    context.addIssue({ code: "custom", path: ["conversationId"], message: "Une conversation est requise pour modifier un message." });
  }
});

export class AssistantResponseError extends Error {
  constructor(
    public readonly code: "assistant_not_configured" | "conversation_not_found" | "assistant_attachment_invalid" | "assistant_request_in_progress" | "assistant_request_failed" | "assistant_generation_failed",
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AssistantResponseError";
  }
}

type Dependencies = {
  createAgent: typeof createSomaAssistantAgent;
  repository: {
    appendMessage: typeof appendAssistantMessage;
    attachAttachmentToMessage: typeof attachAssistantAttachmentToMessage;
    createConversation: typeof createAssistantConversation;
    createRun: typeof createAssistantRun;
    findConversation: typeof findAssistantConversation;
    findAttachment: typeof findAssistantAttachment;
    findMessage: typeof findAssistantMessage;
    findRunByRequestId: typeof findAssistantRunByRequestId;
    forkConversationAtMessage: typeof forkAssistantConversationAtMessage;
    listMessages: typeof listAssistantMessages;
    updateConversation: typeof updateAssistantConversation;
    updateRun: typeof updateAssistantRun;
    loadAttachment: typeof getR2AssistantAttachment;
  };
};

const dependencies: Dependencies = {
  createAgent: createSomaAssistantAgent,
  repository: {
    appendMessage: appendAssistantMessage,
    attachAttachmentToMessage: attachAssistantAttachmentToMessage,
    createConversation: createAssistantConversation,
    createRun: createAssistantRun,
    findConversation: findAssistantConversation,
    findAttachment: findAssistantAttachment,
    findMessage: findAssistantMessage,
    findRunByRequestId: findAssistantRunByRequestId,
    forkConversationAtMessage: forkAssistantConversationAtMessage,
    listMessages: listAssistantMessages,
    updateConversation: updateAssistantConversation,
    updateRun: updateAssistantRun,
    loadAttachment: getR2AssistantAttachment,
  },
};

function textFromParts(parts: unknown) {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((part): part is { type: "text"; text: string } => Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string"))
    .map((part) => part.text)
    .join("\n\n");
}

function attachmentIdsFromParts(parts: unknown) {
  if (!Array.isArray(parts)) return [];
  return parts.flatMap((part) => part && typeof part === "object"
    && (part as { type?: unknown }).type === "attachment"
    && typeof (part as { attachmentId?: unknown }).attachmentId === "string"
    ? [(part as { attachmentId: string }).attachmentId]
    : []);
}

function conversationTitle(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 76 ? `${compact.slice(0, 73).trimEnd()}…` : compact;
}

async function compactConversation(
  userId: string,
  conversation: NonNullable<Awaited<ReturnType<typeof findAssistantConversation>>>,
  latestSequence: number,
  repository: Dependencies["repository"],
  force = false,
) {
  const rebuildLegacy = storedConversationSummaryNeedsRebuild(conversation.summary, conversation.summary_through_sequence);
  if (!force && !rebuildLegacy && latestSequence <= conversation.summary_through_sequence + ASSISTANT_COMPACTION_TRIGGER_MESSAGES) {
    return { state: "current" as const, complete: true, retryOnNextMessage: false, throughSequence: conversation.summary_through_sequence, summary: conversation.summary, usedFallback: false };
  }
  const through = Math.max(0, latestSequence - (force ? 1 : ASSISTANT_COMPACTION_RECENT_MESSAGES));
  if (through <= conversation.summary_through_sequence && !rebuildLegacy) {
    return { state: "current" as const, complete: true, retryOnNextMessage: false, throughSequence: conversation.summary_through_sequence, summary: conversation.summary, usedFallback: false };
  }
  const rows = await repository.listMessages(userId, conversation.id, rebuildLegacy ? 0 : conversation.summary_through_sequence);
  if (through <= 0) return { state: "current" as const, complete: true, retryOnNextMessage: false, throughSequence: conversation.summary_through_sequence, summary: conversation.summary, usedFallback: false };
  const compacted = await createConversationSummary({
    storedSummary: conversation.summary,
    summaryThroughSequence: conversation.summary_through_sequence,
    throughSequence: through,
    rows,
  });
  await repository.updateConversation(userId, conversation.id, {
    summary: compacted.serialized,
    summary_through_sequence: compacted.throughSequence,
  });
  return {
    state: "updated" as const,
    complete: true,
    retryOnNextMessage: false,
    throughSequence: compacted.throughSequence,
    summary: compacted.serialized,
    usedFallback: compacted.usedFallback,
  };
}

function publicMemoryStatus(status: {
  state: "current" | "updated" | "retry_pending";
  complete: boolean;
  retryOnNextMessage: boolean;
  throughSequence: number;
  usedFallback: boolean;
}) {
  return {
    state: status.state,
    complete: status.complete,
    retryOnNextMessage: status.retryOnNextMessage,
    throughSequence: status.throughSequence,
    warning: status.complete ? null : "Une partie de l’historique ancien n’a pas pu être résumée. L’agent garde une fenêtre récente bornée et réessaiera au prochain message.",
  };
}

function publicMessage(row: Awaited<ReturnType<typeof appendAssistantMessage>>) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sequence: row.sequence,
    role: row.role,
    parts: row.parts,
    status: row.status,
    createdAt: row.created_at,
  };
}

function publicRun(row: { id: string; status: string; quality?: string; provider?: string | null; model?: string | null; error_code?: string | null }) {
  return {
    id: row.id,
    status: row.status,
    quality: row.quality ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    errorCode: row.error_code ?? null,
  };
}

function idempotentMessageId(userId: string, requestId: string) {
  const hex = createHash("sha256").update(`${userId}\0${requestId}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function respondToAssistant(
  userId: string,
  rawInput: unknown,
  options: { apiKey?: string; dependencies?: Dependencies } = {},
) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new AssistantResponseError("assistant_not_configured", 503, "L’assistant Soma n’est pas configuré.");
  }
  const input = requestSchema.parse(rawInput);
  const deps = options.dependencies ?? dependencies;
  const existingRun = await deps.repository.findRunByRequestId(userId, input.requestId);
  if (existingRun) {
    if (existingRun.status === "completed" && existingRun.output_message_id) {
      const [userMessage, output] = await Promise.all([
        existingRun.triggering_message_id ? deps.repository.findMessage(userId, existingRun.triggering_message_id) : null,
        deps.repository.findMessage(userId, existingRun.output_message_id),
      ]);
      if (userMessage && output) {
        const persistedAttachmentIds = attachmentIdsFromParts(userMessage.parts);
        if ((!input.editMessageId && existingRun.conversation_id !== input.conversationId)
          || textFromParts(userMessage.parts) !== input.text
          || persistedAttachmentIds.length !== input.attachmentIds.length
          || persistedAttachmentIds.some((id, index) => id !== input.attachmentIds[index])) {
          throw new AssistantResponseError("assistant_request_failed", 409, "Cette clé d’idempotence a déjà été utilisée pour une autre demande.");
        }
        return {
          conversationId: existingRun.conversation_id,
          userMessage: publicMessage(userMessage),
          assistantMessage: publicMessage(output),
          run: publicRun(existingRun),
          memoryStatus: null,
          replayed: true,
        };
      }
    }
    if (existingRun.status === "queued" || existingRun.status === "running") {
      throw new AssistantResponseError("assistant_request_in_progress", 409, "Cette demande est déjà en cours.");
    }
    throw new AssistantResponseError("assistant_request_failed", 409, "Cette clé d’idempotence correspond à une demande déjà terminée en erreur.");
  }

  const conversation = input.editMessageId && input.conversationId
    ? await deps.repository.forkConversationAtMessage({ userId, conversationId: input.conversationId, messageId: input.editMessageId })
    : input.conversationId
      ? await deps.repository.findConversation(userId, input.conversationId)
      : await deps.repository.createConversation(userId);
  if (!conversation) throw new AssistantResponseError("conversation_not_found", 404, "Conversation introuvable.");

  if (new Set(input.attachmentIds).size !== input.attachmentIds.length) {
    throw new AssistantResponseError("assistant_attachment_invalid", 400, "Une même photo ne peut être jointe qu’une fois.");
  }
  const userMessageId = idempotentMessageId(userId, input.requestId);
  const attachmentIds = input.attachmentIds;
  const attachments = await Promise.all(attachmentIds.map((attachmentId) => deps.repository.findAttachment(userId, attachmentId)));
  if (attachments.some((attachment) => !attachment
    || attachment.conversation_id !== conversation.id
    || (attachment.message_id !== null && attachment.message_id !== userMessageId)
    || attachment.status !== "available"
    || (attachment.media_type !== "image/jpeg" && attachment.media_type !== "image/png"))) {
    throw new AssistantResponseError("assistant_attachment_invalid", 400, "Une photo jointe est invalide, indisponible ou n’appartient pas à cette conversation.");
  }
  const ownedAttachments = attachments.filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment));
  if (ownedAttachments.reduce((total, attachment) => total + attachment.byte_size, 0) > 40 * 1024 * 1024) {
    throw new AssistantResponseError("assistant_attachment_invalid", 413, "Les photos jointes dépassent 40 Mo au total.");
  }

  let userMessage = await deps.repository.findMessage(userId, userMessageId);
  if (!userMessage) {
    try {
      userMessage = await deps.repository.appendMessage({
        userId,
        conversationId: conversation.id,
        role: "user",
        parts: [
          { type: "text", text: input.text },
          ...ownedAttachments.map((attachment) => ({ type: "attachment" as const, attachmentId: attachment.id, mediaType: attachment.media_type })),
        ],
        id: userMessageId,
      });
    } catch (error) {
      userMessage = await deps.repository.findMessage(userId, userMessageId);
      if (!userMessage) throw error;
    }
  }
  if (userMessage.conversation_id !== conversation.id || textFromParts(userMessage.parts) !== input.text) {
    throw new AssistantResponseError("assistant_request_failed", 409, "Cette clé d’idempotence a déjà été utilisée pour une autre demande.");
  }
  const persistedAttachmentIds = attachmentIdsFromParts(userMessage.parts);
  if (persistedAttachmentIds.length !== attachmentIds.length || persistedAttachmentIds.some((id, index) => id !== attachmentIds[index])) {
    throw new AssistantResponseError("assistant_request_failed", 409, "Cette clé d’idempotence a déjà été utilisée avec d’autres pièces jointes.");
  }
  await Promise.all(ownedAttachments.map((attachment) => deps.repository.attachAttachmentToMessage(
    userId,
    conversation.id,
    attachment.id,
    userMessage.id,
  )));
  if (!conversation.title) {
    await deps.repository.updateConversation(userId, conversation.id, { title: conversationTitle(input.text) }).catch(() => undefined);
  }
  const quality = classifyAssistantQuality({ text: input.text, attachmentCount: ownedAttachments.length });
  let run;
  try {
    run = await deps.repository.createRun({
      userId,
      conversationId: conversation.id,
      triggeringMessageId: userMessage.id,
      requestId: input.requestId,
      quality,
      model: SOMA_ASSISTANT_MODEL,
      promptVersion: SOMA_ASSISTANT_PROMPT_VERSION,
    });
  } catch (error) {
    const racedRun = await deps.repository.findRunByRequestId(userId, input.requestId);
    if (racedRun) throw new AssistantResponseError("assistant_request_in_progress", 409, "Cette demande est déjà en cours.");
    throw error;
  }
  await deps.repository.updateRun(userId, run.id, {
    status: "running",
    provider: SOMA_ASSISTANT_PROVIDER,
    started_at: new Date().toISOString(),
  });

  try {
    let memoryState: { state: "current" | "updated" | "retry_pending"; complete: boolean; retryOnNextMessage: boolean; throughSequence: number; summary: string | null; usedFallback: boolean };
    try {
      memoryState = await compactConversation(userId, conversation, userMessage.sequence, deps.repository);
    } catch {
      memoryState = {
        state: "retry_pending",
        complete: false,
        retryOnNextMessage: true,
        throughSequence: conversation.summary_through_sequence,
        summary: conversation.summary,
        usedFallback: false,
      };
    }
    let rebuildLegacy = storedConversationSummaryNeedsRebuild(memoryState.summary, memoryState.throughSequence);
    let messageRows = await deps.repository.listMessages(userId, conversation.id, rebuildLegacy ? 0 : memoryState.throughSequence);
    let historyRows = messageRows.filter((message) => message.id !== userMessage.id);
    if (memoryState.complete && !recentWindowFitsBudget(historyRows, rebuildLegacy ? null : memoryState.summary)) {
      const previousMemoryState = memoryState;
      try {
        memoryState = await compactConversation(userId, {
          ...conversation,
          summary: memoryState.summary,
          summary_through_sequence: memoryState.throughSequence,
        }, userMessage.sequence, deps.repository, true);
        rebuildLegacy = storedConversationSummaryNeedsRebuild(memoryState.summary, memoryState.throughSequence);
        messageRows = await deps.repository.listMessages(userId, conversation.id, rebuildLegacy ? 0 : memoryState.throughSequence);
        historyRows = messageRows.filter((message) => message.id !== userMessage.id);
      } catch {
        memoryState = {
          state: "retry_pending",
          complete: false,
          retryOnNextMessage: true,
          throughSequence: previousMemoryState.throughSequence,
          summary: previousMemoryState.summary,
          usedFallback: previousMemoryState.usedFallback,
        };
      }
    }
    const historyFits = recentWindowFitsBudget(historyRows, rebuildLegacy ? null : memoryState.summary);
    if (!historyFits && memoryState.complete) {
      memoryState = { ...memoryState, state: "retry_pending", complete: false, retryOnNextMessage: true };
    }
    const history = modelHistory(historyRows, rebuildLegacy ? null : memoryState.summary);
    if (!memoryState.complete || !historyFits) {
      history.push({
        role: "user",
        content: "Note de contexte : la préparation de la mémoire historique est en attente de reprise. La fenêtre récente est bornée et peut ne pas couvrir les anciens échanges; utilise searchConversation avant d'affirmer qu'un ancien détail est introuvable.",
      });
    }
    const imageParts = await Promise.all(ownedAttachments.map(async (attachment) => {
      const object = await deps.repository.loadAttachment(attachment.object_path);
      if (!object) throw new Error("An assistant attachment is no longer available.");
      const bytes = new Uint8Array(await object.arrayBuffer());
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== attachment.byte_size || digest !== attachment.sha256) {
        throw new Error("An assistant attachment failed its integrity check.");
      }
      return { type: "file" as const, data: bytes, mediaType: attachment.media_type };
    }));
    history.push({ role: "user", content: imageParts.length ? [{ type: "text", text: input.text }, ...imageParts] : input.text });
    const agent: SomaAssistantAgent = deps.createAgent({
      userId,
      runId: run.id,
      quality,
      triggeringMessageId: userMessage.id,
      triggeringUserText: input.text,
      conversationId: conversation.id,
    });
    const result = await agent.generate({ messages: history, timeout: 90_000 });
    const text = result.text.trim();
    if (!text) throw new Error("The assistant returned an empty response.");
    const dataSummary = dataSummaryFromSteps(result.steps);
    const assistantMessage = await deps.repository.appendMessage({
      userId,
      conversationId: conversation.id,
      role: "assistant",
      parts: [{ type: "text", text }, ...(dataSummary ? [dataSummary] : [])],
      parentMessageId: userMessage.id,
    });
    await deps.repository.updateRun(userId, run.id, {
      status: "completed",
      output_message_id: assistantMessage.id,
      usage: result.totalUsage,
      finish_reason: result.finishReason,
      completed_at: new Date().toISOString(),
    });
    return {
      conversationId: conversation.id,
      userMessage: publicMessage(userMessage),
      assistantMessage: publicMessage(assistantMessage),
      run: publicRun({ ...run, status: "completed", provider: SOMA_ASSISTANT_PROVIDER, model: SOMA_ASSISTANT_MODEL }),
      memoryStatus: publicMemoryStatus(memoryState),
      replayed: false,
    };
  } catch (error) {
    await deps.repository.updateRun(userId, run.id, {
      status: "failed",
      error_code: "assistant_generation_failed",
      completed_at: new Date().toISOString(),
    });
    throw new AssistantResponseError(
      "assistant_generation_failed",
      502,
      error instanceof Error && error.message === "The assistant returned an empty response."
        ? "L’assistant a renvoyé une réponse vide."
        : "L’assistant Soma est momentanément indisponible.",
    );
  }
}

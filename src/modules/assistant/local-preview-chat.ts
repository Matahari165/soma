import "server-only";

import { openai } from "@ai-sdk/openai";
import { generateText, type ModelMessage } from "ai";
import { z } from "zod";

import { previewDashboard } from "@/lib/local-preview";

import { SOMA_ASSISTANT_MODEL } from "./agent";
import { previewRunningContext } from "./preview-running";

type PreviewMessage = {
  id: string;
  conversationId: string;
  sequence: number;
  role: "user" | "assistant";
  parts: [{ type: "text"; text: string }];
  status: "completed";
  createdAt: string;
};

type PreviewConversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  messages: PreviewMessage[];
};

const inputSchema = z.object({
  conversationId: z.uuid(),
  requestId: z.string().min(8).max(200),
  text: z.string().trim().min(1).max(10_000),
  attachmentIds: z.array(z.string()).max(4).optional(),
  editMessageId: z.uuid().optional(),
});

const previewState = globalThis as typeof globalThis & {
  somaAssistantPreview?: { conversations: Map<string, PreviewConversation>; inFlight: Set<string>; requests: Map<string, { conversationId: string; text: string; response: PreviewChatResponse }> };
};

type PreviewChatResponse = { conversationId: string; userMessage: PreviewMessage; assistantMessage: PreviewMessage; preview: true };

function state() {
  return previewState.somaAssistantPreview ??= {
    conversations: new Map<string, PreviewConversation>(),
    inFlight: new Set<string>(),
    requests: new Map<string, { conversationId: string; text: string; response: PreviewChatResponse }>(),
  };
}

export class PreviewChatError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
  }
}

export function listPreviewConversations() {
  return [...state().conversations.values()]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
    }));
}

export function createPreviewConversation(title: string | null = null) {
  const now = new Date().toISOString();
  const conversation: PreviewConversation = { id: crypto.randomUUID(), title, created_at: now, updated_at: now, messages: [] };
  state().conversations.set(conversation.id, conversation);
  return conversation;
}

export function getPreviewConversation(id: string) {
  return state().conversations.get(id) ?? null;
}

export function deletePreviewConversation(id: string) {
  return state().conversations.delete(id);
}

function makeMessage(conversationId: string, sequence: number, role: PreviewMessage["role"], text: string): PreviewMessage {
  return {
    id: crypto.randomUUID(), conversationId, sequence, role,
    parts: [{ type: "text", text }], status: "completed", createdAt: new Date().toISOString(),
  };
}

function demoContext() {
  return [
    "Tu es Soma, l’assistant de l’application, dans un aperçu local de démonstration.",
    "Réponds en français, tutoie l’utilisateur, avec un ton direct et calme.",
    "Toutes les données ci-dessous sont fictives. Signale clairement qu’il s’agit d’une démo lorsque tu les utilises.",
    "Ne prétends pas avoir consulté une base, un outil, un dossier de santé ou des données réelles.",
    "N’invente aucune autre mesure, date, tendance, objectif ou action enregistrée.",
    "Si une information manque, dis qu’elle n’est pas disponible dans cet aperçu.",
    "Les modifications de repas, d’objectifs et de réglages ne sont pas enregistrées dans cet aperçu.",
    `Données fictives : ${previewDashboard.scores.map((score) => `${score.label} : ${score.value}`).join(" ; ")}.`,
    `Synthèse fictive : ${previewDashboard.summary}`,
    previewRunningContext(),
  ].join("\n");
}

export async function respondToPreviewChat(rawInput: unknown, generate: typeof generateText = generateText) {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) throw new PreviewChatError("invalid_request", 400, "La demande est invalide.");
  const input = parsed.data;
  if (input.attachmentIds?.length) throw new PreviewChatError("preview_attachments_unavailable", 400, "Les photos ne sont pas encore disponibles dans cet aperçu.");
  if (!process.env.OPENAI_API_KEY?.trim()) throw new PreviewChatError("assistant_not_configured", 503, "Ajoute la clé OpenAI au serveur local pour tester le chat.");

  const store = state();
  const replay = store.requests.get(input.requestId);
  if (replay) {
    if (replay.conversationId !== input.conversationId || replay.text !== input.text) {
      throw new PreviewChatError("assistant_request_failed", 409, "Cette demande a déjà été utilisée pour un autre message.");
    }
    return replay.response;
  }
  const original = store.conversations.get(input.conversationId);
  if (!original) throw new PreviewChatError("conversation_not_found", 404, "Conversation introuvable.");
  if (store.inFlight.has(original.id)) throw new PreviewChatError("assistant_request_in_progress", 409, "Une réponse est déjà en cours dans cette conversation.");

  let conversation = original;
  let previousMessages = original.messages;
  if (input.editMessageId) {
    const index = original.messages.findIndex((message) => message.id === input.editMessageId && message.role === "user");
    if (index < 0) throw new PreviewChatError("message_not_found", 404, "Message introuvable.");
    previousMessages = original.messages.slice(0, index);
    conversation = createPreviewConversation(original.title);
    conversation.messages = [...previousMessages];
  }

  store.inFlight.add(original.id);
  try {
    const history: ModelMessage[] = previousMessages.slice(-20).map((message) => ({
      role: message.role,
      content: message.parts[0].text,
    }));
    const result = await generate({
      model: openai.responses(SOMA_ASSISTANT_MODEL),
      system: demoContext(),
      messages: [...history, { role: "user", content: input.text }],
      maxOutputTokens: 1_800,
      timeout: 90_000,
      providerOptions: { openai: { reasoningEffort: "medium", store: false } },
    });
    const answer = result.text.trim();
    if (!answer) throw new Error("Empty answer");
    const sequence = (previousMessages.at(-1)?.sequence ?? 0) + 1;
    const userMessage = makeMessage(conversation.id, sequence, "user", input.text);
    const assistantMessage = makeMessage(conversation.id, sequence + 1, "assistant", answer);
    conversation.messages.push(userMessage, assistantMessage);
    conversation.title ||= input.text.replace(/\s+/g, " ").slice(0, 76);
    conversation.updated_at = new Date().toISOString();
    const response: PreviewChatResponse = { conversationId: conversation.id, userMessage, assistantMessage, preview: true };
    store.requests.set(input.requestId, { conversationId: input.conversationId, text: input.text, response });
    if (store.requests.size > 200) store.requests.delete(store.requests.keys().next().value!);
    return response;
  } catch {
    if (conversation !== original) store.conversations.delete(conversation.id);
    throw new PreviewChatError("assistant_generation_failed", 502, "Soma ne peut pas répondre pour le moment. Vérifie la clé et la connexion du serveur local.");
  } finally {
    store.inFlight.delete(original.id);
  }
}

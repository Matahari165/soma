import "server-only";

import { tool } from "ai";
import { z } from "zod";

import {
  findAssistantAttachmentInConversation,
  findAssistantConversation,
  findAssistantRunByOutputMessage,
  listAssistantMessages,
  listAssistantToolCalls,
} from "../repository";
import { executeAuditedAssistantTool } from "./audited-tool";

const inputSchema = z.object({
  query: z.string().trim().min(2).max(300),
  limit: z.number().int().min(1).max(10).default(5),
  cursor: z.string().regex(/^\d{1,6}$/u).optional(),
});

const stopWords = new Set([
  "alors", "avec", "avoir", "dans", "depuis", "des", "elle", "elles", "est", "faire", "fois", "leur", "leurs", "mais", "mes", "mon", "nous", "notre", "pour", "quoi", "sans", "sont", "sur", "tout", "tous", "une", "vous", "votre", "les", "lesquels", "quels", "quelle", "comment", "entre", "jours", "mois", "plus", "moins", "cela", "cette", "ces", "comme", "donc", "encore", "même", "être", "que", "qui", "quoi", "ses", "son", "aux", "par", "pas", "une", "des", "du", "de", "et", "la", "le", "un", "en", "je", "tu", "il", "on", "ma", "ta", "sa", "ce", "ou", "si", "au", "y", "me", "te", "se",
]);

type SearchMessage = Awaited<ReturnType<typeof listAssistantMessages>>[number];
type SearchRepository = {
  findConversation: typeof findAssistantConversation;
  listMessages: typeof listAssistantMessages;
  findAttachmentInConversation: typeof findAssistantAttachmentInConversation;
  findRunByOutputMessage: typeof findAssistantRunByOutputMessage;
  listToolCalls: typeof listAssistantToolCalls;
};

const defaultRepository: SearchRepository = {
  findConversation: findAssistantConversation,
  listMessages: listAssistantMessages,
  findAttachmentInConversation: findAssistantAttachmentInConversation,
  findRunByOutputMessage: findAssistantRunByOutputMessage,
  listToolCalls: listAssistantToolCalls,
};

function normalized(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("fr");
}

function partsText(message: SearchMessage) {
  return message.parts.flatMap((part) => {
    if (part.type === "text") return [part.text];
    if (part.type === "data-summary") return [
      `${part.label} ${part.period ? `${part.period.from} ${part.period.to}` : ""} ${part.itemCount} ${part.domains.join(" ")}`,
    ];
    if (part.type === "attachment") return ["image photo pièce jointe"];
    return [];
  }).join("\n");
}

function scoreText(value: string, query: string) {
  const normalizedValue = normalized(value);
  const normalizedQuery = normalized(query).trim();
  const terms = [...new Set(normalizedQuery.split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length >= 2 && !stopWords.has(term)))];
  if (!terms.length) return 0;
  const phraseBonus = normalizedValue.includes(normalizedQuery) ? 4 : 0;
  const matchingTerms = terms.filter((term) => normalizedValue.includes(term));
  if (!matchingTerms.length) return 0;
  const count = matchingTerms.reduce((total, term) => total + Math.min(5, normalizedValue.split(term).length - 1), 0);
  return phraseBonus + matchingTerms.length * 2 + count;
}

function makeSnippet(value: string, query: string, maxChars = 480) {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length <= maxChars) return compact;
  const matchingSentence = compact.split(/(?<=[.!?])\s+/u).find((sentence) => scoreText(sentence, query) > 0);
  if (matchingSentence && matchingSentence.length <= maxChars) return matchingSentence;
  const queryTerms = normalized(query).split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length >= 2 && !stopWords.has(term));
  const position = queryTerms.map((term) => compact.toLocaleLowerCase("fr").indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, Math.min(position - Math.floor(maxChars / 3), compact.length - maxChars));
  const excerpt = compact.slice(start, start + maxChars).trim();
  return `${start > 0 ? "…" : ""}${excerpt}${start + maxChars < compact.length ? "…" : ""}`;
}

function safeEvidence(value: unknown, key = "", depth = 0): unknown {
  if (depth > 4 || ["rows", "records", "samples", "series", "observations", "raw", "data", "result"].includes(key.toLocaleLowerCase("en"))) return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.length > 500 ? undefined : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeEvidence(item, key, depth + 1)).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).flatMap(([childKey, childValue]) => {
    const sanitized = safeEvidence(childValue, childKey, depth + 1);
    return sanitized === undefined ? [] : [[childKey, sanitized]];
  }));
}

function dataSummaries(message: SearchMessage) {
  return message.parts.filter((part) => part.type === "data-summary");
}

async function attachmentReferences(userId: string, conversationId: string, message: SearchMessage, repository: SearchRepository) {
  const ids = message.parts.flatMap((part) => part.type === "attachment" ? [part.attachmentId] : []);
  return Promise.all(ids.map(async (attachmentId) => {
    const attachment = await repository.findAttachmentInConversation(userId, conversationId, attachmentId);
    return attachment ? {
      attachmentId: attachment.id,
      mediaType: attachment.media_type,
      purpose: attachment.purpose,
      createdAt: attachment.created_at,
      available: true,
    } : null;
  })).then((items) => items.filter((item): item is NonNullable<typeof item> => Boolean(item)));
}

export async function searchAssistantConversation(input: {
  userId: string;
  conversationId: string;
  query: string;
  limit?: number;
  cursor?: string;
}, repository: SearchRepository = defaultRepository) {
  const parsed = inputSchema.parse(input);
  const conversation = await repository.findConversation(input.userId, input.conversationId);
  if (!conversation) return { found: false as const, query: parsed.query, scannedMessages: 0, results: [], hasMore: false, nextCursor: null };

  const messages = await repository.listMessages(input.userId, input.conversationId);
  const ranked = messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const searchable = partsText(message);
    const score = scoreText(searchable, parsed.query);
    return score > 0 ? [{ message, searchable, score }] : [];
  }).sort((left, right) => right.score - left.score || right.message.sequence - left.message.sequence);

  const offset = parsed.cursor ? Number.parseInt(parsed.cursor, 10) : 0;
  const page = ranked.slice(offset, offset + parsed.limit);
  const results = await Promise.all(page.map(async ({ message, searchable, score }) => {
    const attachments = await attachmentReferences(input.userId, input.conversationId, message, repository);
    const toolEvidence: Array<{ toolName: string; status: string; result: unknown }> = [];
    if (message.role === "assistant") {
      const run = await repository.findRunByOutputMessage(input.userId, message.id);
      if (run) {
        const calls = await repository.listToolCalls(input.userId, run.id);
        let evidenceBytes = 0;
        for (const call of calls.filter((item) => item.status === "completed").slice(-8)) {
          const result = safeEvidence(call.result_manifest);
          if (result === undefined) continue;
          const bytes = Buffer.byteLength(JSON.stringify(result), "utf8");
          if (evidenceBytes + bytes > 4_000) continue;
          toolEvidence.push({ toolName: call.tool_name, status: call.status, result });
          evidenceBytes += bytes;
        }
      }
    }
    const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n\n");
    return {
      messageId: message.id,
      sequence: message.sequence,
      role: message.role,
      createdAt: message.created_at,
      score,
      snippet: makeSnippet(text || searchable, parsed.query),
      dataSummaries: dataSummaries(message),
      attachments,
      toolEvidence,
    };
  }));
  const nextOffset = offset + page.length;
  return {
    found: true as const,
    query: parsed.query,
    scannedMessages: messages.length,
    results,
    hasMore: nextOffset < ranked.length,
    nextCursor: nextOffset < ranked.length ? String(nextOffset) : null,
    matchingMessages: ranked.length,
  };
}

export function createSearchConversationTool(context: { userId: string; runId: string; conversationId: string }) {
  return tool({
    description: "Recherche dans les anciens messages de cette conversation et restitue de courts extraits avec leurs références. Utilise-le pour retrouver un fait déjà dit, une correction, une réponse, une analyse ou une photo jointe. Les résultats d’analyse conservent leur période et leurs preuves; les paroles historiques ne deviennent pas des souvenirs confirmés.",
    inputSchema,
    execute: async (input, options) => executeAuditedAssistantTool({
      context,
      toolName: "searchConversation",
      toolCallId: options.toolCallId,
      arguments: input,
      execute: () => searchAssistantConversation({ ...input, userId: context.userId, conversationId: context.conversationId }),
    }),
  });
}

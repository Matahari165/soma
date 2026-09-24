import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { isLocalPreviewMode } from "@/lib/env";

import { respondToAssistant, AssistantResponseError } from "./respond";
import { createPreviewConversation, getPreviewConversation, respondToPreviewChat, PreviewChatError } from "./local-preview-chat";
import { createAssistantConversation, findAssistantConversation } from "./repository";

export const SOMA_ASSISTANT_LIVE_MODEL = "gpt-live-1";
const OPENAI_LIVE_SESSIONS_URL = "https://api.openai.com/v1/live/sessions";
const MAX_SDP_LENGTH = 96 * 1024;
const SESSION_TICKET_LIFETIME_SECONDS = 55 * 60;
const MAX_VOICE_HANDOFF_BYTES = 1_600;

const liveInstructions = [
  "Tu es Soma, l’assistant vocal de l’application Soma. Parle en français, chaleureusement, clairement et à un rythme posé. Sois direct, motivant et concis.",
  "Backchannel policy: Utilise des acquiescements brefs et modérés. N’interromps pas l’utilisateur pour remplir un silence.",
  "Interruption policy: Si l’utilisateur t’interrompt, arrête de parler et écoute. Une correction met à jour la demande en cours.",
  "Delegation policy:",
  "Backend tools:",
  "- Données personnelles Soma : consulter les mesures de santé, repas, sommeil, récupération, effort, activités, objectifs et plans.",
  "- Analyse et coaching : comparer les données, expliquer les tendances, préparer des entraînements et proposer des objectifs chiffrés.",
  "- Actions Soma : créer ou modifier les éléments pris en charge par le backend, selon les validations qu’il demande.",
  "Delegate to the backend when:",
  "- La réponse concerne les données personnelles, une mesure, une analyse, une recommandation, un objectif, un plan ou une action dans Soma.",
  "- La réponse demande une comparaison ou un raisonnement précis au-delà d’une réponse générale simple.",
  "- L’utilisateur apporte une correction qui change une tâche backend en cours.",
  "Do not delegate to the backend when:",
  "- L’utilisateur te salue ou demande de répéter une réponse déjà donnée et toujours à jour.",
  "- Une seule question courte est nécessaire pour comprendre la demande.",
  "Délègue avant toute réponse qui dépend du backend. N’invente pas le résultat pendant qu’il travaille.",
  "Ne prétends jamais avoir consulté les données ou réalisé une action avant de recevoir un résultat vérifié du backend.",
  "Quand tu reçois un résultat backend, restitue fidèlement les chiffres avec leurs unités et périodes. Si le résultat est long, donne les éléments principaux et indique que le détail s’affiche dans la conversation.",
  "Si un nom, une date ou un chiffre important est incertain dans la transcription, demande une précision au lieu de deviner.",
].join("\n");

const createSessionSchema = z.object({
  conversationId: z.uuid().nullable().default(null),
  sdp: z.string().min(1).max(MAX_SDP_LENGTH).refine((value) => value.startsWith("v=0\r\n") || value.startsWith("v=0\n"), "Invalid WebRTC offer."),
}).strict();

const delegationSchema = z.object({
  sessionToken: z.string().min(20).max(2_048),
  delegationId: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/),
  transcript: z.string().trim().min(1).max(8_000),
}).strict();

type LiveTicket = {
  version: 1;
  userId: string;
  conversationId: string;
  sessionId: string;
  expiresAt: number;
};

export class AssistantLiveError extends Error {
  constructor(
    public readonly code: "assistant_live_not_configured" | "assistant_live_invalid_request" | "assistant_live_session_failed" | "assistant_live_session_invalid" | "assistant_live_conversation_not_found",
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AssistantLiveError";
  }
}

function liveApiKey() {
  const key = process.env.OPENAI_LIVE_API_KEY?.trim();
  if (!key) throw new AssistantLiveError("assistant_live_not_configured", 503, "Le mode vocal de Soma n’est pas configuré.");
  return key;
}

function signingKey(apiKey: string) {
  return createHmac("sha256", apiKey).update("soma-assistant-live-session-ticket-v1").digest();
}

function encodeTicket(ticket: LiveTicket, apiKey: string) {
  const body = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  const signature = createHmac("sha256", signingKey(apiKey)).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decodeTicket(value: string, expectedUserId: string, apiKey: string): LiveTicket {
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra) throw new AssistantLiveError("assistant_live_session_invalid", 401, "La session vocale n’est plus valide. Relance le mode vocal.");

  const expected = createHmac("sha256", signingKey(apiKey)).update(body).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    throw new AssistantLiveError("assistant_live_session_invalid", 401, "La session vocale n’est plus valide. Relance le mode vocal.");
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new AssistantLiveError("assistant_live_session_invalid", 401, "La session vocale n’est plus valide. Relance le mode vocal.");
  }

  let ticket: LiveTicket;
  try {
    ticket = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LiveTicket;
  } catch {
    throw new AssistantLiveError("assistant_live_session_invalid", 401, "La session vocale n’est plus valide. Relance le mode vocal.");
  }
  if (ticket.version !== 1 || ticket.userId !== expectedUserId || !ticket.conversationId || !ticket.sessionId
    || !Number.isSafeInteger(ticket.expiresAt) || ticket.expiresAt <= Math.floor(Date.now() / 1_000)) {
    throw new AssistantLiveError("assistant_live_session_invalid", 401, "La session vocale n’est plus valide. Relance le mode vocal.");
  }
  return ticket;
}

function asPublicVoiceText(value: string) {
  // The browser splits this handoff into <=350-byte Live commentary events.
  // Keep the whole voiced handoff useful while preserving the full saved answer.
  const normalized = value.trim();
  if (Buffer.byteLength(normalized, "utf8") <= MAX_VOICE_HANDOFF_BYTES) return normalized;

  const suffix = " Le reste est affiché dans la conversation.";
  const budget = MAX_VOICE_HANDOFF_BYTES - Buffer.byteLength(`${suffix}…`, "utf8");
  let prefix = "";
  let bytes = 0;
  for (const character of normalized) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > budget) break;
    prefix += character;
    bytes += characterBytes;
  }

  const sentenceBoundaries = [...prefix.matchAll(/[.!?…][”’"')\]]?(?:\s+)/gu)];
  const sentence = sentenceBoundaries.at(-1);
  const sentenceEnd = sentence?.index === undefined ? -1 : sentence.index + sentence[0].trimEnd().length;
  if (sentenceEnd >= prefix.length * 0.55) {
    prefix = prefix.slice(0, sentenceEnd);
  } else {
    const boundary = Math.max(prefix.lastIndexOf(" "), prefix.lastIndexOf("\n"));
    if (boundary > 0) prefix = prefix.slice(0, boundary);
  }
  return `${prefix.trimEnd()}…${suffix}`;
}

function textFromAssistantMessage(message: { parts: unknown }) {
  if (!Array.isArray(message.parts)) return "";
  return message.parts
    .filter((part): part is { type: "text"; text: string } => Boolean(part && typeof part === "object"
      && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string"))
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

export async function createAssistantLiveSession(
  userId: string,
  input: unknown,
  options: { fetchImpl?: typeof fetch; now?: () => number } = {},
) {
  const parsed = createSessionSchema.safeParse(input);
  if (!parsed.success) throw new AssistantLiveError("assistant_live_invalid_request", 400, "La demande de session vocale est invalide.");

  const apiKey = liveApiKey();
  const now = options.now?.() ?? Date.now();
  let conversationId = parsed.data.conversationId;

  if (isLocalPreviewMode()) {
    const conversation = conversationId ? getPreviewConversation(conversationId) : createPreviewConversation();
    if (!conversation) throw new AssistantLiveError("assistant_live_conversation_not_found", 404, "Conversation introuvable.");
    conversationId = conversation.id;
  } else if (conversationId) {
    const conversation = await findAssistantConversation(userId, conversationId);
    if (!conversation) throw new AssistantLiveError("assistant_live_conversation_not_found", 404, "Conversation introuvable.");
  } else {
    const conversation = await createAssistantConversation(userId);
    conversationId = conversation.id;
  }

  const safetyIdentifier = createHash("sha256").update(userId).digest("hex");
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(OPENAI_LIVE_SESSIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyIdentifier,
      },
      body: JSON.stringify({
        session: {
          model: SOMA_ASSISTANT_LIVE_MODEL,
          store: false,
          instructions: liveInstructions,
          client: {
            data_channel: {
              // Only allow the browser to return a verified backend result and close its session.
              allowed_client_events: ["session.commentary.append", "session.close"],
              allowed_server_events: [
                { type: "session.started" },
                { type: "session.delegation.created" },
                { type: "session.input_transcript.delta" },
                { type: "session.output_transcript.delta" },
                { type: "session.commentary.appended" },
                { type: "session.usage.updated" },
                { type: "session.closed" },
                { type: "error" },
                { type: "info" },
              ],
            },
          },
          delegation: { type: "client" },
        },
        transport: { type: "webrtc", sdp: parsed.data.sdp },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AssistantLiveError("assistant_live_session_failed", 502, "Impossible de démarrer la session vocale. Réessaie dans un instant.");
  }

  if (!response.ok) {
    throw new AssistantLiveError(
      "assistant_live_session_failed",
      response.status === 429 ? 429 : 502,
      response.status === 429
        ? "Le mode vocal est temporairement saturé. Réessaie dans un instant."
        : "Impossible de démarrer la session vocale. Vérifie la clé API du mode vocal et réessaie.",
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AssistantLiveError("assistant_live_session_failed", 502, "La réponse du service vocal est invalide.");
  }
  const result = z.object({
    session: z.object({ id: z.string().min(1).max(200) }),
    transport: z.object({ type: z.literal("webrtc"), sdp: z.string().min(1).max(MAX_SDP_LENGTH) }),
  }).safeParse(payload);
  if (!result.success || !conversationId) {
    throw new AssistantLiveError("assistant_live_session_failed", 502, "La réponse du service vocal est invalide.");
  }

  const ticket: LiveTicket = {
    version: 1,
    userId,
    conversationId,
    sessionId: result.data.session.id,
    expiresAt: Math.floor(now / 1_000) + SESSION_TICKET_LIFETIME_SECONDS,
  };
  return {
    sessionId: ticket.sessionId,
    conversationId,
    sessionToken: encodeTicket(ticket, apiKey),
    sdp: result.data.transport.sdp,
  };
}

export async function respondToAssistantLiveDelegation(
  userId: string,
  input: unknown,
) {
  const parsed = delegationSchema.safeParse(input);
  if (!parsed.success) throw new AssistantLiveError("assistant_live_invalid_request", 400, "La demande vocale est invalide.");
  const apiKey = liveApiKey();
  const ticket = decodeTicket(parsed.data.sessionToken, userId, apiKey);
  const requestId = `live-${createHash("sha256").update(`${ticket.sessionId}\0${parsed.data.delegationId}`).digest("hex")}`;

  try {
    const result = isLocalPreviewMode()
      ? await respondToPreviewChat({ conversationId: ticket.conversationId, requestId, text: parsed.data.transcript })
      : await respondToAssistant(userId, {
        conversationId: ticket.conversationId,
        requestId,
        text: parsed.data.transcript,
        attachmentIds: [],
      });
    const responseText = textFromAssistantMessage(result.assistantMessage);
    if (!responseText) throw new AssistantLiveError("assistant_live_session_failed", 502, "Soma n’a pas produit de réponse vocale.");
    return { delegationId: parsed.data.delegationId, responseText: asPublicVoiceText(responseText) };
  } catch (error) {
    if (error instanceof AssistantLiveError) throw error;
    if (error instanceof AssistantResponseError || error instanceof PreviewChatError) {
      throw new AssistantLiveError(
        error.code === "conversation_not_found" ? "assistant_live_conversation_not_found" : "assistant_live_session_failed",
        error.status,
        error.message,
      );
    }
    throw new AssistantLiveError("assistant_live_session_failed", 502, "Soma ne peut pas répondre pour le moment.");
  }
}

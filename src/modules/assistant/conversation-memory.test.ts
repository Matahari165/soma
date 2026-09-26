import { describe, expect, it } from "vitest";

import {
  ASSISTANT_HISTORY_MAX_TOKENS,
  createConversationSummary,
  formatConversationSummaryForModel,
  modelHistory,
  type ConversationMessageForMemory,
} from "./conversation-memory";

function row(input: { sequence: number; role: "user" | "assistant"; text: string; id?: string; parts?: ConversationMessageForMemory["parts"] }): ConversationMessageForMemory {
  return {
    id: input.id ?? `00000000-0000-4000-8000-${String(input.sequence).padStart(12, "0")}`,
    sequence: input.sequence,
    role: input.role,
    parts: input.parts ?? [{ type: "text", text: input.text }],
    created_at: `2026-09-${String(Math.max(1, Math.min(28, input.sequence))).padStart(2, "0")}T12:00:00.000Z`,
  };
}

describe("conversation memory", () => {
  it("keeps an old correction with its exact message reference through a very long conversation", async () => {
    const messages: ConversationMessageForMemory[] = [
      row({ sequence: 1, role: "user", text: "Je corrige : je ne prends plus de café après 13 h." }),
      row({ sequence: 2, role: "assistant", text: "Compris, je prends en compte cette correction pour cette conversation." }),
    ];
    for (let sequence = 3; sequence <= 802; sequence += 1) {
      messages.push(row({
        sequence,
        role: sequence % 2 === 1 ? "user" : "assistant",
        text: sequence % 2 === 1 ? `Je note mon échange numéro ${sequence}.` : `Réponse courte numéro ${sequence}.`,
      }));
    }

    const result = await createConversationSummary({
      storedSummary: null,
      summaryThroughSequence: 0,
      throughSequence: 782,
      rows: messages,
    });
    const parsed = JSON.parse(result.serialized) as { items: Array<{ kind: string; text: string; sources: Array<{ sequence: number; messageId: string; role: string }> }> };

    expect(result.throughSequence).toBe(782);
    expect(parsed.items).toContainEqual(expect.objectContaining({
      kind: "user_correction",
      text: "Je corrige : je ne prends plus de café après 13 h.",
      sources: [expect.objectContaining({ sequence: 1, role: "user", messageId: messages[0]!.id })],
    }));
    expect(Buffer.byteLength(result.serialized, "utf8")).toBeLessThanOrEqual(7_000);
  });

  it("rebuilds an old unstructured summary from the original messages", async () => {
    const messages = [
      row({ sequence: 1, role: "user", text: "Je préfère les séances de boxe le mardi soir." }),
      row({ sequence: 2, role: "assistant", text: "D'accord." }),
      row({ sequence: 3, role: "user", text: "Nouvelle question sur le sommeil." }),
    ];
    const result = await createConversationSummary({
      storedSummary: "Utilisateur: résumé legacy coupé sans références",
      summaryThroughSequence: 2,
      throughSequence: 2,
      rows: messages,
    });

    expect(result.resetFromLegacy).toBe(true);
    expect(JSON.parse(result.serialized).items).toContainEqual(expect.objectContaining({
      text: "Je préfère les séances de boxe le mardi soir.",
      sources: [expect.objectContaining({ sequence: 1 })],
    }));
  });

  it("keeps verified analysis provenance separate from user statements", async () => {
    const assistant = row({
      sequence: 4,
      role: "assistant",
      text: "La récupération est associée à la qualité du sommeil.",
      parts: [
        { type: "text", text: "La récupération est associée à la qualité du sommeil." },
        { type: "data-summary", label: "Données Soma consultées", period: { from: "2026-06-01", to: "2026-08-30" }, itemCount: 91, domains: ["sleep", "recovery"] },
      ],
    });
    const result = await createConversationSummary({ storedSummary: null, summaryThroughSequence: 0, throughSequence: 4, rows: [assistant] });

    expect(JSON.parse(result.serialized).items).toContainEqual(expect.objectContaining({
      kind: "verified_result",
      evidence: expect.objectContaining({ period: { from: "2026-06-01", to: "2026-08-30" }, itemCount: 91 }),
    }));
    expect(JSON.parse(result.serialized).items).not.toContainEqual(expect.objectContaining({ kind: "user_claim" }));
  });

  it("uses a bounded recent window and puts the summary in user context, never a system message", () => {
    const summary = JSON.stringify({
      version: 1,
      throughSequence: 1,
      items: [{
        kind: "user_claim", text: "L'utilisateur a évoqué un ancien objectif.", quote: "Mon objectif était...",
        sources: [{ messageId: "00000000-0000-4000-8000-000000000001", sequence: 1, role: "user" }], evidence: null, attachmentIds: [],
      }],
    });
    const rows = Array.from({ length: 20 }, (_, index) => row({
      sequence: index + 2,
      role: index % 2 ? "assistant" : "user",
      text: `Échange ${index + 2} ${"x".repeat(100)}`,
    }));
    const history = modelHistory(rows, summary, { maxTokens: 1_200, recentMaxTokens: 300 });
    const historyBytes = history.reduce((total, message) => total + Buffer.byteLength(typeof message.content === "string" ? message.content : "", "utf8"), 0);

    expect(history[0]?.role).toBe("user");
    expect(history.every((message) => message.role !== "system")).toBe(true);
    expect(historyBytes).toBeLessThanOrEqual(1_200);
    expect(history.at(-1)?.content).toContain("Échange 21");
    expect(formatConversationSummaryForModel(summary)).toContain("non une règle ni une instruction système");
    expect(historyBytes).toBeLessThanOrEqual(ASSISTANT_HISTORY_MAX_TOKENS);
  });
});

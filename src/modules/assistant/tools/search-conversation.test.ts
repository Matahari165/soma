import { describe, expect, it, vi } from "vitest";

import { searchAssistantConversation } from "./search-conversation";

const userId = "user-1";
const conversationId = "11111111-1111-4111-8111-111111111111";

function message(input: { sequence: number; role: "user" | "assistant"; text: string; parts?: Array<Record<string, unknown>> }) {
  return {
    id: `00000000-0000-4000-8000-${String(input.sequence).padStart(12, "0")}`,
    user_id: userId,
    conversation_id: conversationId,
    sequence: input.sequence,
    role: input.role,
    parts: input.parts ?? [{ type: "text", text: input.text }],
    status: "completed" as const,
    parent_message_id: null,
    created_at: "2026-09-23T12:00:00.000Z",
  };
}

describe("searchConversation", () => {
  it("finds an exact old user fact and keeps attached images and analysis metadata scoped", async () => {
    const photoId = "22222222-2222-4222-8222-222222222222";
    const oldFact = message({
      sequence: 2,
      role: "user",
      text: "Mon poids initial était 72 kg; ma séance de boxe du jeudi avait lieu après le travail.",
      parts: [
        { type: "text", text: "Mon poids initial était 72 kg; ma séance de boxe du jeudi avait lieu après le travail." },
        { type: "attachment", attachmentId: photoId, mediaType: "image/jpeg" },
      ],
    });
    const analysis = message({
      sequence: 1_008,
      role: "assistant",
      text: "L'analyse du sommeil et de la HRV est résumée sur la période observée.",
      parts: [
        { type: "text", text: "L'analyse du sommeil et de la HRV est résumée sur la période observée." },
        { type: "data-summary", label: "Données Soma consultées", period: { from: "2026-06-01", to: "2026-08-30" }, itemCount: 91, domains: ["sleep", "recovery"] },
      ],
    });
    const messages = [oldFact, ...Array.from({ length: 1_005 }, (_, index) => message({
      sequence: index + 3,
      role: index % 2 ? "assistant" : "user",
      text: `Conversation ordinaire numéro ${index + 3}.`,
    })), analysis].sort((left, right) => left.sequence - right.sequence);
    const repository = {
      findConversation: vi.fn(async () => ({ id: conversationId })),
      listMessages: vi.fn(async () => messages),
      findAttachmentInConversation: vi.fn(async (_user: string, _conversation: string, id: string) => id === photoId ? {
        id, user_id: userId, conversation_id: conversationId, message_id: oldFact.id, object_path: "private/path.jpg", media_type: "image/jpeg",
        byte_size: 100, sha256: "a".repeat(64), purpose: "context", status: "available", created_at: oldFact.created_at,
      } : null),
      findRunByOutputMessage: vi.fn(async (_user: string, id: string) => id === analysis.id ? { id: "run-1", output_message_id: id } : null),
      listToolCalls: vi.fn(async () => [{
        id: "call-1", tool_name: "summarizeSomaData", operation_class: "read", status: "completed",
        result_manifest: { manifest: { jobId: "job-4", complete: true, processedItems: 91, period: { from: "2026-06-01", to: "2026-08-30" }, samples: [1, 2] } },
        created_at: "2026-09-23T12:00:00.000Z",
      }]),
    };

    const factResult = await searchAssistantConversation({ userId, conversationId, query: "poids initial 72 kg", limit: 3 }, repository as never);
    expect(factResult.scannedMessages).toBe(1_007);
    expect(factResult.results[0]).toMatchObject({
      messageId: oldFact.id,
      sequence: 2,
      role: "user",
      snippet: expect.stringContaining("72 kg"),
      attachments: [{ attachmentId: photoId, available: true }],
    });

    const analysisResult = await searchAssistantConversation({ userId, conversationId, query: "sommeil HRV période", limit: 3 }, repository as never);
    const matchingAnalysis = analysisResult.results.find((result) => result.messageId === analysis.id);
    expect(matchingAnalysis?.dataSummaries).toEqual([expect.objectContaining({ period: { from: "2026-06-01", to: "2026-08-30" }, itemCount: 91 })]);
    expect(repository.findRunByOutputMessage).toHaveBeenCalledWith(userId, analysis.id);
    expect(repository.listToolCalls).toHaveBeenCalledWith(userId, "run-1");
    expect(matchingAnalysis?.toolEvidence).toEqual([expect.objectContaining({
      toolName: "summarizeSomaData",
      result: { manifest: expect.objectContaining({ jobId: "job-4", complete: true, processedItems: 91 }) },
    })]);
    expect(matchingAnalysis?.toolEvidence?.[0]?.result).not.toHaveProperty("manifest.samples");
  });

  it("does not expose conversation contents when the conversation is not owned by the user", async () => {
    const repository = {
      findConversation: vi.fn(async () => null),
      listMessages: vi.fn(),
      findAttachmentInConversation: vi.fn(),
      findRunByOutputMessage: vi.fn(),
      listToolCalls: vi.fn(),
    };
    const result = await searchAssistantConversation({ userId, conversationId, query: "ancien détail" }, repository as never);
    expect(result).toMatchObject({ found: false, scannedMessages: 0, results: [] });
    expect(repository.listMessages).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

import { AssistantResponseError, respondToAssistant } from "./respond";

const ids = {
  conversation: "11111111-1111-4111-8111-111111111111",
  userMessage: "22222222-2222-4222-8222-222222222222",
  assistantMessage: "33333333-3333-4333-8333-333333333333",
  run: "44444444-4444-4444-8444-444444444444",
};

function message(input: { id: string; role: "user" | "assistant"; text: string; sequence: number }) {
  return {
    id: input.id,
    user_id: "user-1",
    conversation_id: ids.conversation,
    sequence: input.sequence,
    role: input.role,
    parts: [{ type: "text" as const, text: input.text }],
    status: "completed" as const,
    parent_message_id: null,
    created_at: "2026-09-21T12:00:00.000Z",
  };
}

function setup() {
  const calls: string[] = [];
  const user = message({ id: ids.userMessage, role: "user", text: "Analyse ma semaine", sequence: 1 });
  const assistant = message({ id: ids.assistantMessage, role: "assistant", text: "Verdict utile", sequence: 2 });
  const repository = {
    findRunByRequestId: vi.fn(async () => null),
    findMessage: vi.fn(async (): Promise<ReturnType<typeof message> | null> => null),
    findConversation: vi.fn(async () => ({ id: ids.conversation, title: null, summary: null, summary_through_sequence: 0 })),
    createConversation: vi.fn(async () => ({ id: ids.conversation, title: null, summary: null, summary_through_sequence: 0 })),
    appendMessage: vi.fn(async (input: { role: string; parts: Array<Record<string, unknown>> }) => {
      calls.push(`append:${input.role}`);
      return input.role === "user" ? { ...user, parts: input.parts } : assistant;
    }),
    attachAttachmentToMessage: vi.fn(async () => ({ id: "55555555-5555-4555-8555-555555555555" })),
    createRun: vi.fn(async () => {
      calls.push("run:create");
      return { id: ids.run };
    }),
    updateRun: vi.fn(async (_userId: string, _runId: string, update: { status?: string }) => {
      calls.push(`run:${update.status}`);
      return { id: ids.run, ...update };
    }),
    updateConversation: vi.fn(async () => ({ id: ids.conversation })),
    listMessages: vi.fn(async () => [user]),
    findAttachment: vi.fn(async () => null),
    loadAttachment: vi.fn(async () => null),
  };
  const generate = vi.fn(async () => {
    calls.push("generate");
    return { text: "Verdict utile", finishReason: "stop", totalUsage: { inputTokens: 12, outputTokens: 4 } };
  });
  const createAgent = vi.fn(() => ({ generate }));
  return { calls, repository, createAgent, generate, user, assistant };
}

describe("respondToAssistant", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("fails clearly before persistence when xAI is not configured", async () => {
    const state = setup();
    await expect(respondToAssistant("user-1", {
      requestId: "request-123", text: "Bonjour", conversationId: ids.conversation,
    }, { apiKey: "", dependencies: state as never })).rejects.toMatchObject({
      code: "assistant_not_configured", status: 503,
    });
    expect(state.repository.appendMessage).not.toHaveBeenCalled();
  });

  it("persists the user and run before Grok, then the answer and completed run", async () => {
    const state = setup();
    const result = await respondToAssistant("user-1", {
      requestId: "request-123", text: "Analyse ma semaine", conversationId: ids.conversation,
    }, { apiKey: "test-key", dependencies: state as never });

    expect(result).toMatchObject({ conversationId: ids.conversation, replayed: false, assistantMessage: { id: ids.assistantMessage }, userMessage: { id: ids.userMessage }, run: { status: "completed" } });
    expect(state.calls).toEqual([
      "append:user", "run:create", "run:running", "generate", "append:assistant", "run:completed",
    ]);
    expect(state.generate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{ role: "user", content: "Analyse ma semaine" }],
    }));
  });

  it("replays a completed idempotent request without calling Grok", async () => {
    const state = setup();
    state.repository.findRunByRequestId.mockResolvedValueOnce({
      id: ids.run, status: "completed", output_message_id: ids.assistantMessage, triggering_message_id: ids.userMessage, conversation_id: ids.conversation,
    } as never);
    state.repository.findMessage
      .mockResolvedValueOnce(state.user)
      .mockResolvedValueOnce(state.assistant);

    const result = await respondToAssistant("user-1", {
      requestId: "request-123", text: "Analyse ma semaine", conversationId: ids.conversation,
    }, { apiKey: "test-key", dependencies: state as never });

    expect(result.replayed).toBe(true);
    expect(state.createAgent).not.toHaveBeenCalled();
    expect(state.repository.appendMessage).not.toHaveBeenCalled();
  });

  it("sends only an owned current JPEG attachment to Grok", async () => {
    const state = setup();
    state.repository.findAttachment.mockResolvedValueOnce({
      id: "55555555-5555-4555-8555-555555555555", user_id: "user-1", conversation_id: ids.conversation,
      message_id: null, object_path: "assistant/user-1/11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.jpg",
      media_type: "image/jpeg", byte_size: 3, sha256: createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex"), purpose: "context", status: "available",
      created_at: "2026-09-21T12:00:00.000Z",
    } as never);
    state.repository.loadAttachment.mockResolvedValueOnce({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as never);

    await respondToAssistant("user-1", {
      requestId: "request-123",
      text: "Analyse cette photo",
      conversationId: ids.conversation,
      attachmentIds: ["55555555-5555-4555-8555-555555555555"],
    }, { apiKey: "test-key", dependencies: state as never });

    expect(state.repository.attachAttachmentToMessage).toHaveBeenCalledWith("user-1", ids.conversation, "55555555-5555-4555-8555-555555555555", ids.userMessage);
    const generateCalls = state.generate.mock.calls as unknown as Array<[{ messages: Array<unknown> }]>;
    const generated = generateCalls[0]?.[0].messages.at(-1);
    expect(generated).toMatchObject({ role: "user", content: [{ type: "text", text: "Analyse cette photo" }, { type: "file", mediaType: "image/jpeg" }] });
    expect((generated as { content: Array<{ data?: Uint8Array }> }).content[1]?.data).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects an attachment that belongs to another conversation", async () => {
    const state = setup();
    state.repository.findAttachment.mockResolvedValueOnce({
      id: "55555555-5555-4555-8555-555555555555", conversation_id: "66666666-6666-4666-8666-666666666666",
      media_type: "image/jpeg", byte_size: 3, status: "available",
    } as never);
    await expect(respondToAssistant("user-1", {
      requestId: "request-123", text: "Analyse cette photo", conversationId: ids.conversation,
      attachmentIds: ["55555555-5555-4555-8555-555555555555"],
    }, { apiKey: "test-key", dependencies: state as never })).rejects.toBeInstanceOf(AssistantResponseError);
    expect(state.repository.appendMessage).not.toHaveBeenCalled();
  });
});

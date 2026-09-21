import { beforeEach, describe, expect, it, vi } from "vitest";

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
    appendMessage: vi.fn(async (input: { role: string }) => {
      calls.push(`append:${input.role}`);
      return input.role === "user" ? user : assistant;
    }),
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

  it("refuses attachments until sending private photos to xAI is explicitly authorized", async () => {
    const state = setup();
    const promise = respondToAssistant("user-1", {
      requestId: "request-123",
      text: "Analyse cette photo",
      conversationId: ids.conversation,
      attachmentIds: ["55555555-5555-4555-8555-555555555555"],
    }, { apiKey: "test-key", dependencies: state as never });

    await expect(promise).rejects.toBeInstanceOf(AssistantResponseError);
    await expect(promise).rejects.toMatchObject({ code: "assistant_attachment_consent_required", status: 400 });
    expect(state.repository.appendMessage).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

import { AssistantResponseError, respondToAssistant } from "./respond";
import { SOMA_ASSISTANT_MODEL, SOMA_ASSISTANT_PROVIDER } from "./agent";

const ids = {
  conversation: "11111111-1111-4111-8111-111111111111",
  userMessage: "22222222-2222-4222-8222-222222222222",
  assistantMessage: "33333333-3333-4333-8333-333333333333",
  run: "44444444-4444-4444-8444-444444444444",
  forkConversation: "77777777-7777-4777-8777-777777777777",
  editedMessage: "88888888-8888-4888-8888-888888888888",
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
    parent_message_id: null as string | null,
    created_at: "2026-09-21T12:00:00.000Z",
  };
}

function setup() {
  const calls: string[] = [];
  const user = message({ id: ids.userMessage, role: "user", text: "Analyse ma semaine", sequence: 1 });
  const assistant = { ...message({ id: ids.assistantMessage, role: "assistant", text: "Verdict utile", sequence: 2 }), parent_message_id: ids.userMessage };
  const messages = new Map<string, ReturnType<typeof message>>();
  let currentRun: Record<string, unknown> | null = null;
  let failCompletedUpdate = false;
  const repository = {
    findRunByRequestId: vi.fn(async () => currentRun),
    findMessage: vi.fn(async (_userId: string, messageId: string): Promise<ReturnType<typeof message> | null> => messages.get(messageId) ?? null),
    findConversation: vi.fn(async (_userId: string, conversationId = ids.conversation) => ({ id: conversationId, title: null, summary: null, summary_through_sequence: 0 })),
    createConversation: vi.fn(async () => ({ id: ids.conversation, title: null, summary: null, summary_through_sequence: 0 })),
    forkConversationAtMessage: vi.fn(async () => ({ id: ids.forkConversation, title: null, summary: null, summary_through_sequence: 0 })),
    appendMessage: vi.fn(async (input: { conversationId: string; role: string; parts: Array<Record<string, unknown>>; parentMessageId?: string }) => {
      calls.push(`append:${input.role}`);
      const row = input.role === "user"
        ? { ...user, conversation_id: input.conversationId, parts: input.parts }
        : { ...assistant, conversation_id: input.conversationId, parent_message_id: input.parentMessageId ?? null };
      if (messages.has(row.id)) throw new Error("Assistant message already exists.");
      messages.set(row.id, row as ReturnType<typeof message>);
      return row;
    }),
    attachAttachmentToMessage: vi.fn(async () => ({ id: "55555555-5555-4555-8555-555555555555" })),
    createRun: vi.fn(async (input: { conversationId: string; triggeringMessageId: string; requestId: string; quality: string }) => {
      calls.push("run:create");
      if (currentRun?.request_id === input.requestId) return currentRun;
      currentRun = { id: ids.run, status: "queued", conversation_id: input.conversationId, triggering_message_id: input.triggeringMessageId, output_message_id: null, request_id: input.requestId, quality: input.quality, provider: null, model: SOMA_ASSISTANT_MODEL, error_code: null };
      return currentRun;
    }),
    claimRun: vi.fn(async (input: { expectedStatus: string; provider: string; startedAt: string }) => {
      calls.push(`run:claim:${input.expectedStatus}`);
      if (!currentRun || currentRun.status !== input.expectedStatus) return null;
      currentRun = { ...currentRun, status: "running", provider: input.provider, started_at: input.startedAt, error_code: null };
      return currentRun;
    }),
    updateRun: vi.fn(async (_userId: string, _runId: string, update: { status?: string }) => {
      calls.push(`run:${update.status}`);
      if (update.status === "completed" && failCompletedUpdate) {
        failCompletedUpdate = false;
        throw new Error("Run completion was not acknowledged.");
      }
      currentRun = { ...currentRun, ...update };
      return { id: ids.run, ...currentRun };
    }),
    updateConversation: vi.fn(async () => ({ id: ids.conversation })),
    listMessages: vi.fn(async () => Array.from(messages.values())),
    findAttachment: vi.fn(async () => null),
    loadAttachment: vi.fn(async () => null),
  };
  const generate = vi.fn(async () => {
    calls.push("generate");
    return { text: "Verdict utile", finishReason: "stop", totalUsage: { inputTokens: 12, outputTokens: 4 } };
  });
  const createAgent = vi.fn(() => ({ generate }));
  const loadProfileTimezone = vi.fn(async () => "Europe/Zurich");
  const now = vi.fn(() => new Date("2026-09-24T16:25:30.000Z"));
  return { calls, repository, createAgent, generate, loadProfileTimezone, now, user, assistant, messages, failNextCompletedUpdate: () => { failCompletedUpdate = true; } };
}

describe("respondToAssistant", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("fails clearly before persistence when OpenAI is not configured", async () => {
    const state = setup();
    await expect(respondToAssistant("user-1", {
      requestId: "request-123", text: "Bonjour", conversationId: ids.conversation,
    }, { apiKey: "", dependencies: state as never })).rejects.toMatchObject({
      code: "assistant_not_configured", status: 503,
    });
    expect(state.repository.appendMessage).not.toHaveBeenCalled();
  });

  it("persists the user and run before GPT-6 Luna, then the answer and completed run", async () => {
    const state = setup();
    const result = await respondToAssistant("user-1", {
      requestId: "request-123", text: "Analyse ma semaine", conversationId: ids.conversation,
    }, { apiKey: "test-key", dependencies: state as never });

    expect(result).toMatchObject({ conversationId: ids.conversation, replayed: false, assistantMessage: { id: ids.assistantMessage }, userMessage: { id: ids.userMessage }, run: { status: "completed", provider: SOMA_ASSISTANT_PROVIDER, model: SOMA_ASSISTANT_MODEL } });
    expect(state.calls).toEqual([
      "append:user", "run:create", "run:claim:queued", "generate", "append:assistant", "run:completed",
    ]);
    expect(state.repository.createRun).toHaveBeenCalledWith(expect.objectContaining({ model: SOMA_ASSISTANT_MODEL }));
    expect(state.repository.claimRun).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1", runId: ids.run, expectedStatus: "queued", provider: SOMA_ASSISTANT_PROVIDER,
    }));
    expect(state.generate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{ role: "user", content: "Analyse ma semaine" }],
    }));
    expect(state.createAgent).toHaveBeenCalledWith(expect.objectContaining({
      temporalContext: {
        instantUtc: "2026-09-24T16:25:30.000Z",
        localDate: "2026-09-24",
        localTime: "18:25:30",
        weekday: "jeudi",
        timezone: "Europe/Zurich",
        timezoneSource: "profile",
      },
    }));
  });

  it("persists a structured data summary only when a canonical query was actually used", async () => {
    const state = setup();
    state.generate.mockResolvedValueOnce({
      text: "La tendance est stable.", finishReason: "stop", totalUsage: {},
      steps: [{ toolResults: [{ toolName: "querySomaData", input: { dataset: "scores", kinds: ["sleep"] }, output: {
        manifest: { dataset: "scores", requestedPeriod: { from: "2026-09-01", to: "2026-09-07" },
          coveredPeriod: { from: "2026-09-01", to: "2026-09-07" }, timezone: "Europe/Zurich",
          totalItems: 7, totalKnown: true, returnedItems: 7, hasMore: false, nextCursor: null, complete: true,
          generatedAt: "2026-09-23T10:00:00.000Z" },
      } }] }],
    } as never);
    await respondToAssistant("user-1", { requestId: "request-summary-123", text: "Analyse mon sommeil", conversationId: ids.conversation }, { apiKey: "test-key", dependencies: state as never });
    expect(state.repository.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: "assistant",
      parts: [
        { type: "text", text: "La tendance est stable." },
        { type: "data-summary", label: "Données Soma consultées", period: { from: "2026-09-01", to: "2026-09-07" }, coveredPeriod: { from: "2026-09-01", to: "2026-09-07" }, itemCount: 7, domains: ["sleep"] },
      ],
    }));
  });

  it("keeps chat available when compaction persistence fails and exposes a safe retry status", async () => {
    const state = setup();
    state.user.sequence = 25;
    state.repository.listMessages.mockResolvedValueOnce(Array.from({ length: 25 }, (_, index) => ({
      ...state.user,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      sequence: index + 1,
      role: index % 2 ? "assistant" : "user",
      parts: [{ type: "text", text: index === 0 ? "Je corrige : ma séance habituelle est la boxe du jeudi." : `Ancien échange ${index + 1}.` }],
    })) as never);
    state.repository.updateConversation.mockRejectedValue(new Error("private database failure"));

    const result = await respondToAssistant("user-1", {
      requestId: "request-memory-retry-123", text: "Et pour cette semaine ?", conversationId: ids.conversation,
    }, { apiKey: "test-key", dependencies: state as never });

    expect(result).toMatchObject({ memoryStatus: { state: "retry_pending", complete: false, retryOnNextMessage: true } });
    expect(result.memoryStatus?.warning).toContain("fenêtre récente bornée");
    expect(state.generate).toHaveBeenCalled();
    expect(state.repository.updateConversation).toHaveBeenCalledWith("user-1", ids.conversation, expect.objectContaining({ summary_through_sequence: 5 }));
  });

  it("replays a completed idempotent request without calling GPT-6 Luna", async () => {
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

  it("retries a failed generation under the same request id without appending a second user message", async () => {
    const state = setup();
    const request = {
      requestId: "request-retry-123", text: "Analyse ma semaine", conversationId: ids.conversation,
    };
    state.generate.mockRejectedValueOnce(new Error("Temporary model failure."));

    await expect(respondToAssistant("user-1", request, { apiKey: "test-key", dependencies: state as never }))
      .rejects.toMatchObject({ code: "assistant_generation_failed", status: 502 });
    expect(state.repository.appendMessage.mock.calls.filter(([input]) => input.role === "user")).toHaveLength(1);

    const result = await respondToAssistant("user-1", request, { apiKey: "test-key", dependencies: state as never });

    expect(result).toMatchObject({ replayed: false, userMessage: { id: ids.userMessage }, assistantMessage: { id: ids.assistantMessage } });
    expect(state.repository.appendMessage.mock.calls.filter(([input]) => input.role === "user")).toHaveLength(1);
    expect(state.repository.createRun).toHaveBeenCalledTimes(1);
    expect(state.repository.claimRun.mock.calls.map(([claim]) => claim.expectedStatus)).toEqual(["queued", "failed"]);
    expect(state.generate).toHaveBeenCalledTimes(2);
  });

  it("recovers a saved answer when the run completion update failed", async () => {
    const state = setup();
    const request = {
      requestId: "request-response-saved-123", text: "Analyse ma semaine", conversationId: ids.conversation,
    };
    state.failNextCompletedUpdate();

    await expect(respondToAssistant("user-1", request, { apiKey: "test-key", dependencies: state as never }))
      .rejects.toMatchObject({ code: "assistant_generation_failed", status: 502 });
    expect(state.messages.get(ids.assistantMessage)).toMatchObject({ role: "assistant", parent_message_id: ids.userMessage });

    const result = await respondToAssistant("user-1", request, { apiKey: "test-key", dependencies: state as never });

    expect(result).toMatchObject({ replayed: true, assistantMessage: { id: ids.assistantMessage } });
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(state.repository.appendMessage.mock.calls.filter(([input]) => input.role === "user")).toHaveLength(1);
    expect(state.repository.appendMessage.mock.calls.filter(([input]) => input.role === "assistant")).toHaveLength(1);
  });

  it("only lets one concurrent retry claim a failed run", async () => {
    const state = setup();
    const request = {
      requestId: "request-concurrent-123", text: "Analyse ma semaine", conversationId: ids.conversation,
    };
    state.generate.mockRejectedValueOnce(new Error("Initial generation failed."));
    await expect(respondToAssistant("user-1", request, { apiKey: "test-key", dependencies: state as never }))
      .rejects.toMatchObject({ code: "assistant_generation_failed" });

    let releaseGeneration!: () => void;
    state.generate.mockImplementationOnce(() => new Promise((resolve) => {
      releaseGeneration = () => resolve({ text: "Verdict utile", finishReason: "stop", totalUsage: { inputTokens: 12, outputTokens: 4 } });
    }) as never);
    const firstRetry = respondToAssistant("user-1", request, { apiKey: "test-key", dependencies: state as never });
    await Promise.resolve();
    const competingRetry = respondToAssistant("user-1", request, { apiKey: "test-key", dependencies: state as never });
    await expect(competingRetry).rejects.toMatchObject({ code: "assistant_request_in_progress", status: 409 });
    expect(state.generate).toHaveBeenCalledTimes(2);
    releaseGeneration();
    await expect(firstRetry).resolves.toMatchObject({ replayed: false });
    expect(state.repository.claimRun.mock.calls.map(([claim]) => claim.expectedStatus)).toEqual(["queued", "failed", "failed"]);
    expect(state.repository.appendMessage.mock.calls.filter(([input]) => input.role === "user")).toHaveLength(1);
  });

  it("replays an edited request from its fork without mistaking the source conversation for a conflict", async () => {
    const state = setup();
    state.repository.findRunByRequestId.mockResolvedValueOnce({
      id: ids.run, status: "completed", output_message_id: ids.assistantMessage, triggering_message_id: ids.userMessage,
      conversation_id: ids.forkConversation,
    } as never);
    state.repository.findMessage
      .mockResolvedValueOnce({ ...state.user, conversation_id: ids.forkConversation })
      .mockResolvedValueOnce({ ...state.assistant, conversation_id: ids.forkConversation });

    const result = await respondToAssistant("user-1", {
      requestId: "request-edit-123",
      text: "Analyse ma semaine",
      conversationId: ids.conversation,
      editMessageId: ids.editedMessage,
    }, { apiKey: "test-key", dependencies: state as never });

    expect(result).toMatchObject({ replayed: true, conversationId: ids.forkConversation });
    expect(state.createAgent).not.toHaveBeenCalled();
  });

  it("sends only an owned current JPEG attachment to GPT-6 Luna", async () => {
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

  it("reuses the persisted photo attachment when retrying a failed generation", async () => {
    const state = setup();
    const attachment = {
      id: "55555555-5555-4555-8555-555555555555", user_id: "user-1", conversation_id: ids.conversation,
      message_id: null, object_path: "assistant/user-1/conversation/photo.jpg", media_type: "image/jpeg", byte_size: 3,
      sha256: createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex"), purpose: "context", status: "available",
      created_at: "2026-09-21T12:00:00.000Z",
    };
    state.repository.findAttachment.mockResolvedValue(attachment as never);
    state.repository.loadAttachment.mockResolvedValue({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as never);
    state.generate.mockRejectedValueOnce(new Error("Temporary model failure."));
    const request = {
      requestId: "request-photo-retry-123", text: "Analyse cette photo", conversationId: ids.conversation,
      attachmentIds: [attachment.id],
    };

    await expect(respondToAssistant("user-1", request, { apiKey: "test-key", dependencies: state as never }))
      .rejects.toMatchObject({ code: "assistant_generation_failed" });
    const result = await respondToAssistant("user-1", request, { apiKey: "test-key", dependencies: state as never });

    expect(result.userMessage.parts).toEqual([
      { type: "text", text: "Analyse cette photo" },
      { type: "attachment", attachmentId: attachment.id, mediaType: "image/jpeg" },
    ]);
    expect(state.repository.appendMessage.mock.calls.filter(([input]) => input.role === "user")).toHaveLength(1);
    expect(state.repository.attachAttachmentToMessage).toHaveBeenCalledTimes(2);
    expect(state.generate).toHaveBeenCalledTimes(2);
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

  it("forks the conversation before regenerating from an edited user message", async () => {
    const state = setup();

    const result = await respondToAssistant("user-1", {
      requestId: "request-edit-123",
      text: "Je veux gagner 4 kg de masse musculaire en quatre mois.",
      conversationId: ids.conversation,
      editMessageId: ids.editedMessage,
    }, { apiKey: "test-key", dependencies: state as never });

    expect(state.repository.forkConversationAtMessage).toHaveBeenCalledWith({
      userId: "user-1",
      conversationId: ids.conversation,
      messageId: ids.editedMessage,
    });
    expect(state.repository.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: ids.forkConversation,
      role: "user",
    }));
    expect(result.conversationId).toBe(ids.forkConversation);
  });

  it("retries an edited turn in its original fork instead of creating another conversation", async () => {
    const state = setup();
    state.repository.findConversation.mockImplementation(async (_userId, conversationId) => ({
      id: conversationId, title: "Conversation reprise", summary: null, summary_through_sequence: 0,
    }) as never);
    state.generate.mockRejectedValueOnce(new Error("Temporary model failure."));
    const request = {
      requestId: "request-edit-retry-123",
      text: "Question corrigée",
      conversationId: ids.conversation,
      editMessageId: ids.editedMessage,
    };

    await expect(respondToAssistant("user-1", request, { apiKey: "test-key", dependencies: state as never }))
      .rejects.toMatchObject({ code: "assistant_generation_failed" });
    const result = await respondToAssistant("user-1", request, { apiKey: "test-key", dependencies: state as never });

    expect(result.conversationId).toBe(ids.forkConversation);
    expect(state.repository.forkConversationAtMessage).toHaveBeenCalledTimes(1);
    expect(state.repository.appendMessage.mock.calls.filter(([input]) => input.role === "user")).toHaveLength(1);
    expect(state.repository.findConversation).toHaveBeenCalledWith("user-1", ids.forkConversation);
    expect(state.generate).toHaveBeenCalledTimes(2);
  });

  it("rejects an edit without its source conversation", async () => {
    const state = setup();
    await expect(respondToAssistant("user-1", {
      requestId: "request-edit-123",
      text: "Objectif corrigé",
      editMessageId: ids.editedMessage,
    }, { apiKey: "test-key", dependencies: state as never })).rejects.toThrow(/conversation est requise/i);
    expect(state.repository.forkConversationAtMessage).not.toHaveBeenCalled();
  });
});

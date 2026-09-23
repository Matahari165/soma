import { beforeEach, describe, expect, it, vi } from "vitest";

import { assistantDatabaseRequest } from "./database";
import {
  attachAssistantAttachmentToMessage,
  createAssistantAttachment,
  deleteAssistantAttachmentMetadata,
  findAssistantAttachment,
  listAssistantAttachments,
  saveAssistantGoalSet,
} from "./index";

vi.mock("./database", () => ({
  assistantDatabaseRequest: vi.fn(),
  assistantFilter: (value: string) => encodeURIComponent(value),
}));

const userId = "user-1";
const conversationId = "00000000-0000-4000-8000-000000000001";
const attachmentId = "00000000-0000-4000-8000-000000000002";
const objectPath = `assistant/${userId}/${conversationId}/${attachmentId}.png`;

describe("assistant attachment repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects paths outside the exact user and conversation before persistence", async () => {
    await expect(createAssistantAttachment({
      userId, conversationId, objectPath: `assistant/other/${conversationId}/${attachmentId}.png`,
      mediaType: "image/png", byteSize: 100, sha256: "a".repeat(64), purpose: "context",
    })).rejects.toThrow(/does not match its owner/);
    expect(assistantDatabaseRequest).not.toHaveBeenCalled();
  });

  it("derives the metadata id from the validated object path", async () => {
    vi.mocked(assistantDatabaseRequest).mockResolvedValue([{ id: attachmentId }]);
    await createAssistantAttachment({
      userId, conversationId, objectPath, mediaType: "image/png", byteSize: 100,
      sha256: "a".repeat(64), purpose: "meal",
    });
    expect(assistantDatabaseRequest).toHaveBeenCalledWith("assistant_attachments", expect.objectContaining({
      method: "POST",
      body: expect.objectContaining({ id: attachmentId, user_id: userId, conversation_id: conversationId, object_path: objectPath }),
    }));
  });

  it("scopes every metadata operation by user and conversation where applicable", async () => {
    vi.mocked(assistantDatabaseRequest).mockResolvedValue([{ id: attachmentId, conversation_id: conversationId, message_id: null }]);
    await listAssistantAttachments(userId, conversationId);
    await findAssistantAttachment(userId, attachmentId);
    await attachAssistantAttachmentToMessage(userId, conversationId, attachmentId, "00000000-0000-4000-8000-000000000003");
    await deleteAssistantAttachmentMetadata(userId, attachmentId);

    const paths = vi.mocked(assistantDatabaseRequest).mock.calls.map(([path]) => path);
    expect(paths[0]).toContain(`user_id=eq.${userId}&conversation_id=eq.${conversationId}`);
    expect(paths[1]).toContain(`user_id=eq.${userId}&id=eq.${attachmentId}`);
    expect(paths[2]).toContain(`user_id=eq.${userId}&id=eq.${attachmentId}`);
    expect(paths[3]).toContain(`user_id=eq.${userId}&conversation_id=eq.${conversationId}&id=eq.${attachmentId}&message_id=is.null`);
    expect(paths[4]).toContain(`user_id=eq.${userId}&id=eq.${attachmentId}`);
  });
});

describe("assistant goal save", () => {
  beforeEach(() => vi.clearAllMocks());

  const confirmationMessageId = "00000000-0000-4000-8000-000000000003";
  const goalSet = {
    primaryDirection: "Développer la force et la masse musculaire",
    secondaryDirections: ["Améliorer la santé générale"],
    goals: [{ label: "Courir 25 km en une sortie", domain: "effort" as const }],
  };

  function mockGoalDatabase(options: { loseSetResponse?: boolean; loseConfirmationResponse?: boolean; failConfirmation?: boolean } = {}) {
    let storedSet: Record<string, unknown> | null = null;
    let storedGoals: Array<Record<string, unknown>> = [];
    let loseSetResponse = options.loseSetResponse ?? false;
    let loseConfirmationResponse = options.loseConfirmationResponse ?? false;
    vi.mocked(assistantDatabaseRequest).mockImplementation(async (path, request) => {
      if (path.startsWith("assistant_goal_sets?")) return (storedSet ? [storedSet] : []) as never;
      if (path === "assistant_goal_sets") {
        storedSet = { ...(request?.body as Record<string, unknown>), confirmed_by_message_id: null };
        if (loseSetResponse) { loseSetResponse = false; throw new Error("goal set response lost"); }
        return undefined as never;
      }
      if (path === "assistant_goals" && request?.method === "POST") {
        if (!storedGoals.length) storedGoals = request.body as Array<Record<string, unknown>>;
        return undefined as never;
      }
      if (path.startsWith("assistant_goals?")) return storedGoals.map(({ position, label, domain, baseline, target, horizon, cadence, constraints, success_criteria }) =>
        ({ position, label, domain, baseline, target, horizon, cadence, constraints, success_criteria })) as never;
      if (path === "rpc/confirm_assistant_goal_set") {
        if (options.failConfirmation) throw new Error("confirmation unavailable");
        storedSet = { ...storedSet, status: "confirmed", confirmed_by_message_id: confirmationMessageId };
        if (loseConfirmationResponse) { loseConfirmationResponse = false; throw new Error("confirmation response lost"); }
        return storedSet as never;
      }
      throw new Error(`Unexpected database path: ${path}`);
    });
    return { getSet: () => storedSet, getGoals: () => storedGoals };
  }

  it("writes and verifies goals before reporting success", async () => {
    const store = mockGoalDatabase();
    const saved = await saveAssistantGoalSet(userId, confirmationMessageId, goalSet);
    expect(saved).toMatchObject({ saved: true, active: true, replayed: false });
    expect(store.getSet()).toMatchObject({ id: saved.id, status: "confirmed" });
    expect(store.getGoals()).toHaveLength(1);
  });

  it("replays the same confirmation without another write", async () => {
    mockGoalDatabase();
    await saveAssistantGoalSet(userId, confirmationMessageId, goalSet);
    vi.mocked(assistantDatabaseRequest).mockClear();
    await expect(saveAssistantGoalSet(userId, confirmationMessageId, goalSet)).resolves.toMatchObject({ saved: true, replayed: true });
    expect(vi.mocked(assistantDatabaseRequest).mock.calls.every(([, request]) => !request?.method || request.method === "GET")).toBe(true);
  });

  it("recovers from lost create and confirmation responses without duplicate goals", async () => {
    const store = mockGoalDatabase({ loseSetResponse: true, loseConfirmationResponse: true });
    await expect(saveAssistantGoalSet(userId, confirmationMessageId, goalSet)).resolves.toMatchObject({ saved: true, active: true });
    expect(store.getGoals()).toHaveLength(1);
    expect(vi.mocked(assistantDatabaseRequest).mock.calls.filter(([path]) => path === "assistant_goal_sets")).toHaveLength(1);
  });

  it("reuses its draft after a failed confirmation instead of creating another", async () => {
    const store = mockGoalDatabase({ failConfirmation: true });
    await expect(saveAssistantGoalSet(userId, confirmationMessageId, goalSet)).rejects.toThrow("confirmation unavailable");
    const draftId = store.getSet()?.id;
    await expect(saveAssistantGoalSet(userId, confirmationMessageId, goalSet)).rejects.toThrow("confirmation unavailable");
    expect(store.getSet()?.id).toBe(draftId);
    expect(store.getGoals()).toHaveLength(1);
    expect(vi.mocked(assistantDatabaseRequest).mock.calls.filter(([path]) => path === "assistant_goal_sets")).toHaveLength(1);
  });

  it("refuses to change the goal content on retry", async () => {
    mockGoalDatabase({ failConfirmation: true });
    await expect(saveAssistantGoalSet(userId, confirmationMessageId, goalSet)).rejects.toThrow("confirmation unavailable");
    await expect(saveAssistantGoalSet(userId, confirmationMessageId, { ...goalSet, primaryDirection: "Un autre objectif" })).rejects.toThrow(/different goal set/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { assistantDatabaseRequest } from "./database";
import {
  attachAssistantAttachmentToMessage,
  createAssistantAttachment,
  forkAssistantConversationAtMessage,
  deleteAssistantAttachmentMetadata,
  findAssistantAttachment,
  findAssistantAttachmentInConversation,
  listAssistantMessages,
  listAssistantAttachments,
  loadActiveAssistantPlan,
  loadActiveAssistantPlans,
  loadConfirmedAssistantMemories,
  loadPendingAssistantChanges,
  proposeAssistantGoalRevision,
  proposeAssistantPlanVersion,
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

  it("only reopens an available photo when the authenticated user's conversation references it", async () => {
    vi.mocked(assistantDatabaseRequest).mockImplementation(async (path) => {
      if (path.startsWith("assistant_attachments?") && path.includes(`id=eq.${attachmentId}`)) return [{
        id: attachmentId, user_id: userId, conversation_id: conversationId, message_id: "00000000-0000-4000-8000-000000000003",
        object_path: `${objectPath}`, media_type: "image/png", byte_size: 10, sha256: "a".repeat(64), purpose: "context", status: "available", created_at: "2026-09-23T12:00:00.000Z",
      }] as never;
      if (path.startsWith("assistant_messages?")) return [{ id: "00000000-0000-4000-8000-000000000003", sequence: 4 }] as never;
      return [] as never;
    });

    await expect(findAssistantAttachmentInConversation(userId, conversationId, attachmentId)).resolves.toMatchObject({
      id: attachmentId, user_id: userId, conversation_id: conversationId, status: "available",
    });
    expect(vi.mocked(assistantDatabaseRequest).mock.calls[1]?.[0]).toContain(`user_id=eq.${userId}&conversation_id=eq.${conversationId}`);
    expect(vi.mocked(assistantDatabaseRequest).mock.calls[1]?.[0]).toContain("parts=cs.");
  });

  it("follows explicit message pages past the default PostgREST row cap", async () => {
    const rows = Array.from({ length: 1_002 }, (_, index) => ({
      id: crypto.randomUUID(), user_id: userId, conversation_id: conversationId, sequence: index + 1,
      role: "user", parts: [{ type: "text", text: `Message ${index + 1}` }], status: "completed", parent_message_id: null,
      created_at: "2026-09-23T12:00:00.000Z",
    }));
    vi.mocked(assistantDatabaseRequest).mockImplementation(async (path) => {
      const after = Number(/sequence=gt\.(\d+)/u.exec(path)?.[1] ?? 0);
      return rows.filter((row) => row.sequence > after).slice(0, 500) as never;
    });

    const history = await listAssistantMessages(userId, conversationId);
    expect(history).toHaveLength(1_002);
    expect(history[0]?.sequence).toBe(1);
    expect(history.at(-1)?.sequence).toBe(1_002);
    const paths = vi.mocked(assistantDatabaseRequest).mock.calls.map(([path]) => path);
    expect(paths).toHaveLength(3);
    expect(paths[0]).toContain("&limit=500");
    expect(paths[1]).toContain("sequence=gt.500");
    expect(paths[2]).toContain("sequence=gt.1000");
  });
});

describe("conversation edits create a coherent branch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies only history before the edited user message and preserves its evidence references", async () => {
    const forkId = "00000000-0000-4000-8000-000000000040";
    const targetId = "00000000-0000-4000-8000-000000000003";
    const photoId = "00000000-0000-4000-8000-000000000022";
    const sourceMessages = [
      { id: "00000000-0000-4000-8000-000000000001", user_id: userId, conversation_id: conversationId, sequence: 1, role: "user", parts: [{ type: "text", text: "Contexte ancien." }, { type: "attachment", attachmentId: photoId, mediaType: "image/jpeg" }], status: "completed", parent_message_id: null, created_at: "2026-09-23T12:00:00Z" },
      { id: "00000000-0000-4000-8000-000000000002", user_id: userId, conversation_id: conversationId, sequence: 2, role: "assistant", parts: [{ type: "text", text: "Réponse ancienne." }, { type: "data-summary", label: "Données Soma consultées", period: { from: "2026-06-01", to: "2026-08-30" }, itemCount: 91, domains: ["sleep"] }], status: "completed", parent_message_id: null, created_at: "2026-09-23T12:00:00Z" },
      { id: targetId, user_id: userId, conversation_id: conversationId, sequence: 3, role: "user", parts: [{ type: "text", text: "Question modifiée." }], status: "completed", parent_message_id: null, created_at: "2026-09-23T12:00:00Z" },
      { id: "00000000-0000-4000-8000-000000000004", user_id: userId, conversation_id: conversationId, sequence: 4, role: "assistant", parts: [{ type: "text", text: "Réponse après cible." }], status: "completed", parent_message_id: targetId, created_at: "2026-09-23T12:00:00Z" },
    ];
    const appended: Array<Record<string, unknown>> = [];
    vi.mocked(assistantDatabaseRequest).mockImplementation(async (path, request) => {
      if (path.startsWith("assistant_conversations?") && path.includes(`id=eq.${conversationId}`)) return [{
        id: conversationId, user_id: userId, title: "Discussion", status: "active", summary: "legacy summary", summary_through_sequence: 2,
        created_at: "2026-09-23T12:00:00Z", updated_at: "2026-09-23T12:00:00Z",
      }] as never;
      if (path.startsWith("assistant_messages?") && path.includes(`id=eq.${targetId}`)) return [sourceMessages[2]] as never;
      if (path.startsWith("assistant_messages?")) return sourceMessages as never;
      if (path === "assistant_conversations" && request?.method === "POST") return [{
        id: forkId, user_id: userId, title: "Discussion", status: "active", summary: null, summary_through_sequence: 0,
        created_at: "2026-09-24T12:00:00Z", updated_at: "2026-09-24T12:00:00Z",
      }] as never;
      if (path === "rpc/append_assistant_message") {
        const body = request?.body as Record<string, unknown>;
        appended.push(body);
        return [{
          id: body.p_message_id, user_id: userId, conversation_id: forkId, sequence: appended.length,
          role: body.p_role, parts: body.p_parts, status: "completed", parent_message_id: body.p_parent_message_id, created_at: "2026-09-24T12:00:00Z",
        }] as never;
      }
      throw new Error(`Unexpected database path: ${path}`);
    });

    const fork = await forkAssistantConversationAtMessage({ userId, conversationId, messageId: targetId });
    expect(fork).toMatchObject({ id: forkId, summary: null, summary_through_sequence: 0 });
    expect(appended).toHaveLength(2);
    expect(appended[0]?.p_parts).toEqual(sourceMessages[0]?.parts);
    expect(appended[1]?.p_parts).toEqual(sourceMessages[1]?.parts);
    expect(JSON.stringify(appended)).not.toContain("Réponse après cible");
    expect(JSON.stringify(appended)).not.toContain(targetId);
    expect(appended[0]?.p_parts).toContainEqual(expect.objectContaining({ attachmentId: photoId }));
  });
});

describe("assistant goal revisions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("changes one goal while preserving the other goals and the confirmed set", async () => {
    const goalOneId = "00000000-0000-4000-8000-000000000011";
    const goalTwoId = "00000000-0000-4000-8000-000000000012";
    const savedSetId = "00000000-0000-4000-8000-000000000013";
    vi.mocked(assistantDatabaseRequest).mockImplementation(async (path, request) => {
      if (path.startsWith("assistant_goal_sets?") && path.includes("status=eq.confirmed")) return [{ id: attachmentId, primary_direction: "Développer la force", primary_goal_type: "build_muscle", secondary_directions: ["Courir"] }] as never;
      if (path.startsWith("assistant_goals?")) return [
        { id: goalOneId, label: "Soulever 80 kg", domain: "effort", baseline: null, target: { value: 80, unit: "kg", note: null }, horizon: null, cadence: null, constraints: [], success_criteria: [] },
        { id: goalTwoId, label: "Courir 20 km", domain: "effort", baseline: null, target: { value: 20, unit: "km", note: null }, horizon: null, cadence: null, constraints: [], success_criteria: [] },
      ] as never;
      if (path === "assistant_goal_sets" && request?.method === "POST") return [{ id: savedSetId, status: "draft" }] as never;
      if (path === "assistant_goals" && request?.method === "POST") return undefined as never;
      return [] as never;
    });
    await proposeAssistantGoalRevision(userId, conversationId, {
      goalUpdates: [{ goalId: goalTwoId, changes: { target: { value: 15, unit: "km", note: null } } }],
    });
    const setInsert = vi.mocked(assistantDatabaseRequest).mock.calls.find(([path]) => path === "assistant_goal_sets");
    const goalInsert = vi.mocked(assistantDatabaseRequest).mock.calls.find(([path]) => path === "assistant_goals");
    expect(setInsert?.[1]?.body).toMatchObject({ supersedes_goal_set_id: attachmentId, primary_direction: "Développer la force", primary_goal_type: "build_muscle" });
    expect(goalInsert?.[1]?.body).toMatchObject([{ label: "Soulever 80 kg", target: { value: 80 } }, { label: "Courir 20 km", target: { value: 15 } }]);
  });
});

describe("plans follow the confirmed objective", () => {
  beforeEach(() => vi.clearAllMocks());

  const plan = {
    title: "Progression course", objectiveSummary: "Courir avec régularité",
    phases: [], detailedThrough: "2026-10-01", reviewOn: "2026-10-02",
    sections: [{ domain: "running", title: "Séances", content: [{ title: "Sortie facile", description: "Progression graduelle" }] }],
  };

  it("links a new plan to the current goal even when the model omits its id", async () => {
    vi.mocked(assistantDatabaseRequest).mockImplementation(async (path, request) => {
      if (path.startsWith("assistant_goal_sets?")) return [{ id: attachmentId, primary_direction: "Améliorer la course", secondary_directions: [] }] as never;
      if (path.startsWith("assistant_goals?")) return [] as never;
      if (path === "assistant_plans") return [{ id: conversationId }] as never;
      if (path.startsWith("assistant_plan_versions?")) return [] as never;
      if (path === "assistant_plan_versions") return [{ id: crypto.randomUUID(), version: 1, status: "proposed" }] as never;
      throw new Error(`Unexpected database path: ${path} ${request?.method ?? "GET"}`);
    });
    await proposeAssistantPlanVersion({ userId, goalSetId: null, sourceMessageId: conversationId, body: plan });
    expect(vi.mocked(assistantDatabaseRequest).mock.calls.find(([path]) => path === "assistant_plans")?.[1]?.body).toMatchObject({ goal_set_id: attachmentId });
  });

  it("rejects a plan explicitly linked to an old goal", async () => {
    vi.mocked(assistantDatabaseRequest).mockImplementation(async (path) => {
      if (path.startsWith("assistant_goal_sets?")) return [{ id: attachmentId, primary_direction: "Améliorer la course", secondary_directions: [] }] as never;
      if (path.startsWith("assistant_goals?")) return [] as never;
      throw new Error(`Unexpected database path: ${path}`);
    });
    await expect(proposeAssistantPlanVersion({ userId, goalSetId: conversationId, sourceMessageId: conversationId, body: plan })).rejects.toThrow(/outdated goal/);
    expect(vi.mocked(assistantDatabaseRequest).mock.calls.some(([path]) => path === "assistant_plans")).toBe(false);
  });
});

describe("assistant context retrieval", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters confirmed memories by their validity dates in the user's calendar day", async () => {
    vi.mocked(assistantDatabaseRequest).mockResolvedValue([]);
    await loadConfirmedAssistantMemories(userId, "2026-09-23");
    const path = vi.mocked(assistantDatabaseRequest).mock.calls[0][0];
    expect(path).toContain(`user_id=eq.${userId}&status=eq.confirmed`);
    expect(path).toContain("or(valid_from.is.null,valid_from.lte.2026-09-23)");
    expect(path).toContain("or(valid_until.is.null,valid_until.gte.2026-09-23)");
    expect(path).toContain("limit=101");
  });

  it("loads each active plan's confirmed version without crossing users", async () => {
    vi.mocked(assistantDatabaseRequest).mockImplementation(async (path) => {
      if (path.startsWith("assistant_plans?")) return [{ id: attachmentId, goal_set_id: null, updated_at: "2026-09-23T10:00:00Z" }] as never;
      if (path.startsWith("assistant_plan_versions?")) return [{ id: conversationId, version: 2, body: { title: "Plan" }, confirmed_at: "2026-09-23T10:00:00Z" }] as never;
      throw new Error(`Unexpected database path: ${path}`);
    });
    const result = await loadActiveAssistantPlans(userId);
    expect(result.complete).toBe(true);
    expect(result.activePlans[0].confirmedVersion).toMatchObject({ version: 2 });
    for (const [path] of vi.mocked(assistantDatabaseRequest).mock.calls) expect(path).toContain(`user_id=eq.${userId}`);
    expect(vi.mocked(assistantDatabaseRequest).mock.calls[1][0]).toContain(`status=eq.confirmed`);
  });

  it("does not read a version when the active plan is not owned by this user", async () => {
    vi.mocked(assistantDatabaseRequest).mockResolvedValue([]);
    await expect(loadActiveAssistantPlan(userId, attachmentId)).resolves.toBeNull();
    expect(assistantDatabaseRequest).toHaveBeenCalledTimes(1);
  });

  it("flags an overfull active-plan inventory instead of silently presenting it as complete", async () => {
    const plans = Array.from({ length: 11 }, (_, index) => ({ id: `plan-${index}`, goal_set_id: null, updated_at: "2026-09-23T10:00:00Z" }));
    vi.mocked(assistantDatabaseRequest).mockImplementation(async (path) => (path.startsWith("assistant_plans?") ? plans : []) as never);
    const result = await loadActiveAssistantPlans(userId);
    expect(result).toMatchObject({ complete: false });
    expect(result.activePlans).toHaveLength(10);
  });

  it("recovers the concrete goals attached to a pending draft for natural confirmation", async () => {
    vi.mocked(assistantDatabaseRequest).mockImplementation(async (path) => {
      if (path.startsWith("assistant_goal_sets?")) return [{ id: attachmentId, primary_direction: "Force", secondary_directions: ["Course"], updated_at: "2026-09-23T10:00:00Z" }] as never;
      if (path.startsWith("assistant_goals?")) return [{ position: 0, label: "Courir 30 km", domain: "effort", baseline: null, target: null }] as never;
      return [] as never;
    });
    const result = await loadPendingAssistantChanges(userId);
    expect(result.goalSets[0]).toMatchObject({ primary_direction: "Force", goals: [{ label: "Courir 30 km" }] });
    expect(vi.mocked(assistantDatabaseRequest).mock.calls.find(([path]) => path.startsWith("assistant_goals?"))?.[0]).toContain(`user_id=eq.${userId}&goal_set_id=eq.${attachmentId}`);
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
      if (path.startsWith("assistant_goals?")) return storedGoals.map(({ position, label, status, domain, baseline, target, horizon, cadence, constraints, success_criteria }) =>
        ({ position, label, status, domain, baseline, target, horizon, cadence, constraints, success_criteria })) as never;
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

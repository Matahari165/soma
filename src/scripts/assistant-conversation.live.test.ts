import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";

import { DEFAULT_NUTRITION_TARGETS, type NutritionTargets } from "@/domain/nutrition-targets";

if (!process.env.OPENAI_API_KEY) {
  try {
    const line = readFileSync(process.env.SOMA_ASSISTANT_LIVE_KEY_FILE ?? ".env.local", "utf8")
      .split(/\r?\n/u).find((entry) => entry.startsWith("OPENAI_API_KEY="));
    const raw = line?.slice("OPENAI_API_KEY=".length).trim();
    if (raw) process.env.OPENAI_API_KEY = raw.replace(/^['"]|['"]$/gu, "");
  } catch {
    // An absent local key skips the live test without touching another provider.
  }
}

const fixture = vi.hoisted(() => ({
  goalId: "00000000-0000-4000-8000-000000000011",
  setId: "00000000-0000-4000-8000-000000000012",
  draftId: "00000000-0000-4000-8000-000000000013",
  actionId: "00000000-0000-4000-8000-000000000014",
  goalTargetKm: 30,
  goalDraft: null as null | Record<string, unknown>,
  nutritionTargets: null as null | NutritionTargets,
  nutritionAction: null as null | Record<string, unknown>,
  nutritionWrites: 0,
}));

vi.mock("@/modules/assistant/tools/audited-tool", () => ({
  executeAuditedAssistantTool: async ({ execute }: { execute: () => Promise<unknown> }) => execute(),
}));

vi.mock("@/modules/assistant/tools/query-soma-data", async () => {
  const [{ tool }, { z }] = await Promise.all([import("ai"), import("zod")]);
  return { createQuerySomaDataTool: () => tool({
    description: "Synthetic running history for this isolated test only.", inputSchema: z.object({}),
    execute: async () => ({ period: "last 8 weeks", runningSessions: 8, longestRunKm: 10, complete: true }),
  }) };
});

vi.mock("@/modules/assistant/tools/get-strongest-effects", async () => {
  const [{ tool }, { z }] = await Promise.all([import("ai"), import("zod")]);
  return { createGetStrongestEffectsTool: () => tool({
    description: "No synthetic strongest-effect evidence available.", inputSchema: z.object({}),
    execute: async () => ({ complete: true, effects: [] }),
  }) };
});

vi.mock("@/modules/assistant/tools/get-plan-details", async () => {
  const [{ tool }, { z }] = await Promise.all([import("ai"), import("zod")]);
  return { createGetPlanDetailsTool: () => tool({
    description: "No plan is present in this synthetic test.", inputSchema: z.object({}),
    execute: async () => ({ status: "not_found" }),
  }) };
});

vi.mock("@/modules/assistant/tools/manage-meal", async () => {
  const [{ tool }, { z }] = await Promise.all([import("ai"), import("zod")]);
  return { createManageMealTool: () => tool({
    description: "Meal recording is unavailable in this synthetic test.", inputSchema: z.object({}),
    execute: async () => ({ saved: false }),
  }) };
});

vi.mock("@/modules/assistant/tools/user-context", () => ({
  loadAssistantUserContext: async () => ({
    profile: { timezone: "Europe/Zurich", age: 31, heightCm: 178, weightKg: 76, sexForHealthCalculations: "male" },
    confirmedGoals: {
      goalSet: { id: fixture.setId, primary_direction: "Développer l'endurance en course", primary_goal_type: "improve_endurance", secondary_directions: ["Maintenir la force"] },
      goals: [
        { id: fixture.goalId, label: "Courir 30 km", status: "active", domain: "effort", baseline: { value: 10, unit: "km", note: null }, target: { value: fixture.goalTargetKm, unit: "km", note: null }, horizon: null, cadence: null, constraints: [], success_criteria: [] },
        { id: "00000000-0000-4000-8000-000000000015", label: "Maintenir deux séances de force hebdomadaires", status: "active", domain: "effort", baseline: null, target: null, horizon: null, cadence: null, constraints: [], success_criteria: [] },
      ],
    },
    legacyGoals: [], confirmedMemories: [], confirmedMemoriesComplete: true,
    activePlans: [], activePlansComplete: true, plansNeedingReview: [], plansNeedingReviewComplete: true,
    pendingChanges: { memories: [], goalSets: fixture.goalDraft ? [fixture.goalDraft] : [], planVersions: [] },
  }),
}));

vi.mock("@/services/nutrition-targets", () => ({
  loadNutritionTargetsStateForUser: async () => ({ targets: fixture.nutritionTargets ?? DEFAULT_NUTRITION_TARGETS, persisted: fixture.nutritionWrites > 0 }),
  saveNutritionTargetsForUser: async (_userId: string, targets: NutritionTargets) => {
    fixture.nutritionTargets = targets;
    fixture.nutritionWrites += 1;
    return targets;
  },
}));

vi.mock("@/modules/assistant/repository", () => ({
  loadPendingAssistantChanges: async () => ({ memories: [], goalSets: fixture.goalDraft ? [fixture.goalDraft] : [], planVersions: [] }),
  loadConfirmedGoalContext: async () => ({ goalSet: { id: fixture.setId, primary_direction: "Développer l'endurance en course", primary_goal_type: "improve_endurance", secondary_directions: ["Maintenir la force"] }, goals: [] }),
  proposeAssistantGoalRevision: async (_userId: string, _messageId: string, revision: Record<string, unknown>) => {
    const updates = revision.goalUpdates as Array<{ goalId: string; changes: { target?: { value: number } } }>;
    const target = updates?.find((item) => item.goalId === fixture.goalId)?.changes.target?.value;
    if (typeof target !== "number") throw new Error("Expected a precise running target revision.");
    fixture.goalDraft = { id: fixture.draftId, primary_direction: "Développer l'endurance en course", primary_goal_type: "improve_endurance", secondary_directions: ["Maintenir la force"], goals: [{ id: fixture.goalId, target: { value: target, unit: "km", note: null } }] };
    return { goalSet: { id: fixture.draftId, status: "draft" }, goals: fixture.goalDraft.goals };
  },
  confirmAssistantGoalSet: async (_userId: string, draftId: string, messageId: string) => {
    if (draftId !== fixture.goalDraft?.id) throw new Error("Wrong goal draft.");
    fixture.goalTargetKm = Number((fixture.goalDraft.goals as Array<{ target: { value: number } }>)[0].target.value);
    fixture.goalDraft = null;
    return { id: draftId, status: "confirmed", confirmed_by_message_id: messageId };
  },
  loadPendingNutritionTargetActions: async () => fixture.nutritionAction?.state === "proposed" ? [fixture.nutritionAction] : [],
  findAssistantAction: async () => fixture.nutritionAction,
  findAssistantActionByIdempotencyKey: async () => fixture.nutritionAction,
  proposeNutritionTargetAction: async (input: { payload: Record<string, unknown> }) => {
    fixture.nutritionAction = { id: fixture.actionId, action_type: "nutrition_targets.update", state: "proposed", payload: input.payload, confirmation_message_id: null };
    return fixture.nutritionAction;
  },
  confirmNutritionTargetAction: async (_userId: string, _actionId: string, messageId: string) => {
    const after = (fixture.nutritionAction?.payload as { after?: NutritionTargets } | undefined)?.after;
    if (!after) throw new Error("Missing synthetic nutrition proposal");
    if (fixture.nutritionAction?.state === "executed") return { actionId: fixture.actionId, saved: fixture.nutritionTargets === after, targets: fixture.nutritionTargets, replayed: true };
    fixture.nutritionTargets = after;
    fixture.nutritionWrites += 1;
    fixture.nutritionAction = { ...fixture.nutritionAction, state: "executed", confirmation_message_id: messageId };
    return { actionId: fixture.actionId, saved: true, targets: after, replayed: false };
  },
}));

const live = process.env.SOMA_ASSISTANT_LIVE_SMOKE === "1"
  && process.env.SOMA_ASSISTANT_LIVE_CONFIRM === "YES"
  && process.env.CI !== "true"
  && Boolean(process.env.OPENAI_API_KEY);

describe.skipIf(!live).sequential("synthetic Soma assistant conversations with the real model", () => {
  it("revises a goal, then adjusts a numeric meal target after natural confirmations", async () => {
    const { createSomaAssistantAgent } = await import("@/modules/assistant/agent");
    const messages: ModelMessage[] = [];
    const usedTools: string[] = [];
    let turn = 0;
    async function say(text: string) {
      messages.push({ role: "user", content: text });
      const agent = createSomaAssistantAgent({
        userId: "synthetic-user", conversationId: "00000000-0000-4000-8000-000000000001",
        runId: crypto.randomUUID(), quality: "balanced", triggeringMessageId: crypto.randomUUID(), triggeringUserText: text,
      });
      const result = await agent.generate({ messages, timeout: 90_000 });
      expect(result.text.trim()).not.toBe("");
      usedTools.push(...(result.steps ?? []).flatMap((step) => step.toolResults.map((item) => item.toolName)));
      messages.push({ role: "assistant", content: result.text });
      turn += 1;
    }

    await say("Mon objectif de courir 30 km me paraît trop ambitieux. Propose plutôt 15 km. Ne change pas mes deux séances de force.");
    expect(fixture.goalDraft).not.toBeNull();
    expect(fixture.goalTargetKm).toBe(30);
    await say("Oui, mais finalement 12 km serait plus réaliste. Corrige la proposition avant tout enregistrement.");
    expect(fixture.goalTargetKm).toBe(30);
    expect((fixture.goalDraft?.goals as Array<{ target: { value: number } }>)[0].target.value).toBe(12);
    await say("Oui, ça me va. Enregistre cette version.");
    expect(fixture.goalTargetKm).toBe(12);
    await say("Je veux passer ma cible de protéines de base à 180 g par jour. Montre-moi ce que tu vas changer avant de l'enregistrer.");
    expect(fixture.nutritionAction?.state).toBe("proposed");
    expect(fixture.nutritionWrites).toBe(0);
    await say("Finalement, plutôt 170 g. Corrige cette proposition, sans encore enregistrer.");
    expect(fixture.nutritionAction?.state).toBe("proposed");
    expect((fixture.nutritionAction?.payload as { after: NutritionTargets }).after.proteinG.likely).toBe(170);
    expect(fixture.nutritionWrites).toBe(0);
    await say("Oui, c'est bon, enregistre cette cible.");
    expect(fixture.nutritionWrites).toBe(1);
    expect(fixture.nutritionTargets?.proteinG.likely).toBe(170);
    const toolsBeforeReadback = usedTools.length;
    await say("Relis mes cibles nutritionnelles enregistrées et dis-moi la cible de protéines actuelle.");
    expect(usedTools.slice(toolsBeforeReadback)).toContain("manageNutritionTargets");
    expect(fixture.nutritionWrites).toBe(1);
    expect(usedTools).toContain("manageUserContext");
    expect(usedTools).toContain("manageNutritionTargets");
    console.info("[assistant-live-smoke]", { turns: turn, goalConfirmed: fixture.goalTargetKm === 12, nutritionConfirmed: fixture.nutritionWrites === 1 });
  }, 8 * 60_000);
});

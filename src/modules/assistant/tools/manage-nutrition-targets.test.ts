import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import { loadNutritionTargetsStateForUser } from "@/services/nutrition-targets";
import { confirmNutritionTargetAction, findAssistantAction, loadPendingNutritionTargetActions, proposeNutritionTargetAction } from "../repository";
import { applyNutritionTargetPatch, createManageNutritionTargetsTool } from "./manage-nutrition-targets";

vi.mock("@/services/nutrition-targets", () => ({ loadNutritionTargetsStateForUser: vi.fn() }));
vi.mock("../repository", () => ({
  findAssistantAction: vi.fn(), loadPendingNutritionTargetActions: vi.fn(),
  confirmNutritionTargetAction: vi.fn(), proposeNutritionTargetAction: vi.fn(),
}));
vi.mock("./audited-tool", () => ({ executeAuditedAssistantTool: async ({ execute }: { execute: () => Promise<unknown> }) => execute() }));

const userId = "user-1";
const proposalId = "00000000-0000-4000-8000-000000000002";
const messageId = "00000000-0000-4000-8000-000000000003";
const after = applyNutritionTargetPatch(DEFAULT_NUTRITION_TARGETS, { proteinG: { likely: 180 } });
const pendingAction = {
  id: proposalId, action_type: "nutrition_targets.update", state: "proposed",
  payload: { before: DEFAULT_NUTRITION_TARGETS, after }, confirmation_message_id: null,
};
const options = { toolCallId: "call-1", messages: [], abortSignal: undefined } as never;

function nutritionTool(text: string) {
  return createManageNutritionTargetsTool({ userId, runId: "run-1", conversationId: "00000000-0000-4000-8000-000000000001", triggeringMessageId: messageId, triggeringUserText: text });
}

afterEach(() => vi.resetAllMocks());

describe("partial nutrition target changes", () => {
  it("shifts a central target without losing the other ranges", () => {
    expect(after.proteinG).toEqual({ low: 170, likely: 180, high: 190 });
    expect(after.caloriesKcal).toEqual(DEFAULT_NUTRITION_TARGETS.caloriesKcal);
    expect(after.mealDistribution).toEqual(DEFAULT_NUTRITION_TARGETS.mealDistribution);
  });

  it("preserves an explicitly requested zero", () => {
    const next = applyNutritionTargetPatch(DEFAULT_NUTRITION_TARGETS, { surplusKcal: 0, addedSugarG: { likely: 0 } });
    expect(next.surplusKcal).toBe(0);
    expect(next.addedSugarG.likely).toBe(0);
  });

  it("rejects inverted ranges and a meal split that does not total 100", () => {
    expect(() => applyNutritionTargetPatch(DEFAULT_NUTRITION_TARGETS, { proteinG: { low: 200 } })).toThrow(/incohérentes/);
    expect(() => applyNutritionTargetPatch(DEFAULT_NUTRITION_TARGETS, { addedSugarG: { low: 10 } })).toThrow(/incohérentes/);
    expect(() => applyNutritionTargetPatch(DEFAULT_NUTRITION_TARGETS, { mealDistribution: { breakfast: 30, lunch: 40, snack: 0, dinner: 35 } })).toThrow(/incohérentes/);
  });
});

describe("nutrition target conversation", () => {
  it("proposes a real patch without saving yet", async () => {
    vi.mocked(loadNutritionTargetsStateForUser).mockResolvedValue({ targets: DEFAULT_NUTRITION_TARGETS, persisted: true });
    vi.mocked(proposeNutritionTargetAction).mockResolvedValue(pendingAction as never);
    const result = await nutritionTool("Monte mes protéines à 180 g").execute!({ operation: "propose", patch: { proteinG: { likely: 180 } } }, options);
    expect(result).toMatchObject({ proposalId, proposed: { proteinG: { likely: 180 } } });
    expect(proposeNutritionTargetAction).toHaveBeenCalledWith(expect.objectContaining({ userId, payload: expect.objectContaining({ before: DEFAULT_NUTRITION_TARGETS, after }) }));
    expect(confirmNutritionTargetAction).not.toHaveBeenCalled();
  });

  it("confirms once after a natural approval", async () => {
    vi.mocked(loadPendingNutritionTargetActions).mockResolvedValue([pendingAction] as never);
    vi.mocked(loadNutritionTargetsStateForUser).mockResolvedValue({ targets: DEFAULT_NUTRITION_TARGETS, persisted: true });
    vi.mocked(confirmNutritionTargetAction).mockResolvedValue({ actionId: proposalId, saved: true, targets: after, replayed: false });
    const result = await nutritionTool("Oui, ça me va").execute!({ operation: "confirm", targetId: proposalId, confirmationQuote: "ça me va" }, options);
    expect(result).toMatchObject({ saved: true, targets: { proteinG: { likely: 180 } } });
    expect(confirmNutritionTargetAction).toHaveBeenCalledOnce();
    expect(confirmNutritionTargetAction).toHaveBeenCalledWith(userId, proposalId, messageId);
  });

  it("does not write after an approval with a correction", async () => {
    await expect(nutritionTool("Oui, mais plutôt 170 g").execute!({ operation: "confirm", targetId: proposalId, confirmationQuote: "Oui" }, options)).rejects.toThrow(/confirmation explicite/);
    expect(confirmNutritionTargetAction).not.toHaveBeenCalled();
  });

  it("rejects a stale proposal without changing the current targets", async () => {
    vi.mocked(loadPendingNutritionTargetActions).mockResolvedValue([pendingAction] as never);
    vi.mocked(loadNutritionTargetsStateForUser).mockResolvedValue({ targets: applyNutritionTargetPatch(DEFAULT_NUTRITION_TARGETS, { proteinG: { likely: 175 } }), persisted: true });
    await expect(nutritionTool("Oui, c'est bon").execute!({ operation: "confirm", targetId: proposalId, confirmationQuote: "c'est bon" }, options)).rejects.toThrow(/cibles ont changé/);
    expect(confirmNutritionTargetAction).not.toHaveBeenCalled();
  });

  it("replays the same confirmation without another write", async () => {
    vi.mocked(loadPendingNutritionTargetActions).mockResolvedValue([]);
    vi.mocked(findAssistantAction).mockResolvedValue({ ...pendingAction, state: "executed", confirmation_message_id: messageId } as never);
    vi.mocked(confirmNutritionTargetAction).mockResolvedValue({ actionId: proposalId, saved: true, targets: after, replayed: true });
    const result = await nutritionTool("Oui, c'est bon").execute!({ operation: "confirm", targetId: proposalId, confirmationQuote: "c'est bon" }, options);
    expect(result).toMatchObject({ saved: true, replayed: true });
    expect(confirmNutritionTargetAction).toHaveBeenCalledOnce();
  });
});

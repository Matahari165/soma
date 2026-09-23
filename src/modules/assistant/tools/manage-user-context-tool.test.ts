import { afterEach, describe, expect, it, vi } from "vitest";

import { confirmAssistantGoalSet, saveAssistantGoalSet } from "../repository";
import { createManageUserContextTool } from "./manage-user-context";

vi.mock("../repository", () => ({
  confirmAssistantGoalSet: vi.fn(), confirmAssistantMemory: vi.fn(), confirmAssistantPlanVersion: vi.fn(),
  proposeAssistantGoalSet: vi.fn(), proposeAssistantMemory: vi.fn(), proposeAssistantPlanVersion: vi.fn(),
  saveAssistantGoalSet: vi.fn(),
}));
vi.mock("./audited-tool", () => ({ executeAuditedAssistantTool: async ({ execute }: { execute: () => Promise<unknown> }) => execute() }));

const userId = "user-1";
const messageId = "00000000-0000-4000-8000-000000000001";
const goalSetId = "00000000-0000-4000-8000-000000000002";
const goalSet = { primaryDirection: "Développer la force", secondaryDirections: ["Améliorer l'endurance"], goals: [] };
const options = { toolCallId: "call-1", messages: [], abortSignal: undefined } as never;

afterEach(() => vi.clearAllMocks());

describe("natural goal confirmation tool", () => {
  it("saves known directions without demanding optional metrics when the user naturally authorizes it", async () => {
    vi.mocked(saveAssistantGoalSet).mockResolvedValue({ id: goalSetId, saved: true, active: true, replayed: false });
    const tool = createManageUserContextTool({ userId, runId: "run-1", triggeringMessageId: messageId, triggeringUserText: "Bon bah c'est bon, tu peux enregistrer" });
    await expect(tool.execute!({ operation: "save_goal_set", confirmationQuote: "tu peux enregistrer", goalSet }, options)).resolves.toMatchObject({ saved: true, active: true });
    expect(saveAssistantGoalSet).toHaveBeenCalledWith(userId, messageId, goalSet);
  });

  it("confirms the exact draft selected by the agent after a natural approval", async () => {
    vi.mocked(confirmAssistantGoalSet).mockResolvedValue({ id: goalSetId, status: "confirmed", confirmed_by_message_id: messageId });
    const tool = createManageUserContextTool({ userId, runId: "run-1", triggeringMessageId: messageId, triggeringUserText: "Oui, ça me va" });
    await expect(tool.execute!({ operation: "confirm_goal_set", targetId: goalSetId, confirmationQuote: "ça me va" }, options)).resolves.toMatchObject({ status: "confirmed" });
    expect(confirmAssistantGoalSet).toHaveBeenCalledWith(userId, goalSetId, messageId);
  });

  it("does not write after an approval with a correction", async () => {
    const tool = createManageUserContextTool({ userId, runId: "run-1", triggeringMessageId: messageId, triggeringUserText: "Oui, mais retire la course avant d'enregistrer" });
    await expect(tool.execute!({ operation: "save_goal_set", confirmationQuote: "Oui", goalSet }, options)).rejects.toThrow(/confirmation explicite/);
    expect(saveAssistantGoalSet).not.toHaveBeenCalled();
  });
});

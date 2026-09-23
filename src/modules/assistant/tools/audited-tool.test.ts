import { beforeEach, describe, expect, it, vi } from "vitest";

import { completeAssistantToolCall, createAssistantToolCall } from "../repository";
import { executeAuditedAssistantTool } from "./audited-tool";

vi.mock("../repository", () => ({
  createAssistantToolCall: vi.fn(),
  completeAssistantToolCall: vi.fn(),
}));

describe("audited assistant actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAssistantToolCall).mockResolvedValue({ id: "call-1" } as never);
  });

  it("keeps a committed result when only the final audit update fails", async () => {
    vi.mocked(completeAssistantToolCall).mockRejectedValueOnce(new Error("audit temporarily unavailable")).mockResolvedValueOnce(undefined as never);
    const execute = vi.fn().mockResolvedValue({ saved: true });
    await expect(executeAuditedAssistantTool({
      context: { userId: "user-1", runId: "run-1" },
      toolName: "manageUserContext", toolCallId: "tool-1", arguments: { operation: "save_goal_set" },
      execute,
    })).resolves.toEqual({ saved: true });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(completeAssistantToolCall).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadActiveAssistantPlan } from "../repository";
import { createGetPlanDetailsTool } from "./get-plan-details";

vi.mock("../repository", () => ({ loadActiveAssistantPlan: vi.fn() }));
vi.mock("./audited-tool", () => ({ executeAuditedAssistantTool: async ({ execute }: { execute: () => Promise<unknown> }) => execute() }));

const planId = "00000000-0000-4000-8000-000000000001";
const context = { userId: "user-1", runId: "run-1" };

afterEach(() => vi.clearAllMocks());

describe("getPlanDetails", () => {
  it("returns a bounded section page with an explicit continuation cursor", async () => {
    vi.mocked(loadActiveAssistantPlan).mockResolvedValue({
      id: planId, goal_set_id: null, updated_at: "2026-09-23T10:00:00Z",
      confirmedVersion: { id: "version-1", version: 3, confirmed_at: "2026-09-23T10:00:00Z", body: {
        title: "Course", objectiveSummary: "Progresser régulièrement", detailedThrough: "2026-10-01", reviewOn: "2026-10-02", phases: [],
        sections: [{ domain: "running", title: "Séances", content: Array.from({ length: 3 }, (_, index) => ({ title: `Séance ${index + 1}`, description: "Facile", scheduledFor: null, successCriteria: [] })) }],
      } },
    });
    const tool = createGetPlanDetailsTool(context);
    const first = await tool.execute!({ planId, sectionIndex: 0, cursor: 0, limit: 2 }, { toolCallId: "call-1", messages: [], abortSignal: undefined } as never);
    expect(first).toMatchObject({ found: true, version: 3, nextCursor: 2, complete: false, items: [{ title: "Séance 1" }, { title: "Séance 2" }] });
    const final = await tool.execute!({ planId, sectionIndex: 0, cursor: 2, limit: 2 }, { toolCallId: "call-2", messages: [], abortSignal: undefined } as never);
    expect(final).toMatchObject({ nextCursor: null, complete: true, items: [{ title: "Séance 3" }] });
    expect(loadActiveAssistantPlan).toHaveBeenCalledWith("user-1", planId);
  });

  it("returns no plan content for an unowned or inactive plan", async () => {
    vi.mocked(loadActiveAssistantPlan).mockResolvedValue(null);
    const tool = createGetPlanDetailsTool(context);
    await expect(tool.execute!({ planId, sectionIndex: 0, cursor: 0, limit: 10 }, { toolCallId: "call-1", messages: [], abortSignal: undefined } as never)).resolves.toEqual({ found: false, reason: "not_active_or_not_owned" });
  });
});

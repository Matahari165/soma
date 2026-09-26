import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAssistantLabAnalyses } from "../data/lab-analyses";
import { createQueryLabAnalysesTool } from "./query-lab-analyses";

vi.mock("../data/lab-analyses", () => ({ loadAssistantLabAnalyses: vi.fn() }));
vi.mock("./audited-tool", () => ({ executeAuditedAssistantTool: async ({ execute }: { execute: () => Promise<unknown> }) => execute() }));

afterEach(() => vi.clearAllMocks());

describe("queryLabAnalyses", () => {
  it("defaults the window to 90 days and scopes reads to the authenticated user", async () => {
    vi.mocked(loadAssistantLabAnalyses).mockResolvedValue({ periods: [90] } as never);
    const query = createQueryLabAnalysesTool({ userId: "user-1", runId: "run-1" });

    const result = await query.execute!({} as never, { toolCallId: "call-1", messages: [], abortSignal: undefined } as never);

    expect(loadAssistantLabAnalyses).toHaveBeenCalledWith("user-1", expect.objectContaining({
      periods: [90],
      mode: "summary",
      includeExploratory: false,
      offset: 0,
      limit: 40,
    }));
    expect(result).toEqual({ periods: [90] });
  });

  it("passes predictor, outcome, compare windows and pagination without broadening the request", async () => {
    vi.mocked(loadAssistantLabAnalyses).mockResolvedValue({ periods: [15, 30, 90, "all"] } as never);
    const query = createQueryLabAnalysesTool({ userId: "user-2", runId: "run-2" });

    await query.execute!({
      periods: [15, 30, 90, "all"], predictorId: "journal:variable-1", outcomeId: "hrv",
      mode: "compare", includeExploratory: true, offset: 40, limit: 20,
    }, { toolCallId: "call-2", messages: [], abortSignal: undefined } as never);

    expect(loadAssistantLabAnalyses).toHaveBeenCalledWith("user-2", expect.objectContaining({
      periods: [15, 30, 90, "all"], predictorId: "journal:variable-1", outcomeId: "hrv",
      mode: "compare", includeExploratory: true, offset: 40, limit: 20,
    }));
  });
});

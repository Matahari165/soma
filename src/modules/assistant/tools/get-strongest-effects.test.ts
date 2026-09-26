import { afterEach, describe, expect, it, vi } from "vitest";

import { selectSummaryRelations } from "@/domain/lab/matrix";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

import { createGetStrongestEffectsTool } from "./get-strongest-effects";

vi.mock("@/services/personal-lab", () => ({ getPersonalLabSnapshot: vi.fn() }));
vi.mock("@/domain/lab/matrix", () => ({ selectSummaryRelations: vi.fn() }));
vi.mock("./audited-tool", () => ({ executeAuditedAssistantTool: async ({ execute }: { execute: () => Promise<unknown> }) => execute() }));

afterEach(() => vi.clearAllMocks());

describe("getStrongestEffects", () => {
  it("returns only bounded, computed associations and coverage for the authenticated user", async () => {
    vi.mocked(getPersonalLabSnapshot).mockResolvedValue({
      coverage: { healthDays: 45, calendarDays: 0, checkinDays: 10, journalDays: 8, pairedDeepWorkDays: 0, rangeDays: 90 },
      matrix: { rows: [{ relations: [{ predictorLabel: "Sommeil", outcomeLabel: "Récupération" }] }] },
      journal: { entries: [{ secret: "not exposed" }] },
    } as never);
    vi.mocked(selectSummaryRelations).mockReturnValue([{
      predictorLabel: "Sommeil", outcomeLabel: "Récupération", outcomeUnit: "%", comparisonLabel: "Sommeil long vs court",
      effect: 4, effectConfidenceLow: 1, effectConfidenceHigh: 7, lagDays: 1, sampleSize: 40,
      evidence: "promising", stable: true, coverageBySource: [],
    }] as never);
    const tool = createGetStrongestEffectsTool({ userId: "user-1", runId: "run-1" });
    const result = await tool.execute!({ period: 90, requireTemporalStability: true }, { toolCallId: "call-1", messages: [], abortSignal: undefined } as never);
    expect(getPersonalLabSnapshot).toHaveBeenCalledWith({ id: "user-1", email: null, displayName: "" }, { periods: [90] });
    expect(selectSummaryRelations).toHaveBeenCalledWith(expect.any(Array), { requireTemporalStability: true });
    expect(result).toMatchObject({ period: 90, relationCount: 1, relations: [{ predictor: "Sommeil", outcome: "Récupération", effect: 4 }] });
    expect(JSON.stringify(result)).not.toContain("not exposed");
  });

  it("uses 90 days when the caller leaves the period unspecified", async () => {
    vi.mocked(getPersonalLabSnapshot).mockResolvedValue({
      coverage: { healthDays: 0, calendarDays: 0, checkinDays: 0, journalDays: 0, pairedDeepWorkDays: 0, rangeDays: 0 },
      matrix: { rows: [] },
    } as never);
    vi.mocked(selectSummaryRelations).mockReturnValue([]);
    const tool = createGetStrongestEffectsTool({ userId: "user-2", runId: "run-2" });

    await tool.execute!({} as never, { toolCallId: "call-2", messages: [], abortSignal: undefined } as never);

    expect(getPersonalLabSnapshot).toHaveBeenCalledWith({ id: "user-2", email: null, displayName: "" }, { periods: [90] });
  });
});

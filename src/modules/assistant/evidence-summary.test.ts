import { describe, expect, it } from "vitest";

import { dataSummaryFromSteps } from "./evidence-summary";

function result(cursor: string | null, returnedItems: number, complete: boolean) {
  return {
    toolName: "querySomaData",
    input: { dataset: "daily_health", period: { from: "2026-01-01", to: "2026-04-30" }, metrics: ["sleep_minutes", "hrv_ms", "running_distance_km"], pagination: { cursor } },
    output: { manifest: {
      dataset: "daily_health", requestedPeriod: { from: "2026-01-01", to: "2026-04-30" },
      coveredPeriod: { from: "2026-01-01", to: "2026-04-30" }, timezone: "Europe/Zurich",
      totalItems: 120, returnedItems, hasMore: !complete, nextCursor: complete ? null : "next-page",
      complete, generatedAt: "2026-09-23T10:00:00.000Z",
    } },
  };
}

describe("assistant evidence summary", () => {
  it("reports only datasets actually read and counts both pages without marking the final result partial", () => {
    const summary = dataSummaryFromSteps([
      { toolResults: [result(null, 100, false)] },
      { toolResults: [result("next-page", 20, true)] },
    ]);
    expect(summary).toEqual({
      type: "data-summary", label: "Données Soma consultées", period: { from: "2026-01-01", to: "2026-04-30" },
      itemCount: 120, domains: ["sleep", "recovery", "effort"],
    });
  });

  it("marks an unfinished query partial instead of implying full coverage", () => {
    expect(dataSummaryFromSteps([{ toolResults: [result(null, 100, false)] }])?.label).toContain("partielle");
  });

  it("does not double-count a repeated data page", () => {
    const summary = dataSummaryFromSteps([{ toolResults: [result(null, 100, false)] }, { toolResults: [result(null, 100, false)] }]);
    expect(summary).toMatchObject({ itemCount: 100, label: "Données Soma consultées · analyse partielle" });
  });

  it("does not invent data proof when no valid query result exists", () => {
    expect(dataSummaryFromSteps([{ toolResults: [{ toolName: "getUserContext", input: {}, output: {} }] }])).toBeNull();
    expect(dataSummaryFromSteps([{ toolResults: [{ toolName: "querySomaData", input: {}, output: { manifest: { dataset: "scores" } } }] }])).toBeNull();
  });
});

it("uses only the latest persisted summary checkpoint when counting an exhaustive history", () => {
  function job(processedItems: number, complete: boolean) {
    return { toolName: "summarizeSomaData", input: { query: { dataset: "activities", period: { from: "2020-01-01", to: "2020-01-31" }, activityTypes: ["BOXING"] } },
      output: { jobId: "test-job", manifest: { dataset: "activities", requestedPeriod: { from: "2020-01-01", to: "2020-01-31" },
        coveredPeriod: { from: "2020-01-01", to: "2020-01-31" }, processedItems, totalItems: 600, complete, hasMore: !complete, generatedAt: "2020-02-01T00:00:00Z" } } };
  }
  expect(dataSummaryFromSteps([{ toolResults: [job(200, false)] }, { toolResults: [job(600, true)] }]))
    .toMatchObject({ itemCount: 600, label: "Données Soma consultées", domains: ["effort"] });
});

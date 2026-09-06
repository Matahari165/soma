import { describe, expect, it } from "vitest";

import { automaticJournalEntriesFor, automaticJournalValueForTests } from "./journal-automatic";
import type { JournalVariable } from "./journal";

function variable(overrides: Partial<JournalVariable>): JournalVariable {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Automatic measure",
    variableType: "boolean",
    unit: null,
    options: [],
    position: 10,
    isActive: true,
    emoji: "🧪",
    defaultValue: null,
    dayPeriod: "day",
    ...overrides,
  };
}

describe("automatic journal values", () => {
  it("records a run only when activity coverage is reliable", () => {
    const run = variable({ name: "Running", captureMode: "automatic", automaticMetricId: "run_day" });
    expect(automaticJournalValueForTests(run, { metric_date: "2026-09-01", running_distance_km: 5, data_quality: { presentTypes: ["exercise"] } })).toBe(true);
    expect(automaticJournalValueForTests(run, { metric_date: "2026-09-02", running_distance_km: null, data_quality: { presentTypes: ["exercise"] } })).toBe(false);
    expect(automaticJournalValueForTests(run, { metric_date: "2026-09-03", running_distance_km: null, data_quality: { presentTypes: [] } })).toBeNull();
  });

  it("evaluates the detected sleep onset in the user's timezone", () => {
    const bedtime = variable({ name: "Coucher avant 23 h", captureMode: "automatic", automaticMetricId: "bedtime_before_23" });
    expect(automaticJournalValueForTests(bedtime, { metric_date: "2026-09-01", bedtime: "2026-09-01T20:45:00.000Z" }, "Europe/Paris")).toBe(true);
    expect(automaticJournalValueForTests(bedtime, { metric_date: "2026-09-02", bedtime: "2026-09-01T22:30:00.000Z" }, "Europe/Paris")).toBe(false);
    expect(automaticJournalValueForTests(bedtime, { metric_date: "2026-09-03", bedtime: "2026-09-03T00:15:00.000Z" }, "Europe/Paris")).toBe(false);
  });

  it("does not replace an existing or explicitly omitted value", () => {
    const run = variable({ captureMode: "automatic", automaticMetricId: "run_day" });
    const health = [{ metric_date: "2026-09-01", running_distance_km: 5, data_quality: { presentTypes: ["exercise"] } }];
    expect(automaticJournalEntriesFor({ variables: [run], health, existingEntries: [{ variableId: run.id, entryDate: "2026-09-01", value: false }] })).toEqual([]);
    expect(automaticJournalEntriesFor({ variables: [run], health, existingEntries: [], omittedVariableIdsByDate: new Map([["2026-09-01", new Set([run.id])]]) })).toEqual([]);
  });
});

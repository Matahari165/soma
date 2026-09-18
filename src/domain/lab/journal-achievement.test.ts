import { describe, expect, it } from "vitest";

import { journalAchievementsFor } from "./journal-achievement";
import type { JournalDay, JournalEntry, JournalVariable } from "./journal";

function variable(overrides: Partial<JournalVariable> = {}): JournalVariable {
  return {
    id: "variable-1",
    name: "Running",
    variableType: "boolean",
    unit: null,
    options: [],
    position: 1,
    isActive: true,
    emoji: "🏃",
    defaultValue: null,
    dayPeriod: "day",
    captureMode: "manual",
    automaticMetricId: null,
    trackingCadence: "daily",
    ...overrides,
  };
}

function day(entryDate: string, status: JournalDay["status"] = "validated", omittedVariableIds: string[] = []): JournalDay {
  return { entryDate, status, validatedAt: status === "validated" ? `${entryDate}T12:00:00.000Z` : null, omittedVariableIds };
}

function entry(entryDate: string, value: JournalEntry["value"]): JournalEntry {
  return { variableId: "variable-1", entryDate, value };
}

describe("journalAchievementsFor", () => {
  it("scores a daily measure only across recorded values", () => {
    const result = journalAchievementsFor({
      variables: [variable()],
      entries: [entry("2026-09-01", true), entry("2026-09-02", false)],
      days: [day("2026-09-01"), day("2026-09-02"), day("2026-09-03", "draft")],
      todayDate: "2026-09-03",
      windowDays: 3,
    });
    expect(result[0]).toMatchObject({ percentage: 50, successPeriods: 1, observedPeriods: 2 });
  });

  it("does not turn an unfinished weekly period into a failure", () => {
    const result = journalAchievementsFor({
      variables: [variable({ trackingCadence: "weekly" })],
      entries: [],
      days: [day("2026-09-01")],
      todayDate: "2026-09-03",
      windowDays: 3,
    });
    expect(result[0]).toMatchObject({ percentage: null, successPeriods: 0, observedPeriods: 0 });
  });

  it("keeps validated but unanswered habits outside the denominator", () => {
    const result = journalAchievementsFor({
      variables: [variable()],
      entries: [],
      days: [day("2026-09-01", "validated", ["variable-1"])],
      todayDate: "2026-09-02",
      windowDays: 2,
    });
    expect(result[0]).toMatchObject({ percentage: null, successPeriods: 0, observedPeriods: 0 });
  });

  it("keeps a completed unanswered weekly period outside the denominator", () => {
    const result = journalAchievementsFor({
      variables: [variable({ trackingCadence: "weekly" })],
      entries: [],
      days: [day("2026-08-26", "validated", ["variable-1"])],
      todayDate: "2026-09-06",
      windowDays: 12,
    });
    expect(result[0]).toMatchObject({ percentage: null, successPeriods: 0, observedPeriods: 0 });
  });

  it("counts a completed weekly target once, not once per day", () => {
    const result = journalAchievementsFor({
      variables: [variable({ trackingCadence: "weekly" })],
      entries: [entry("2026-08-26", true)],
      days: [day("2026-08-26")],
      todayDate: "2026-09-06",
      windowDays: 12,
    });
    expect(result[0]).toMatchObject({ percentage: 100, successPeriods: 1, observedPeriods: 1 });
  });

  it("keeps automatic no-source days outside the denominator", () => {
    const result = journalAchievementsFor({
      variables: [variable({ captureMode: "automatic", automaticMetricId: "run_day", trackingCadence: "weekly" })],
      entries: [entry("2026-08-26", false)],
      days: [],
      todayDate: "2026-09-06",
      windowDays: 12,
    });
    expect(result[0]).toMatchObject({ percentage: 0, successPeriods: 0, observedPeriods: 1 });
  });

  it("treats up to 4 g of added sugar as success for the zero-goal objective", () => {
    const sugar = variable({ name: "Added sugar", variableType: "number", unit: "g", captureMode: "automatic", automaticMetricId: "meal_added_sugar" });
    const result = journalAchievementsFor({
      variables: [sugar],
      entries: [entry("2026-09-01", 0), entry("2026-09-02", 5)],
      days: [],
      todayDate: "2026-09-02",
      windowDays: 2,
    });
    expect(result[0]).toMatchObject({ percentage: 50, successPeriods: 1, observedPeriods: 2 });
  });
});

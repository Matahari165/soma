import { describe, expect, it } from "vitest";

import { automaticJournalEntriesFor } from "./journal-automatic";
import { explicitNoBreakfastByDate, lightBreakfastThresholdKcal, lightBreakfastValue } from "./journal-meal-automatic";
import type { ConfirmedMealRecord } from "./meals";

function meal(overrides: Partial<ConfirmedMealRecord> = {}): ConfirmedMealRecord {
  return {
    id: "meal-1",
    mealDate: "2026-09-01",
    mealType: "breakfast",
    status: "confirmed",
    origin: "homemade",
    caloriesKcal: { low: 250, likely: 300, high: 340 },
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    mouthHeat: null,
    stomachOverfullness: null,
    ...overrides,
  };
}

describe("automatic light breakfast", () => {
  it("personalises the threshold and keeps it bounded", () => {
    expect(lightBreakfastThresholdKcal()).toBe(350);
    expect(lightBreakfastThresholdKcal(2400)).toBe(360);
    expect(lightBreakfastThresholdKcal(2000)).toBe(300);
    expect(lightBreakfastThresholdKcal(4000)).toBe(450);
  });

  it("counts an explicitly validated no-breakfast day as light", () => {
    expect(lightBreakfastValue({ meals: [], explicitlyNoBreakfast: true })).toBe(true);
  });

  it("keeps an unrecorded day unknown", () => {
    expect(lightBreakfastValue({ meals: [] })).toBeNull();
  });

  it("uses the nutrition range instead of false precision", () => {
    expect(lightBreakfastValue({ meals: [meal()], dailyTargetKcal: 2400 })).toBe(true);
    expect(lightBreakfastValue({ meals: [meal({ caloriesKcal: { low: 330, likely: 440, high: 520 } })], dailyTargetKcal: 2400 })).toBeNull();
    expect(lightBreakfastValue({ meals: [meal({ caloriesKcal: { low: 500, likely: 560, high: 650 } })], dailyTargetKcal: 2400 })).toBe(false);
  });

  it("requires an explicit validated Breakfast=false signal", () => {
    const variables = [{
      id: "breakfast",
      name: "Breakfast",
      variableType: "boolean" as const,
      unit: null,
      options: [],
      position: 10,
      isActive: true,
      emoji: "🍳",
      defaultValue: null,
      dayPeriod: "morning" as const,
    }];
    expect(explicitNoBreakfastByDate({
      variables,
      entries: [{ variableId: "breakfast", entryDate: "2026-09-01", value: false }],
      days: [{ entryDate: "2026-09-01", status: "draft", validatedAt: null, omittedVariableIds: [] }],
    })).toEqual(new Set());
    expect(explicitNoBreakfastByDate({
      variables,
      entries: [{ variableId: "breakfast", entryDate: "2026-09-01", value: false }],
      days: [{ entryDate: "2026-09-01", status: "validated", validatedAt: "2026-09-01T08:00:00.000Z", omittedVariableIds: [] }],
    })).toEqual(new Set(["2026-09-01"]));
  });

  it("publishes the automatic yes value for an explicit no-breakfast day", () => {
    const variable = {
      id: "light-breakfast",
      name: "Light breakfast",
      variableType: "boolean" as const,
      unit: null,
      options: [],
      position: 10,
      isActive: true,
      emoji: "🍳",
      defaultValue: null,
      dayPeriod: "morning" as const,
      captureMode: "automatic" as const,
      automaticMetricId: "light_breakfast",
      trackingCadence: "daily" as const,
    };
    expect(automaticJournalEntriesFor({
      variables: [variable],
      health: [],
      mealRecordsByDate: new Map(),
      explicitlyNoBreakfastByDate: new Set(["2026-09-01"]),
      existingEntries: [],
    })).toEqual([{ variableId: "light-breakfast", entryDate: "2026-09-01", value: true, source: "automatic" }]);
  });
});

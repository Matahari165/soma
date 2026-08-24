import { describe, expect, it } from "vitest";

import { defaultJournalVariables, journalDayPeriod, journalFieldHint, journalValueAsNumber, journalVariableSuggestions, normalizeJournalValue, type JournalVariable } from "./journal";

const variable = (variableType: JournalVariable["variableType"], options: string[] = []): JournalVariable => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Test",
  variableType,
  unit: null,
  options,
  position: 0,
  isActive: true,
});

describe("journal values", () => {
  it("keeps zero and false as explicit observations", () => {
    expect(normalizeJournalValue(variable("count"), 0)).toBe(0);
    expect(normalizeJournalValue(variable("boolean"), false)).toBe(false);
  });

  it("turns blank input into an absent observation", () => {
    expect(normalizeJournalValue(variable("duration"), "")).toBeNull();
    expect(normalizeJournalValue(variable("scale"), null)).toBeNull();
  });

  it("places after-midnight bedtimes after evening values", () => {
    expect(journalValueAsNumber(variable("time"), "23:30")).toBe(1410);
    expect(journalValueAsNumber(variable("time"), "00:30")).toBe(1470);
  });

  it("uses objective starter measures and milligrams for caffeine", () => {
    expect(defaultJournalVariables.map((item) => item.name)).toEqual([
      "Vacation",
      "Breakfast",
      "WHM rounds",
      "Caffeine",
      "Deep Work",
      "Added-sugar servings",
      "Alcohol",
      "Dinner end time",
      "Magnesium",
      "Breathing before sleep",
      "Reading before sleep",
      "Masturbation",
      "Dark bedroom",
    ]);
    expect(defaultJournalVariables.find((item) => item.name === "Caffeine")?.unit).toBe("mg");
    expect(defaultJournalVariables.map((item) => String(item.name))).not.toContain("Bedtime");
    expect(journalVariableSuggestions.map((item) => item.name)).toContain("Late meal");
  });

  it("groups starter fields in chronological day periods", () => {
    expect(journalDayPeriod(defaultJournalVariables.find((item) => item.name === "Breakfast")?.position ?? -1)).toBe("morning");
    expect(journalDayPeriod(defaultJournalVariables.find((item) => item.name === "Dinner end time")?.position ?? -1)).toBe("evening");
    expect(journalDayPeriod(defaultJournalVariables.find((item) => item.name === "Dark bedroom")?.position ?? -1)).toBe("sleep");
  });

  it("defines added sugar as low-friction servings", () => {
    const sugar = defaultJournalVariables.find((item) => item.name === "Added-sugar servings");
    expect(sugar?.unit).toBe("servings");
    expect(journalFieldHint({ name: sugar?.name ?? "", variableType: sugar?.variableType ?? "count", unit: sugar?.unit ?? null })).toContain("sweet breakfast");
  });
});

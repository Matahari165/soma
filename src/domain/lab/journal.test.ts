import { describe, expect, it } from "vitest";

import { createJournalVariableSchema, defaultJournalVariables, journalDayPeriod, journalFieldHint, journalValueAsNumber, journalVariableSuggestions, normalizeJournalValue, type JournalVariable } from "./journal";

const variable = (variableType: JournalVariable["variableType"], options: string[] = []): JournalVariable => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Test",
  variableType,
  unit: null,
  options,
  position: 0,
  isActive: true,
  emoji: "🧪",
  defaultValue: null,
  dayPeriod: "day",
});

describe("journal values", () => {
  it("keeps zero and false as explicit observations", () => {
    expect(normalizeJournalValue(variable("count"), 0)).toBe(0);
    expect(normalizeJournalValue(variable("boolean"), false)).toBe(false);
  });

  it("rejects negative starter quantities", () => {
    expect(normalizeJournalValue({ ...variable("number"), name: "Caffeine", unit: "mg" }, -20)).toBeNull();
  });

  it("rejects a custom default that does not match its type", () => {
    expect(createJournalVariableSchema.safeParse({ name: "Supplement", variableType: "boolean", options: [], defaultValue: 0 }).success).toBe(false);
    expect(createJournalVariableSchema.safeParse({ name: "Scale", variableType: "scale", options: [], defaultValue: 0 }).success).toBe(false);
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
      "Illness",
      "Breakfast",
      "WHM",
      "Caffeine",
      "Added sugar",
      "Masturbation",
      "Alcohol",
      "Dinner end time",
      "Magnesium",
      "Breathing exercise",
      "Reading for 30 minutes",
      "Dark room",
    ]);
    expect(defaultJournalVariables.find((item) => item.name === "Caffeine")?.unit).toBe("mg");
    expect(defaultJournalVariables.map((item) => String(item.name))).not.toContain("Bedtime");
    expect(journalVariableSuggestions.map((item) => item.name)).toContain("Late meal");
  });

  it("groups starter fields in chronological day periods", () => {
    expect(journalDayPeriod(defaultJournalVariables.find((item) => item.name === "Breakfast")?.position ?? -1)).toBe("morning");
    expect(journalDayPeriod(defaultJournalVariables.find((item) => item.name === "Dinner end time")?.position ?? -1)).toBe("evening");
    expect(defaultJournalVariables.find((item) => item.name === "Dark room")?.dayPeriod).toBe("sleep");
  });

  it("defines added sugar in approximate grams", () => {
    const sugar = defaultJournalVariables.find((item) => item.name === "Added sugar");
    expect(sugar?.unit).toBe("g");
    expect(journalFieldHint({ name: sugar?.name ?? "", variableType: sugar?.variableType ?? "number", unit: sugar?.unit ?? null })).toBe("g");
  });
});

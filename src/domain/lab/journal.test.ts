import { describe, expect, it } from "vitest";

import { defaultJournalVariables, journalValueAsNumber, journalVariableSuggestions, normalizeJournalValue, type JournalVariable } from "./journal";

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
    expect(defaultJournalVariables.map((item) => item.name)).toEqual(["Alcohol", "Caffeine", "Deep Work", "Bedtime", "Vacation"]);
    expect(defaultJournalVariables.find((item) => item.name === "Caffeine")?.unit).toBe("mg");
    expect(journalVariableSuggestions.map((item) => item.name)).toContain("Late meal");
  });
});

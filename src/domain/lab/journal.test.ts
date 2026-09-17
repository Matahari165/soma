import { describe, expect, it } from "vitest";

import { createJournalVariableSchema, defaultJournalVariables, dinnerTimeForDisplay, healthyHabitCatalog, journalAutomaticDefaultMatches, journalAutomaticMetricIds, journalDayPeriod, journalDraftsForDates, journalEntriesForSave, journalValueAsNumber, journalValueMeetsGoal, journalVariableSuggestions, normalizedAddedSugarJournalValue, normalizeDinnerTimeInput, normalizeJournalValue, reconcileJournalDrafts, updateJournalDraft, type JournalVariable } from "./journal";

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
  it("treats dinner clock input as afternoon time without AM or PM", () => {
    expect(normalizeDinnerTimeInput("8:15")).toBe("20:15");
    expect(normalizeDinnerTimeInput("8h15")).toBe("20:15");
    expect(normalizeDinnerTimeInput("815")).toBe("20:15");
    expect(normalizeDinnerTimeInput("20:15")).toBe("20:15");
    expect(normalizeDinnerTimeInput("8:75")).toBeNull();
  });

  it("displays dinner time in English clock notation without an indicator", () => {
    expect(dinnerTimeForDisplay("20:15")).toBe("8:15");
    expect(dinnerTimeForDisplay("23:05")).toBe("11:05");
    expect(dinnerTimeForDisplay("12:30")).toBe("12:30");
    expect(dinnerTimeForDisplay("")).toBe("");
  });

  it("normalizes existing morning-form dinner entries when reloading and analysing", () => {
    const dinner = { ...variable("time"), id: "00000000-0000-4000-8000-000000000002", name: "Dinner end time" };
    const drafts = journalDraftsForDates(["2026-08-25"], [dinner], [{ variableId: dinner.id, entryDate: "2026-08-25", value: "08:15" }], []);

    expect(drafts["2026-08-25"]?.[dinner.id]).toBe("20:15");
    expect(normalizeJournalValue(dinner, "08:15")).toBe("20:15");
    expect(journalValueAsNumber(dinner, "08:15")).toBe(1215);
  });

  it("keeps drafts and payload dates isolated", () => {
    const dinner = { ...variable("time"), id: "00000000-0000-4000-8000-000000000002", name: "Dinner end time" };
    const dates = ["2026-08-24", "2026-08-25"];
    const drafts = journalDraftsForDates(dates, [dinner], [], []);
    const withDinner = updateJournalDraft(drafts, dates[0], dinner.id, "22:30");

    expect(withDinner[dates[0]]?.[dinner.id]).toBe("22:30");
    expect(withDinner[dates[1]]?.[dinner.id]).toBeNull();
    expect(withDinner[dates[0]]).not.toBe(withDinner[dates[1]]);

    const reloaded = journalDraftsForDates(dates, [dinner], [{ variableId: dinner.id, entryDate: dates[0], value: "22:30" }], []);
    expect(reloaded[dates[0]]?.[dinner.id]).toBe("22:30");
    expect(reloaded[dates[1]]?.[dinner.id]).toBeNull();
  });

  it("refreshes saved dates from the server without overwriting a pending date", () => {
    const server = {
      "2026-08-25": { dinner: "22:30" },
      "2026-08-26": { dinner: "21:15" },
    };
    const current = {
      "2026-08-25": { dinner: "22:00" },
      "2026-08-26": { dinner: "21:45" },
    };

    expect(reconcileJournalDrafts(server, current, new Set(["2026-08-26"]))).toEqual({
      "2026-08-25": { dinner: "22:30" },
      "2026-08-26": { dinner: "21:45" },
    });
  });

  it("autosaves only the changed field but validates the complete day", () => {
    const draft = { dinner: "22:30", caffeine: 75 };

    expect(journalEntriesForSave(["dinner", "caffeine"], draft, "draft", "dinner")).toEqual([
      { variableId: "dinner", value: "22:30" },
    ]);
    expect(journalEntriesForSave(["dinner", "caffeine"], draft, "validate")).toEqual([
      { variableId: "dinner", value: "22:30" },
      { variableId: "caffeine", value: 75 },
    ]);
  });

  it("validates only explicitly recorded or skipped fields", () => {
    const draft = { vacation: false, caffeine: 0, dinner: "22:30" };

    expect(journalEntriesForSave(["vacation", "caffeine", "dinner"], draft, "validate", undefined, new Set(["vacation", "dinner"]))).toEqual([
      { variableId: "vacation", value: false },
      { variableId: "dinner", value: "22:30" },
    ]);
  });

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

  it("requires a compatible source when a metric is automatic", () => {
    expect(createJournalVariableSchema.safeParse({ name: "Running", variableType: "boolean", options: [], captureMode: "automatic", automaticMetricId: "run_day" }).success).toBe(true);
    expect(createJournalVariableSchema.safeParse({ name: "Coucher", variableType: "boolean", options: [], captureMode: "automatic", automaticMetricId: "bedtime" }).success).toBe(false);
    expect(createJournalVariableSchema.safeParse({ name: "Running", variableType: "boolean", options: [], captureMode: "manual", automaticMetricId: "run_day" }).success).toBe(false);
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
      "Light breakfast",
      "Caffeine",
      "Added sugar",
      "Running",
      "Alcohol",
      "Strength training",
      "Dinner end time",
      "Bedtime before 11 PM",
      "Bedtime",
      "Magnesium",
      "Breathing exercise",
      "Reading for 20 minutes",
      "Dark room",
    ]);
    expect(defaultJournalVariables.find((item) => item.name === "Caffeine")?.unit).toBe("mg");
    expect(defaultJournalVariables.find((item) => item.name === "Caffeine")?.dayPeriod).toBe("day");
    expect(defaultJournalVariables.map((item) => String(item.name))).toContain("Bedtime");
    expect(journalVariableSuggestions.map((item) => item.name)).toContain("Late meal");
  });

  it("provides a curated catalogue of healthy habits across three key pillars", () => {
    const sleepHabits = healthyHabitCatalog.filter((h) => h.category === "sleep");
    const nutritionHabits = healthyHabitCatalog.filter((h) => h.category === "nutrition");
    const activityHabits = healthyHabitCatalog.filter((h) => h.category === "activity");

    expect(sleepHabits.length).toBeGreaterThanOrEqual(4);
    expect(nutritionHabits.length).toBeGreaterThanOrEqual(4);
    expect(activityHabits.length).toBeGreaterThanOrEqual(3);
    expect(healthyHabitCatalog.some((h) => h.name.includes("Bedtime"))).toBe(true);
    expect(healthyHabitCatalog.some((h) => h.name.includes("added sugar"))).toBe(true);
    expect(healthyHabitCatalog.some((h) => h.name.includes("Running"))).toBe(true);
  });

  it("configures every automatic journal source as a starter field", () => {
    expect(defaultJournalVariables.flatMap((item) => item.automaticMetricId ? [item.automaticMetricId] : []).sort()).toEqual([...journalAutomaticMetricIds].sort());
    expect(journalAutomaticDefaultMatches(
      { name: "Detected sleep start", automaticMetricId: null },
      { name: "Bedtime", automaticMetricId: "bedtime" },
    )).toBe(true);
  });

  it("groups starter fields in chronological day periods", () => {
    expect(journalDayPeriod(defaultJournalVariables.find((item) => item.name === "Breakfast")?.position ?? -1)).toBe("morning");
    expect(journalDayPeriod(defaultJournalVariables.find((item) => item.name === "Dinner end time")?.position ?? -1)).toBe("evening");
    expect(defaultJournalVariables.find((item) => item.name === "Magnesium")?.dayPeriod).toBe("morning");
    expect(defaultJournalVariables.find((item) => item.name === "Dark room")?.dayPeriod).toBe("evening");
  });

  it("keeps the added sugar unit", () => {
    expect(defaultJournalVariables.find((item) => item.name === "Added sugar")?.unit).toBe("g");
  });

  it("normalizes the added sugar objective with a 4 g tolerance", () => {
    const sugar = { ...variable("number"), name: "Added sugar", unit: "g" };
    expect(normalizedAddedSugarJournalValue(0)).toBe(0);
    expect(normalizedAddedSugarJournalValue(4)).toBe(0);
    expect(normalizedAddedSugarJournalValue(4.1)).toBe(4.1);
    expect(normalizedAddedSugarJournalValue(null)).toBeNull();
    expect(journalValueMeetsGoal(sugar, 4)).toBe(true);
    expect(journalValueMeetsGoal(sugar, 4.1)).toBe(false);
  });
});

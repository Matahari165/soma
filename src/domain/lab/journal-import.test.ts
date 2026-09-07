import { describe, expect, it } from "vitest";

import { planJournalImport, type JournalImportSource } from "./journal-import";
import type { JournalEntry, JournalVariable } from "./journal";

const ids = {
  breakfast: "11111111-1111-4111-8111-111111111111",
  whm: "22222222-2222-4222-8222-222222222222",
  reading: "33333333-3333-4333-8333-333333333333",
};

function variable(id: string, name: string, variableType: JournalVariable["variableType"], unit: string | null = null): JournalVariable {
  return { id, name, variableType, unit, options: [], position: 1, isActive: true, emoji: "🧪", defaultValue: null, dayPeriod: "day", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily" };
}

function source(values: Array<0 | 1 | null>): JournalImportSource {
  return {
    spreadsheetId: "sheet-1",
    sheetName: "Goose",
    headers: [null, "🍳 Breakfast", "🧘‍♂️ WHM", "📖 Lecture"],
    targets: [null, "Light", "5 min", "20"],
    rows: [{ sourceRow: 4, date: "2026-09-04", values }],
  };
}

describe("journal sheet import", () => {
  it("keeps the existing Soma breakfast semantics without creating a conflict", () => {
    const plan = planJournalImport({
      source: source([1, 1, null]),
      variables: [variable(ids.breakfast, "Light breakfast", "boolean")],
      entries: [{ variableId: ids.breakfast, entryDate: "2026-09-04", value: true }],
    });

    expect(plan.conflicts).toHaveLength(0);
    expect(plan.cells.find((cell) => cell.key === "breakfast")?.action).toBe("keep_soma_semantics");
  });

  it("never turns a WHM presence flag into one round", () => {
    const plan = planJournalImport({
      source: source([1, 1, null]),
      variables: [variable(ids.whm, "WHM", "count", "rounds")],
      entries: [{ variableId: ids.whm, entryDate: "2026-09-04", value: 5 }],
    });

    expect(plan.conflicts).toHaveLength(0);
    expect(plan.cells.find((cell) => cell.key === "whm")).toMatchObject({ action: "keep_soma_rounds", normalizedValue: null });
  });

  it("does not invent WHM rounds when Soma has no precise value", () => {
    const plan = planJournalImport({
      source: source([null, 1, null]),
      variables: [],
      entries: [],
    });

    expect(plan.newVariables.some((metric) => metric.key === "whm")).toBe(false);
    expect(plan.cells.find((cell) => cell.key === "whm")?.action).toBe("skip_source_precision");
  });

  it("keeps blanks unfilled and preserves zero as an explicit failure", () => {
    const plan = planJournalImport({
      source: source([null, null, 0]),
      variables: [variable(ids.reading, "Reading for 30 minutes", "boolean")],
      entries: [],
    });

    expect(plan.cells.find((cell) => cell.key === "reading")?.action).toBe("write");
    expect(plan.cells.find((cell) => cell.key === "reading")?.normalizedValue).toBe(false);
    expect(plan.cells.find((cell) => cell.key === "breakfast")?.action).toBe("omit");
  });

  it("reports a direct conflict and applies only an explicit resolution", () => {
    const variables = [variable(ids.reading, "Reading for 30 minutes", "boolean")];
    const entries: JournalEntry[] = [{ variableId: ids.reading, entryDate: "2026-09-04", value: false }];
    const unresolved = planJournalImport({ source: source([null, null, 1]), variables, entries });
    const resolved = planJournalImport({ source: source([null, null, 1]), variables, entries, resolutions: { "2026-09-04:reading": "use_sheet" } });

    expect(unresolved.conflicts[0]).toMatchObject({ sourceHabitName: "Lecture", somaHabitName: "Reading for 30 minutes", sourceValue: 1, somaValue: false });
    expect(unresolved.cells.find((cell) => cell.key === "reading")?.action).toBe("conflict");
    expect(resolved.conflicts).toHaveLength(1);
    expect(resolved.cells.find((cell) => cell.key === "reading")?.action).toBe("write");
  });
});

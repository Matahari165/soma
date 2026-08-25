import { describe, expect, it } from "vitest";

import { variableFromRow, type JournalVariableRow } from "./journal";

function row(overrides: Partial<JournalVariableRow> = {}): JournalVariableRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Caffeine",
    variable_type: "number",
    unit: "mg",
    options: [],
    position: 30,
    is_active: undefined,
    emoji: "☕",
    default_value: 0,
    day_period: "day",
    ...overrides,
  };
}

describe("journal variable compatibility", () => {
  it("keeps legacy D1 variables active when the flag is missing", () => {
    expect(variableFromRow(row()).isActive).toBe(true);
  });

  it("respects an explicit archive flag", () => {
    expect(variableFromRow(row({ is_active: false })).isActive).toBe(false);
  });

  it("keeps automatic bedtime out of the manual journal", () => {
    expect(variableFromRow(row({ name: "Bedtime", is_active: true })).isActive).toBe(false);
  });
});

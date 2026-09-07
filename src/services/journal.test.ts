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

  it("preserves the explicit automatic source configuration", () => {
    const bedtime = variableFromRow(row({ name: "Bedtime", is_active: true, capture_mode: "automatic", automatic_metric_id: "bedtime" }));
    expect(bedtime.isActive).toBe(true);
    expect(bedtime.captureMode).toBe("automatic");
    expect(bedtime.automaticMetricId).toBe("bedtime");
  });

  it("defaults a running source to a weekly target when legacy data has no cadence", () => {
    const running = variableFromRow(row({ name: "Running", capture_mode: "automatic", automatic_metric_id: "run_day" }));
    expect(running.trackingCadence).toBe("weekly");
  });

  it("upgrades the legacy added sugar field to the meal-derived source", () => {
    const sugar = variableFromRow(row({ name: "Added sugar", variable_type: "number", unit: "g", default_value: 0, is_active: true }));
    expect(sugar).toMatchObject({ captureMode: "automatic", automaticMetricId: "meal_added_sugar", defaultValue: null, unit: "g" });
  });
});

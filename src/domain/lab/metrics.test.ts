import { describe, expect, it } from "vitest";

import { healthMetricRegistry, isResultOnlyMetric, metricDefinitionsForHealth, metricRoleFor } from "./metrics";

describe("Personal Lab metric registry", () => {
  it("keeps the approved core roles", () => {
    const roles = new Map(healthMetricRegistry.map((metric) => [metric.id, metric.defaultRole]));
    expect(roles.get("sleep_minutes")).toBe("result");
    expect(roles.get("recovery")).toBe("result");
    expect(roles.get("bedtime")).toBe("influence");
    expect(roles.get("effort")).toBe("influence");
  });

  it("discovers future numeric and boolean health fields without enabling them", () => {
    const definitions = metricDefinitionsForHealth([{ metric_date: "2026-08-24", new_sensor_value: 12.5, new_flag: true, note: "ignored" }]);
    expect(definitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "new_sensor_value", field: "new_sensor_value", defaultRole: "disabled", source: "Google Health" }),
      expect.objectContaining({ id: "new_flag", field: "new_flag", defaultRole: "disabled", source: "Google Health" }),
    ]));
    expect(definitions.some((metric) => metric.id === "note")).toBe(false);
  });

  it("lets a user preference override the default role", () => {
    expect(metricRoleFor("sleep_minutes", new Map([["sleep_minutes", "both"]]))).toBe("result");
    expect(metricRoleFor("sleep_minutes", new Map([["sleep_minutes", "disabled"]]))).toBe("result");
    expect(isResultOnlyMetric("sleep_minutes")).toBe(true);
    expect(isResultOnlyMetric("bedtime")).toBe(false);
    expect(metricRoleFor("future_metric", new Map())).toBe("disabled");
  });
});

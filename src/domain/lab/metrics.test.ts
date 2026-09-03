import { describe, expect, it } from "vitest";

import { healthMetricRegistry, isResultOnlyMetric, metricDefinitionsForHealth, metricRoleFor } from "./metrics";

describe("Personal Lab metric registry", () => {
  it("keeps the approved core roles", () => {
    const roles = new Map(healthMetricRegistry.map((metric) => [metric.id, metric.defaultRole]));
    expect(roles.get("sleep_minutes")).toBe("both");
    expect(roles.get("recovery")).toBe("result");
    expect(roles.get("bedtime")).toBe("influence");
    expect(roles.get("effort")).toBe("influence");
  });

  it("enables the selected activity and running metrics", () => {
    const definitions = new Map(healthMetricRegistry.map((metric) => [metric.id, metric]));
    expect(definitions.get("sedentary_minutes")).toMatchObject({ defaultRole: "influence", source: "Google Health", direction: "lower" });
    expect(definitions.get("active_day")).toMatchObject({ defaultRole: "influence", unit: "yes/no", source: "Soma", direction: "higher" });
    expect(definitions.get("run_day")).toMatchObject({ defaultRole: "influence", unit: "yes/no", source: "Soma", direction: "higher" });
    expect(definitions.get("running_distance")).toMatchObject({ defaultRole: "influence", field: "running_distance_km", unit: "km", source: "Google Health", direction: "higher" });
    expect(definitions.get("running_pace")).toMatchObject({ defaultRole: "both", field: "running_pace_seconds_per_km", unit: "sec/km", source: "Google Health", direction: "lower" });
    expect(definitions.get("running_average_heart_rate")).toMatchObject({ defaultRole: "both", field: "running_average_heart_rate", unit: "bpm", source: "Google Health", direction: "target" });
    expect(definitions.get("vo2_max")).toMatchObject({ defaultRole: "result", unit: "ml/kg/min", source: "Google Health", direction: "higher" });
  });

  it("registers meal series as Soma influences without exposing them as health fields", () => {
    const definitions = new Map(healthMetricRegistry.map((metric) => [metric.id, metric]));
    expect(definitions.get("meal_calories")).toMatchObject({ field: "meal_calories_kcal", unit: "kcal", defaultRole: "influence", source: "Soma" });
    expect(definitions.get("meal_homemade_share")).toMatchObject({ field: "meal_homemade_share_percent", unit: "%", defaultRole: "influence", source: "Soma" });
    expect(definitions.get("meal_mouth_heat_average")).toMatchObject({ field: "meal_mouth_heat_average", unit: "1–5", defaultRole: "influence", source: "Soma" });
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
    expect(metricRoleFor("sleep_minutes", new Map([["sleep_minutes", "both"]]))).toBe("both");
    expect(metricRoleFor("sleep_minutes", new Map([["sleep_minutes", "disabled"]]))).toBe("disabled");
    expect(isResultOnlyMetric("sleep_minutes")).toBe(false);
    expect(isResultOnlyMetric("bedtime")).toBe(false);
    expect(metricRoleFor("future_metric", new Map())).toBe("disabled");
  });
});

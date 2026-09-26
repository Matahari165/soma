import { describe, expect, it } from "vitest";

import { healthMetricRegistry } from "@/domain/lab/metrics";
import type { HealthMetricDay } from "@/services/health-analytics";
import {
  assistantActivityTypeFilterValues,
  assistantActivityTypeMatches,
  assistantDerivedMetricCatalog,
  assistantHealthMetricCatalog,
  assistantHealthMetricFields,
  getAssistantDataCatalog,
} from "./health-catalog";

type DayValueField = Exclude<keyof HealthMetricDay, "metric_date" | "data_quality" | "source_freshness">;
type MissingDayField = Exclude<DayValueField, (typeof assistantHealthMetricFields)[number]>;
const dayFieldsAreComplete: MissingDayField extends never ? true : never = true;

describe("assistant health and activity catalog", () => {
  it("covers every typed daily health field and registry field stored in daily health", () => {
    expect(dayFieldsAreComplete).toBe(true);
    for (const definition of healthMetricRegistry) {
      if (assistantHealthMetricFields.includes(definition.field as (typeof assistantHealthMetricFields)[number])) {
        expect(assistantHealthMetricCatalog.find((metric) => metric.key === definition.field)).toBeDefined();
      }
    }

    expect(new Set(assistantHealthMetricFields)).toEqual(new Set(assistantHealthMetricCatalog.map((metric) => metric.key)));
    expect(assistantHealthMetricCatalog.find((metric) => metric.key === "bedtime")).toMatchObject({ format: "clock", unit: "local time" });
    expect(assistantHealthMetricCatalog.find((metric) => metric.key === "active_day")).toMatchObject({ format: "boolean", source: "soma_calculation" });
    expect(assistantHealthMetricCatalog.map((metric) => metric.key)).toContain("sleep_awake_percent");
    expect(assistantHealthMetricCatalog.map((metric) => metric.key)).toContain("blood_glucose_mg_dl");
    expect(assistantDerivedMetricCatalog.map((metric) => metric.key)).toContain("run_day");
  });

  it("resolves French and English boxing names to the stored exercise type before pagination", () => {
    expect(assistantActivityTypeFilterValues(["boxe"])).toEqual(["BOXING"]);
    expect(assistantActivityTypeFilterValues(["boxing"])).toEqual(["BOXING"]);
    expect(assistantActivityTypeMatches("BOXING", ["boxe"])).toBe(true);
    expect(assistantActivityTypeMatches("RUNNING", ["boxe"])).toBe(false);
  });

  it("publishes the default analysis period with the discoverable catalog", () => {
    expect(getAssistantDataCatalog().defaultAnalysisPeriodDays).toBe(90);
    expect(getAssistantDataCatalog().activityTypes.some((activity) => activity.key === "BOXING")).toBe(true);
  });
});

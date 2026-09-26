import { describe, expect, it } from "vitest";
import { activitySessionPreview } from "./activity-session-preview";

describe("synthetic workout preview", () => {
  it.each(["preview-run", "preview-boxing", "preview-strength"])("has a usable trace and calculated zones for %s", (id) => {
    const result = activitySessionPreview(id, new Date("2026-09-26T12:00:00Z"));
    expect(result?.heartRateSampleCount).toBeGreaterThan(200);
    expect(result?.coverage.percent).toBe(100);
    expect(result?.calculatedZones?.classifiedSeconds).toBe(result?.coverage.activeSeconds);
  });
  it("excludes the strength rest interval from active time", () => {
    const result = activitySessionPreview("preview-strength");
    expect(result?.coverage.activeSeconds).toBe(49 * 60);
    expect(result?.coverage.pauses).toHaveLength(1);
  });
  it("does not invent telemetry for unknown records", () => {
    expect(activitySessionPreview("unknown")).toBeNull();
    expect(activitySessionPreview("__proto__")).toBeNull();
    expect(activitySessionPreview("constructor")).toBeNull();
  });
});

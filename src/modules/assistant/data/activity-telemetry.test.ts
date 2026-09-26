import { expect, it, vi } from "vitest";
import { calculateActivitySessionTelemetry } from "@/domain/health/activity-session-telemetry";
import { loadAssistantActivityTelemetry } from "./activity-telemetry";

function dependencies(found = true) {
  const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  builder.select.mockReturnValue(builder); builder.eq.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue({ data: found ? { start_time: "2020-01-01T12:00:00Z", end_time: "2020-01-01T12:01:00Z", civil_date: "2020-01-01" } : null, error: null });
  const telemetry = calculateActivitySessionTelemetry({ startTime: "2020-01-01T12:00:00Z", endTime: "2020-01-01T12:01:00Z", maximumHeartRate: { bpm: 200, source: "personal" }, heartRateRecords: [
    { measuredAt: "2020-01-01T12:00:00Z", payload: { beatsPerMinute: 120 } },
    { measuredAt: "2020-01-01T12:00:10Z", payload: { beatsPerMinute: 140 } },
  ] });
  return { builder, admin: vi.fn(() => ({ from: vi.fn(() => builder) })), telemetry: vi.fn(async () => telemetry) };
}

it("checks session ownership and returns canonical zones without the graph by default", async () => {
  const deps = dependencies();
  const result = await loadAssistantActivityTelemetry("test-user", { activityId: "test-session" }, deps as unknown as Parameters<typeof loadAssistantActivityTelemetry>[2]);
  expect(deps.builder.eq).toHaveBeenCalledWith("user_id", "test-user");
  expect(deps.builder.eq).toHaveBeenCalledWith("source_record_id", "test-session");
  expect(result.heartRateSamples).toEqual([]);
  expect(result.calculatedZones).toEqual((await deps.telemetry()).calculatedZones);
  expect(result.coverage.gapCount).toBeGreaterThan(0);
});

it("does not fetch telemetry for a missing or foreign session", async () => {
  const deps = dependencies(false);
  await expect(loadAssistantActivityTelemetry("test-user", { activityId: "foreign-session" }, deps as unknown as Parameters<typeof loadAssistantActivityTelemetry>[2])).rejects.toThrow(/not found/);
  expect(deps.telemetry).not.toHaveBeenCalled();
});

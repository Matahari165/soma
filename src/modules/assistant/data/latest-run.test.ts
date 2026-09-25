import { describe, expect, it } from "vitest";

import type { ExerciseSummary } from "@/services/health-analytics";
import { loadLatestRun } from "./latest-run";

function activity(date: string, startTime: string): ExerciseSummary {
  return { id: startTime, type: "RUNNING", date, startTime, distanceKm: 7 } as ExerciseSummary;
}

describe("latest recorded run", () => {
  it("selects the September run ahead of a May run without a model-chosen period", async () => {
    const result = await loadLatestRun("test-user", {
      now: new Date("2026-09-25T10:00:00Z"),
      sources: {
        activities: async () => [activity("2026-05-04", "2026-05-04T08:00:00Z"), activity("2026-09-24", "2026-09-24T08:00:00Z")],
        dailyRuns: async () => [{ metric_date: "2026-09-24", running_distance_km: 7, running_duration_minutes: 42, running_pace_seconds_per_km: 360, running_average_heart_rate: 150 }],
        profile: async () => ({ timezone: "Europe/Paris", lastSyncedAt: "2026-09-25T09:00:00Z" }),
      },
    });
    expect(result.today).toBe("2026-09-25");
    expect(result.latestRecordedDate).toBe("2026-09-24");
    expect(result.latestImportedActivity?.date).toBe("2026-09-24");
    expect(result.syncCoversToday).toBe(true);
  });

  it("exposes stale coverage instead of presenting an old import as a recent real-world run", async () => {
    const result = await loadLatestRun("test-user", {
      now: new Date("2026-09-25T10:00:00Z"),
      sources: {
        activities: async () => [activity("2026-05-04", "2026-05-04T08:00:00Z")],
        dailyRuns: async () => [],
        profile: async () => ({ timezone: "Europe/Paris", lastSyncedAt: "2026-05-05T09:00:00Z" }),
      },
    });
    expect(result.latestRecordedDate).toBe("2026-05-04");
    expect(result.syncCoversToday).toBe(false);
  });

  it("keeps a newer daily run separate from an older detailed activity", async () => {
    const result = await loadLatestRun("test-user", {
      now: new Date("2026-09-25T10:00:00Z"),
      sources: {
        activities: async () => [activity("2026-05-04", "2026-05-04T08:00:00Z")],
        dailyRuns: async () => [{ metric_date: "2026-09-24", running_distance_km: 5, running_duration_minutes: 30, running_pace_seconds_per_km: 360, running_average_heart_rate: null }],
        profile: async () => ({ timezone: "Europe/Paris", lastSyncedAt: "2026-09-25T09:00:00Z" }),
      },
    });
    expect(result.latestRecordedDate).toBe("2026-09-24");
    expect(result.latestImportedActivity?.date).toBe("2026-05-04");
    expect(result.latestDailyMetrics?.metric_date).toBe("2026-09-24");
  });

  it("uses the profile's calendar day around midnight UTC", async () => {
    const result = await loadLatestRun("test-user", {
      now: new Date("2026-09-24T23:30:00Z"),
      sources: {
        activities: async () => [activity("2026-09-25", "2026-09-24T23:20:00Z")],
        dailyRuns: async () => [],
        profile: async () => ({ timezone: "Europe/Paris", lastSyncedAt: null }),
      },
    });
    expect(result.today).toBe("2026-09-25");
    expect(result.latestRecordedDate).toBe("2026-09-25");
  });
});

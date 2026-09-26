import { describe, expect, it } from "vitest";
import type { NormalizedHealthRecord } from "./aggregate";
import { activeHoursDayWindow, calculateActiveHours, refreshActiveHoursSummary } from "./active-hours";

const record = (dataType: string, start: string, end: string, body: Record<string, unknown>): NormalizedHealthRecord => ({
  data_type: dataType,
  civil_date: null,
  start_time: start,
  end_time: end,
  measured_at: end,
  payload: body,
});

const activity = (start: string, end: string, level = "LIGHTLY_ACTIVE") => record("activity-level", start, end, {
  activityLevel: { interval: { startTime: start, endTime: end }, activityLevelType: level },
});

const steps = (start: string, end: string, count: number) => record("steps", start, end, {
  steps: { interval: { startTime: start, endTime: end }, count: String(count) },
});

describe("active hours", () => {
  it("deduplicates overlapping activity intervals and accepts positive evidence with partial coverage", () => {
    const result = calculateActiveHours({
      date: "2026-09-25",
      timeZone: "UTC",
      now: "2026-09-26T00:00:00Z",
      records: [
        activity("2026-09-25T08:00:00Z", "2026-09-25T08:01:00Z"),
        activity("2026-09-25T08:00:00Z", "2026-09-25T08:01:00Z"),
      ],
    });

    const hour = result.hourStates.find((state) => state.key.includes("T08:00"));
    expect(hour).toMatchObject({ status: "active", activeSeconds: 60, coverage: 1 / 60 });
    expect(result.activeHours).toBe(1);
    expect(result.complete).toBe(false);
    expect(result.progress).toBeNull();
  });

  it("unions duplicate step intervals before applying the 100-step threshold", () => {
    const result = calculateActiveHours({
      date: "2026-09-25",
      timeZone: "UTC",
      now: "2026-09-26T00:00:00Z",
      records: [
        steps("2026-09-25T08:00:00Z", "2026-09-25T09:00:00Z", 60),
        steps("2026-09-25T08:00:00Z", "2026-09-25T09:00:00Z", 60),
      ],
    });

    const hour = result.hourStates.find((state) => state.key.includes("T08:00"));
    expect(hour).toMatchObject({ status: "observed_inactive", steps: 60, coverage: 1, source: "steps" });
  });

  it("counts a non-duplicated 100-step interval as an active hour", () => {
    const result = calculateActiveHours({
      date: "2026-09-25",
      timeZone: "UTC",
      now: "2026-09-26T00:00:00Z",
      records: [steps("2026-09-25T08:00:00Z", "2026-09-25T09:00:00Z", 100)],
    });

    expect(result.hourStates.find((state) => state.key.includes("T08:00"))?.status).toBe("active");
  });

  it("uses explicit zero step intervals as observed inactivity and leaves gaps unknown", () => {
    const result = calculateActiveHours({
      date: "2026-09-25",
      timeZone: "UTC",
      now: "2026-09-26T00:00:00Z",
      records: [
        steps("2026-09-25T08:00:00Z", "2026-09-25T09:00:00Z", 0),
        { ...record("steps", "2026-09-25T10:00:00Z", "2026-09-25T11:00:00Z", { dailyRollup: { steps: { countSum: "0" } } }), start_time: null, end_time: null },
      ],
    });

    expect(result.hourStates.find((state) => state.key.includes("T08:00"))?.status).toBe("observed_inactive");
    expect(result.hourStates.find((state) => state.key.includes("T10:00"))?.status).toBe("unknown");
  });

  it("excludes sleep from active time and coverage without inferring a zero for the awake gap", () => {
    const result = calculateActiveHours({
      date: "2026-09-25",
      timeZone: "UTC",
      now: "2026-09-26T00:00:00Z",
      records: [
        activity("2026-09-25T08:00:00Z", "2026-09-25T08:30:00Z"),
        record("sleep", "2026-09-25T08:00:00Z", "2026-09-25T08:30:00Z", {
          sleep: { interval: { startTime: "2026-09-25T08:00:00Z", endTime: "2026-09-25T08:30:00Z" } },
        }),
      ],
    });

    const hour = result.hourStates.find((state) => state.key.includes("T08:00"));
    expect(hour).toMatchObject({ status: "unknown", activeSeconds: null, observedSeconds: 0, awakeSeconds: 1_800, coverage: 0 });
    expect(result.activeHours).toBe(0);
  });

  it("splits local hours across spring and fall DST changes", () => {
    const spring = calculateActiveHours({ date: "2026-03-08", timeZone: "America/Los_Angeles", now: "2026-03-09T07:00:00Z", records: [] });
    const fall = calculateActiveHours({ date: "2026-11-01", timeZone: "America/Los_Angeles", now: "2026-11-02T08:00:00Z", records: [] });

    expect(Date.parse(spring.source.end) - Date.parse(spring.source.start)).toBe(23 * 60 * 60 * 1000);
    const springWindow = activeHoursDayWindow("2026-03-08", "America/Los_Angeles");
    expect(Date.parse(springWindow.end) - Date.parse(springWindow.start)).toBe(23 * 60 * 60 * 1000);
    expect(spring.hourStates).toHaveLength(23);
    expect(spring.hourStates.map((state) => state.label)).not.toContain("02h");
    expect(Date.parse(fall.source.end) - Date.parse(fall.source.start)).toBe(25 * 60 * 60 * 1000);
    expect(fall.hourStates).toHaveLength(25);
    expect(fall.hourStates.filter((state) => state.label === "01h")).toHaveLength(2);
    expect(new Set(fall.hourStates.filter((state) => state.label === "01h").map((state) => state.key)).size).toBe(2);
  });

  it("keeps the current hour pending, then refreshes it to active from the captured evidence", () => {
    const first = calculateActiveHours({
      date: "2026-09-25",
      timeZone: "UTC",
      now: "2026-09-25T08:30:00Z",
      records: [activity("2026-09-25T08:00:00Z", "2026-09-25T08:01:00Z")],
    });
    const current = first.hourStates.find((state) => state.key.includes("T08:00"));
    expect(current?.status).toBe("pending");
    expect(first.hourStates.some((state) => state.start === "2026-09-25T09:00:00.000Z")).toBe(false);

    const refreshed = refreshActiveHoursSummary(first, "2026-09-25T09:01:00Z");
    const completed = refreshed.hourStates.find((state) => state.key.includes("T08:00"));
    expect(completed?.status).toBe("active");
    expect(refreshed.computedAt).toBe("2026-09-25T09:01:00.000Z");
    expect(refreshed.activeHours).toBe(1);
    expect(refreshed.progress).toBeNull();
  });

  it("includes partial current-hour coverage without counting the window as elapsed", () => {
    const result = calculateActiveHours({
      date: "2026-09-25",
      timeZone: "UTC",
      now: "2026-09-25T08:25:00Z",
      records: [steps("2026-09-25T08:00:00Z", "2026-09-25T08:05:00Z", 0)],
    });

    expect(result.elapsedHours).toBe(8);
    expect(result.hourStates.at(-1)).toMatchObject({ status: "pending", coverage: 1 / 12, observedSeconds: 300 });
    expect(result.coverage).toBeCloseTo(1 / 101);
  });
});

import { describe, expect, it } from "vitest";

import { aggregateCalendarEvents, isDeepWorkTitle } from "./aggregate";

describe("Google Calendar aggregation", () => {
  it("requires an explicit DW or Deep Work marker", () => {
    expect(isDeepWorkTitle("DW — thesis")).toBe(true);
    expect(isDeepWorkTitle("Deep Work / analysis")).toBe(true);
    expect(isDeepWorkTitle("Sandwich with David")).toBe(false);
  });

  it("stores durations but no event content", () => {
    const result = aggregateCalendarEvents([
      { summary: "DW — confidential project", start: { dateTime: "2026-08-21T09:00:00+02:00" }, end: { dateTime: "2026-08-21T11:15:00+02:00" } },
      { summary: "Lunch", start: { dateTime: "2026-08-21T12:00:00+02:00" }, end: { dateTime: "2026-08-21T13:00:00+02:00" } },
      { summary: "DW all day", start: { date: "2026-08-22" }, end: { date: "2026-08-23" } },
    ], "Europe/Paris");
    expect(result).toEqual([{ metric_date: "2026-08-21", deep_work_minutes: 135, deep_work_event_count: 1, total_scheduled_minutes: 195, source_event_count: 2 }]);
    expect(JSON.stringify(result)).not.toContain("confidential");
  });
});

import { activeHoursDayWindow, calculateActiveHours } from "@/domain/health/active-hours";
import type { NormalizedHealthRecord } from "@/domain/health/aggregate";

/** Synthetic intervals for the clearly labelled local demonstration. */
export function previewActiveHours(date: string, timezone: string, now: Date) {
  const window = activeHoursDayWindow(date, timezone);
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const records: NormalizedHealthRecord[] = [{ data_type: "sleep", civil_date: date, start_time: window.start, end_time: new Date(start + 8 * 3_600_000).toISOString(), measured_at: null, payload: {} }];
  for (let instant = start + 8 * 3_600_000, index = 0; instant < end; instant += 3_600_000, index++) {
    const begin = new Date(instant).toISOString();
    const finish = new Date(Math.min(end, instant + 3_600_000)).toISOString();
    records.push({ data_type: "activity-level", civil_date: date, start_time: begin, end_time: finish, measured_at: finish, payload: { activityLevel: { interval: { startTime: begin, endTime: finish }, activityLevelType: "SEDENTARY" } } });
    if (index % 4 !== 2) records.push({ data_type: "activity-level", civil_date: date, start_time: begin, end_time: new Date(instant + 60_000).toISOString(), measured_at: begin, payload: { activityLevel: { interval: { startTime: begin, endTime: new Date(instant + 60_000).toISOString() }, activityLevelType: "LIGHTLY_ACTIVE" } } });
  }
  return calculateActiveHours({ date, timeZone: timezone, now, records });
}

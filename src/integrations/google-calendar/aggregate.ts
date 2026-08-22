import type { GoogleCalendarEvent } from "./client";

export type DailyCalendarAggregate = {
  metric_date: string;
  deep_work_minutes: number;
  deep_work_event_count: number;
  total_scheduled_minutes: number;
  source_event_count: number;
};

export function isDeepWorkTitle(summary: string | undefined) {
  return /(?:^|[^a-z0-9])dw(?:$|[^a-z0-9])|deep[\s-]*work/i.test(summary ?? "");
}

function civilDate(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function aggregateCalendarEvents(events: GoogleCalendarEvent[], timeZone: string) {
  const aggregates = new Map<string, DailyCalendarAggregate>();
  for (const event of events) {
    if (event.status === "cancelled" || !event.start?.dateTime || !event.end?.dateTime) continue;
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) continue;
    const minutes = Math.min(1440, Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000)));
    const date = civilDate(start, timeZone);
    const current = aggregates.get(date) ?? {
      metric_date: date,
      deep_work_minutes: 0,
      deep_work_event_count: 0,
      total_scheduled_minutes: 0,
      source_event_count: 0,
    };
    current.total_scheduled_minutes = Math.min(1440, current.total_scheduled_minutes + minutes);
    current.source_event_count += 1;
    if (isDeepWorkTitle(event.summary)) {
      current.deep_work_minutes = Math.min(1440, current.deep_work_minutes + minutes);
      current.deep_work_event_count += 1;
    }
    aggregates.set(date, current);
  }
  return [...aggregates.values()].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
}

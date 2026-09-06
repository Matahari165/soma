import { journalAutomaticSource, journalCaptureMode, journalAutomaticMetricId, type JournalEntry, type JournalEntryValue, type JournalVariable } from "./journal";

export type AutomaticJournalHealthDay = {
  metric_date: string;
  bedtime?: string | null;
  running_distance_km?: number | null;
  running_duration_minutes?: number | null;
  running_pace_seconds_per_km?: number | null;
  running_average_heart_rate?: number | null;
  data_quality?: { presentTypes?: unknown } | null;
};

const reliableActivityTypes = new Set([
  "steps",
  "exercise",
  "daily-exercise-summary",
  "distance",
  "active-minutes",
  "active-zone-minutes",
  "time-in-heart-rate-zone",
  "sedentary-period",
]);

function finitePositive(value: unknown) {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0;
}

function hasReliableActivityCoverage(day: AutomaticJournalHealthDay) {
  const presentTypes = Array.isArray(day.data_quality?.presentTypes) ? day.data_quality.presentTypes : [];
  return presentTypes.some((type) => typeof type === "string" && reliableActivityTypes.has(type));
}

function hasRecordedRun(day: AutomaticJournalHealthDay) {
  return [day.running_distance_km, day.running_duration_minutes, day.running_pace_seconds_per_km, day.running_average_heart_rate].some(finitePositive);
}

function localClock(isoDate: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(isoDate));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return { hour, minute, value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

function automaticValue(variable: JournalVariable, day: AutomaticJournalHealthDay, timeZone: string): JournalEntryValue | null {
  if (journalCaptureMode(variable) !== "automatic") return null;
  const source = journalAutomaticSource(journalAutomaticMetricId(variable));
  if (!source) return null;

  if (source.id === "run_day") return hasReliableActivityCoverage(day) ? hasRecordedRun(day) : null;
  if (!day.bedtime) return null;
  const clock = localClock(day.bedtime, timeZone);
  if (!clock) return null;
  if (source.id === "bedtime") return clock.value;
  // A sleep onset between midnight and noon belongs to the late-night side of
  // the target, not to the next evening's "before 23 h" success.
  return clock.hour >= 12 && clock.value < "23:00";
}

export function automaticJournalEntriesFor(input: {
  variables: readonly JournalVariable[];
  health: readonly AutomaticJournalHealthDay[];
  existingEntries: readonly JournalEntry[];
  omittedVariableIdsByDate?: ReadonlyMap<string, ReadonlySet<string>>;
  from?: string;
  to?: string;
  timeZone?: string;
}) {
  const timeZone = input.timeZone ?? "Europe/Paris";
  const existing = new Set(input.existingEntries.map((entry) => `${entry.variableId}:${entry.entryDate}`));
  const automaticVariables = input.variables.filter((variable) => journalCaptureMode(variable) === "automatic");
  const entries: JournalEntry[] = [];

  for (const variable of automaticVariables) {
    for (const day of input.health) {
      if (input.from && day.metric_date < input.from) continue;
      if (input.to && day.metric_date > input.to) continue;
      if (input.omittedVariableIdsByDate?.get(day.metric_date)?.has(variable.id)) continue;
      if (existing.has(`${variable.id}:${day.metric_date}`)) continue;
      const value = automaticValue(variable, day, timeZone);
      if (value !== null) entries.push({ variableId: variable.id, entryDate: day.metric_date, value });
    }
  }

  return entries;
}

export function automaticJournalValueForTests(variable: JournalVariable, day: AutomaticJournalHealthDay, timeZone = "Europe/Paris") {
  return automaticValue(variable, day, timeZone);
}

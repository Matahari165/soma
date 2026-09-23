import { defaultJournalVariables, type JournalEntry, type JournalVariable } from "@/domain/lab/journal";
import { addDays, dateInTimezone, type CalendarDay, type DailyCheckin, type HealthDay, type ScoreDay } from "./personal-lab-today";

/**
 * Deterministic local data keeps the first screen useful when the preview has
 * no connected health provider. It follows the same input shape as production
 * reads so the builders exercise the real data path.
 */
export function previewData() {
  const today = new Date();
  const health: HealthDay[] = [];
  const scores: ScoreDay[] = [];
  const calendars: CalendarDay[] = [];
  const checkins: DailyCheckin[] = [];
  for (let index = 0; index < 210; index += 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - (209 - index));
    const dateString = date.toISOString().slice(0, 10);
    const rhythm = Math.sin(index * 1.73) * 24 + Math.cos(index / 7) * 11;
    const sleep = Math.round(470 + rhythm);
    const longSleep = sleep >= 480;
    const deepWork = Math.max(25, Math.round((longSleep ? 236 : 104) + Math.sin(index / 2) * 28 + (index % 5) * 4));
    const active = 42 + (index % 5) * 9;
    const vigorous = 4 + (index % 4) * 5;
    const previousVigorous = 4 + ((index + 3) % 4) * 5;
    const previewWeek = Math.floor(index / 7) % 3;
    const steps = 7_200 + (index % 6) * 720;
    health.push({ metric_date: dateString, sleep_minutes: sleep, sleep_efficiency: 89 + Math.sin(index / 4) * 4, sleep_latency_minutes: 14 + Math.sin(index / 3) * 4, sleep_awake_minutes: 31 + Math.cos(index / 4) * 8, sleep_awakenings: 6 + index % 5, sleep_fragmentation: .8 + (index % 5) * .12, sleep_regularity: 78 + Math.cos(index / 6) * 9, cumulative_sleep_debt_minutes: Math.max(0, 500 - sleep), hrv_ms: 50 - previousVigorous * .32 + previewWeek * .6 + Math.sin(index / 5), resting_heart_rate: 60 + previousVigorous * .16 - previewWeek * .8 + Math.sin(index / 5) * .5, steps, zone_minutes: 18 + (index % 5) * 8, bedtime: new Date(`${dateString}T22:${String(5 + index % 45).padStart(2, "0")}:00+02:00`).toISOString(), wake_time: new Date(`${dateString}T07:${String(2 + index % 28).padStart(2, "0")}:00+02:00`).toISOString(), sleep_deep_minutes: sleep * .19, sleep_rem_minutes: sleep * .23, respiratory_rate: 14.2 + Math.sin(index / 9) * .6, oxygen_saturation: 96.4 + Math.cos(index / 8) * .7, skin_temperature_delta: Math.sin(index / 11) * .25, vigorous_zone_minutes: vigorous, peak_zone_minutes: index % 5 === 0 ? 3 : 0, active_minutes: active, sedentary_minutes: 900 - active, exercise_minutes: index % 3 === 0 ? 42 : 0, vo2_max: 46 + index * .01, active_day: steps >= 7_500, running_distance_km: null, running_duration_minutes: null, running_pace_seconds_per_km: null, running_average_heart_rate: null });
    scores.push(
      { score_date: dateString, kind: "sleep", score: Math.round(72 + (sleep - 450) / 5) },
      { score_date: dateString, kind: "recovery", score: Math.round(66 + (sleep - 450) / 4 + Math.sin(index / 5) * 5) },
      { score_date: dateString, kind: "effort", score: 50 + (index % 5) * 6, drivers: { coverage: 1 } },
    );
    calendars.push({ metric_date: dateString, deep_work_minutes: deepWork, deep_work_event_count: deepWork ? 2 : 0, total_scheduled_minutes: deepWork + 210, synced_at: new Date().toISOString() });
    const rating = (value: number) => Math.max(1, Math.min(5, Math.round(value)));
    checkins.push({
      checkin_date: dateString,
      energy: rating(3.2 + (sleep - 470) / 48 + Math.cos(index * .73) * .7),
      focus: rating(3.3 + (sleep - 470) / 42 + Math.sin(index * .81) * .8),
      stress: index % 8 === 0 ? 4 : rating(2.3 + Math.cos(index * .57) * .7),
      mood: rating(3.4 + (sleep - 470) / 60 + Math.sin(index * .49) * .6),
      soreness: 2,
      caffeine_servings: index % 4 === 0 ? 2 : index % 3 === 0 ? 1 : 0,
      alcohol_servings: 0,
      late_meal: index % 9 === 0,
      illness: false,
      deep_work_minutes_override: null,
    });
  }
  const variables = defaultJournalVariables.map((variable, index): JournalVariable => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name: variable.name, variableType: variable.variableType, unit: variable.unit, options: [...variable.options], position: variable.position, isActive: true, emoji: variable.emoji, defaultValue: variable.defaultValue, dayPeriod: variable.dayPeriod, captureMode: variable.captureMode, automaticMetricId: variable.automaticMetricId ?? null, trackingCadence: variable.trackingCadence ?? "daily" }));
  const yesterday = addDays(dateInTimezone("Europe/Paris"), -1);
  const entry = (name: string, value: JournalEntry["value"]): JournalEntry => ({ variableId: variables.find((variable) => variable.name === name)?.id as string, entryDate: yesterday, value });
  const journal = { variables, entries: [entry("Breakfast", true), entry("Added sugar", 18), entry("Alcohol", 0), entry("Dark room", true)], days: [{ entryDate: yesterday, status: "validated" as const, validatedAt: new Date().toISOString(), omittedVariableIds: [] }] };
  return { health, scores, calendars, checkins, journal };
}

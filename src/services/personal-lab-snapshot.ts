import { automaticJournalEntriesFor, type AutomaticJournalHealthDay } from "@/domain/lab/journal-automatic";
import { journalAchievementsFor } from "@/domain/lab/journal-achievement";
import { aggregateConfirmedMeals, mealDailySeries, isMealMetric, type ConfirmedMealRecord } from "@/domain/lab/meals";
import { metricDefinitionsForHealth, metricRoleFor, type MetricRole } from "@/domain/lab/metrics";
import { isPersonalLabMetricAllowed } from "@/domain/lab/matrix";
import type { NutritionTargets } from "@/domain/nutrition-targets";
import { addDays, buildTodayData, dateInTimezone, joinObservations, type CalendarDay, type DailyCheckin, type HealthDay, type ScoreDay } from "./personal-lab-today";
import { buildCorrelationMatrix, overnightFingerprint } from "./personal-lab-analysis";
import type { PersonalLabJournal, PersonalLabJournalData, PersonalLabOverview, PersonalLabSnapshot, PersonalLabSnapshotInput, PersonalLabSupplements } from "./personal-lab-types";

export function buildOverview(input: {
  timeZone: string;
  greetingName: string;
  health: HealthDay[];
  scores: ScoreDay[];
  calendars: CalendarDay[];
  checkins: DailyCheckin[];
  meals?: readonly ConfirmedMealRecord[];
  targets?: NutritionTargets;
}): PersonalLabOverview {
  const todayDate = dateInTimezone(input.timeZone);
  return {
    todayDate,
    overnightFingerprint: overnightFingerprint(input.health.find((day) => day.metric_date === todayDate)),
    greetingName: input.greetingName,
    timeZone: input.timeZone,
    today: buildTodayData(input),
  };
}

function journalWithAutomaticEntries(journal: PersonalLabJournalData, meals: readonly ConfirmedMealRecord[] = [], health: readonly AutomaticJournalHealthDay[] = []): PersonalLabJournalData {
  const mealAddedSugarByDate = new Map(aggregateConfirmedMeals(meals).map((day) => [day.date, day.addedSugarG]));
  const automaticEntries = automaticJournalEntriesFor({ variables: journal.variables, health, mealAddedSugarByDate, existingEntries: journal.entries });
  return { ...journal, entries: [...journal.entries, ...automaticEntries] };
}

export function buildJournalView(timeZone: string, journal: PersonalLabJournalData, meals: readonly ConfirmedMealRecord[] = [], health: readonly AutomaticJournalHealthDay[] = [], supplements: PersonalLabSupplements = { definitions: [], entries: [], error: null }): PersonalLabJournal {
  const todayDate = dateInTimezone(timeZone);
  const earliestDate = addDays(todayDate, -6);
  const entries = journalWithAutomaticEntries(journal, meals, health).entries;
  const achievements = journalAchievementsFor({ variables: journal.variables, entries, days: journal.days, todayDate });
  return {
    todayDate,
    supplements,
    journal: {
      variables: journal.variables,
      entries: entries.filter((entry) => entry.entryDate >= earliestDate && entry.entryDate <= todayDate),
      days: journal.days.filter((day) => day.entryDate >= earliestDate && day.entryDate <= todayDate),
      achievements,
    },
  };
}

type PersonalLabSnapshotBuilderInput = PersonalLabSnapshotInput & {
  meals?: readonly ConfirmedMealRecord[];
  targets?: NutritionTargets;
  metricPreferences?: Array<{ metric_id: string; role: MetricRole }>;
  requestedPeriods?: import("@/domain/lab/matrix").AnalysisPeriod[];
  cachedMatrix?: PersonalLabSnapshot["matrix"];
};

export function buildSnapshot(input: PersonalLabSnapshotBuilderInput): PersonalLabSnapshot {
  const journal = journalWithAutomaticEntries(input.journal, input.meals, input.health);
  const observations = joinObservations(input.health, input.scores, input.calendars, input.checkins);
  const healthByDate = new Map(input.health.map((day) => [day.metric_date, day]));
  const metricPreferences = new Map((input.metricPreferences ?? []).map((item) => [item.metric_id, item.role]));
  const metricDefinitions = metricDefinitionsForHealth(input.health as unknown as Array<Record<string, unknown>>);
  const todayDate = dateInTimezone(input.timeZone);
  const today = buildTodayData(input);
  const checkin = input.checkins.find((day) => day.checkin_date === todayDate) ?? null;
  const validatedDates = new Set(journal.days.filter((day) => day.status === "validated").map((day) => day.entryDate));
  const mealSeries = mealDailySeries(input.meals ?? []);
  const matrix = input.cachedMatrix ?? buildCorrelationMatrix({ health: input.health, observations, variables: journal.variables, entries: journal.entries, meals: input.meals, validatedDates, metricPreferences, metricDefinitions, timeZone: input.timeZone, requestedPeriods: input.requestedPeriods });
  const metricRegistry = metricDefinitions.filter((metric) => isPersonalLabMetricAllowed(metric.id)).map((metric) => {
    const sourceDays = new Map<string, number>();
    const recordedDays = isMealMetric(metric.id)
      ? (() => {
        const series = mealSeries[metric.id];
        const source = "Soma meals";
        if (series) sourceDays.set(source, series.points.length);
        return series?.points.length ?? 0;
      })()
      : metric.id === "recovery" || metric.id === "effort"
      ? input.scores.filter((score) => {
        if (score.kind !== metric.id || score.score === null) return false;
        const source = healthByDate.get(score.score_date)?.data_quality?.primaryWearable ?? "Soma";
        sourceDays.set(source, (sourceDays.get(source) ?? 0) + 1);
        return true;
      }).length
      : input.health.filter((day) => {
        const value = (day as unknown as Record<string, unknown>)[metric.field];
        if (value === null || value === undefined) return false;
        const source = day.data_quality?.primaryWearable ?? metric.source;
        sourceDays.set(source, (sourceDays.get(source) ?? 0) + 1);
        return true;
      }).length;
    return {
      ...metric,
      role: metricRoleFor(metric.id, metricPreferences),
      recordedDays,
      received: recordedDays > 0,
      sources: [...sourceDays].map(([source, days]) => ({ source, days })).sort((first, second) => second.days - first.days),
    };
  });
  const todayHealth = input.health.find((day) => day.metric_date === todayDate);
  const healthConnection = input.connections.find((item) => item.provider === "google_health");
  const calendarConnection = input.connections.find((item) => item.provider === "google_calendar");
  return {
    todayDate,
    overnightFingerprint: overnightFingerprint(todayHealth),
    dateLabel: new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone, weekday: "long", month: "long", day: "numeric" }).format(new Date()),
    greetingName: input.user.displayName,
    checkin,
    journal: {
      variables: journal.variables,
      entries: journal.entries.filter((entry) => entry.entryDate >= addDays(todayDate, -6) && entry.entryDate <= todayDate),
      days: journal.days.filter((day) => day.entryDate >= addDays(todayDate, -6) && day.entryDate <= todayDate),
      achievements: journalAchievementsFor({ variables: journal.variables, entries: journal.entries, days: journal.days, todayDate }),
    },
    today,
    metricRegistry,
    matrix,
    coverage: {
      healthDays: input.health.length,
      calendarDays: input.calendars.filter((day) => day.deep_work_minutes > 0).length,
      checkinDays: input.checkins.length,
      journalDays: new Set(journal.entries.map((entry) => entry.entryDate)).size,
      pairedDeepWorkDays: observations.filter((day) => day.sleepMinutes !== null && day.deepWorkMinutes !== null).length,
      rangeDays: observations.length,
    },
    connections: {
      health: { connected: healthConnection?.status === "connected", lastSyncedAt: healthConnection?.last_synced_at ?? null },
      calendar: { connected: calendarConnection?.status === "connected", lastSyncedAt: calendarConnection?.last_synced_at ?? null },
    },
  } satisfies PersonalLabSnapshot;
}

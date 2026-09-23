import type { LabObservation } from "@/domain/lab/observation";
import { arrivalActivityFor, type ArrivalActivity } from "@/domain/lab/arrival-message";
import { aggregateConfirmedMeals, type ConfirmedMealRecord } from "@/domain/lab/meals";
import { DEFAULT_NUTRITION_TARGETS, nutritionTargetsForEffort, type NutritionTargets } from "@/domain/nutrition-targets";

export type DailyCheckin = {
  checkin_date: string;
  energy: number | null;
  focus: number | null;
  stress: number | null;
  mood: number | null;
  soreness: number | null;
  caffeine_servings: number | null;
  alcohol_servings: number | null;
  late_meal: boolean | null;
  illness: boolean | null;
  deep_work_minutes_override: number | null;
};

export type CalendarDay = {
  metric_date: string;
  deep_work_minutes: number;
  deep_work_event_count: number;
  total_scheduled_minutes: number;
  synced_at: string;
};

export type HealthDay = {
  metric_date: string;
  sleep_minutes: number | null;
  sleep_efficiency: number | null;
  sleep_latency_minutes: number | null;
  sleep_awake_minutes: number | null;
  sleep_awakenings: number | null;
  sleep_fragmentation: number | null;
  sleep_regularity: number | null;
  cumulative_sleep_debt_minutes: number | null;
  hrv_ms: number | null;
  resting_heart_rate: number | null;
  steps: number | null;
  zone_minutes: number | null;
  bedtime: string | null;
  wake_time: string | null;
  sleep_deep_minutes: number | null;
  sleep_rem_minutes: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  skin_temperature_delta: number | null;
  vigorous_zone_minutes: number | null;
  peak_zone_minutes: number | null;
  active_minutes: number | null;
  sedentary_minutes: number | null;
  exercise_minutes: number | null;
  vo2_max: number | null;
  active_day: boolean | null;
  running_distance_km: number | null;
  running_duration_minutes: number | null;
  running_pace_seconds_per_km: number | null;
  running_average_heart_rate: number | null;
  data_quality?: { primaryWearable?: string | null; presentTypes?: string[] };
};

export type ScoreDay = { score_date: string; kind: "sleep" | "recovery" | "effort"; score: number | null; drivers?: Record<string, unknown> };

export type PersonalLabHistoryPoint = {
  date: string;
  sleepMinutes: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  caloriesKcal: number | null;
  calorieTarget?: number | null;
};

export type PersonalLabTodayData = {
  sleepMinutes: number | null;
  sleepRegularity: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  effortCoverage?: number | null;
  caloriesKcal: number | null;
  calorieTarget?: number | null;
  averageSleepMinutes: number | null;
  averageSleepRegularity: number | null;
  averageRecoveryScore: number | null;
  averageEffortScore: number | null;
  averageCaloriesKcal: number | null;
  history: PersonalLabHistoryPoint[];
  deepWorkMinutes: number | null;
  calendarDeepWorkMinutes: number | null;
  deepWorkSource: "calendar" | "corrected" | "missing";
  focus: number | null;
  energy: number | null;
  activity: ArrivalActivity | null;
};

export function dateInTimezone(timeZone: string, value: string | Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function toNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function average(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

function effortCoverage(score: ScoreDay | undefined) {
  const value = toNumber(score?.drivers?.coverage);
  return value !== null && value >= 0 && value <= 1 ? value : null;
}

export function effortContextForDate(scores: ScoreDay[], date: string) {
  const effortRows = scores.filter((score) => score.kind === "effort");
  const current = effortRows.find((score) => score.score_date === date);
  const recent = effortRows.filter((score) => score.score_date >= addDays(date, -29) && score.score_date <= date);
  return {
    effortScore: toNumber(current?.score),
    effortCoverage: effortCoverage(current),
    averageEffortScore: average(recent.map((score) => toNumber(score.score))),
  };
}

export function recentAverages(observations: LabObservation[], todayDate: string) {
  const recent = observations.filter((day) => day.date >= addDays(todayDate, -29) && day.date <= todayDate);
  return {
    averageSleepMinutes: average(recent.map((day) => day.sleepMinutes)),
    averageSleepRegularity: average(recent.map((day) => day.sleepRegularity)),
    averageRecoveryScore: average(recent.map((day) => day.recoveryScore)),
    averageEffortScore: average(recent.map((day) => day.effortScore)),
  };
}

export function joinObservations(health: HealthDay[], scores: ScoreDay[], calendars: CalendarDay[], checkins: DailyCheckin[]) {
  const healthByDate = new Map(health.map((row) => [row.metric_date, row]));
  const calendarByDate = new Map(calendars.map((row) => [row.metric_date, row]));
  const checkinByDate = new Map(checkins.map((row) => [row.checkin_date, row]));
  const scoresByDate = new Map<string, Partial<Record<ScoreDay["kind"], number | null>>>();
  for (const score of scores) scoresByDate.set(score.score_date, { ...(scoresByDate.get(score.score_date) ?? {}), [score.kind]: toNumber(score.score) });
  const dates = [...new Set([...healthByDate.keys(), ...scoresByDate.keys(), ...calendarByDate.keys(), ...checkinByDate.keys()])].sort();
  return dates.map((date): LabObservation => {
    const day = healthByDate.get(date);
    const calendar = calendarByDate.get(date);
    const checkin = checkinByDate.get(date);
    const dayScores = scoresByDate.get(date);
    return {
      date,
      sleepMinutes: toNumber(day?.sleep_minutes),
      sleepEfficiency: toNumber(day?.sleep_efficiency),
      sleepRegularity: toNumber(day?.sleep_regularity),
      sleepDebtMinutes: toNumber(day?.cumulative_sleep_debt_minutes),
      hrv: toNumber(day?.hrv_ms),
      restingHeartRate: toNumber(day?.resting_heart_rate),
      recoveryScore: toNumber(dayScores?.recovery),
      effortScore: toNumber(dayScores?.effort),
      steps: toNumber(day?.steps),
      zoneMinutes: toNumber(day?.zone_minutes),
      deepWorkMinutes: toNumber(checkin?.deep_work_minutes_override ?? calendar?.deep_work_minutes),
      energy: toNumber(checkin?.energy),
      focus: toNumber(checkin?.focus),
      stress: toNumber(checkin?.stress),
      mood: toNumber(checkin?.mood),
      soreness: toNumber(checkin?.soreness),
      caffeine: toNumber(checkin?.caffeine_servings),
      alcohol: toNumber(checkin?.alcohol_servings),
      lateMeal: checkin?.late_meal ?? null,
      illness: checkin?.illness ?? null,
    };
  });
}

export function buildTodayData(input: {
  timeZone: string;
  health: HealthDay[];
  scores: ScoreDay[];
  calendars: CalendarDay[];
  checkins: DailyCheckin[];
  meals?: readonly ConfirmedMealRecord[];
  targets?: NutritionTargets;
}): PersonalLabTodayData {
  const observations = joinObservations(input.health, input.scores, input.calendars, input.checkins);
  const todayDate = dateInTimezone(input.timeZone);
  const todayObservation = observations.find((day) => day.date === todayDate);
  const todayHealth = input.health.find((day) => day.metric_date === todayDate);
  const todayCalendar = input.calendars.find((day) => day.metric_date === todayDate);
  const checkin = input.checkins.find((day) => day.checkin_date === todayDate) ?? null;
  const mealDays = aggregateConfirmedMeals(input.meals ?? []);
  const mealByDate = new Map(mealDays.map((day) => [day.date, day]));
  const recentMealDays = mealDays.filter((day) => day.date >= addDays(todayDate, -29) && day.date <= todayDate);
  const baseTargets = input.targets ?? DEFAULT_NUTRITION_TARGETS;
  const targetForDate = (date: string) => nutritionTargetsForEffort(baseTargets, effortContextForDate(input.scores, date)).caloriesKcal.likely;
  const history = Array.from({ length: 7 }, (_, index): PersonalLabHistoryPoint => {
    const date = addDays(todayDate, index - 6);
    const observation = observations.find((day) => day.date === date);
    return {
      date,
      sleepMinutes: observation?.sleepMinutes ?? null,
      recoveryScore: observation?.recoveryScore ?? null,
      effortScore: observation?.effortScore ?? null,
      caloriesKcal: mealByDate.get(date)?.caloriesKcal ?? null,
      calorieTarget: targetForDate(date),
    };
  });
  const todayEffort = effortContextForDate(input.scores, todayDate);
  return {
    sleepMinutes: todayObservation?.sleepMinutes ?? null,
    sleepRegularity: todayObservation?.sleepRegularity ?? null,
    recoveryScore: todayObservation?.recoveryScore ?? null,
    effortScore: todayEffort.effortScore,
    effortCoverage: todayEffort.effortCoverage,
    caloriesKcal: mealByDate.get(todayDate)?.caloriesKcal ?? null,
    ...recentAverages(observations, todayDate),
    averageEffortScore: todayEffort.averageEffortScore,
    calorieTarget: targetForDate(todayDate),
    averageCaloriesKcal: average(recentMealDays.map((day) => day.caloriesKcal)),
    history,
    deepWorkMinutes: todayObservation?.deepWorkMinutes ?? null,
    calendarDeepWorkMinutes: todayCalendar?.deep_work_minutes ?? null,
    deepWorkSource: checkin?.deep_work_minutes_override !== null && checkin?.deep_work_minutes_override !== undefined ? "corrected" as const : todayCalendar ? "calendar" as const : "missing" as const,
    focus: todayObservation?.focus ?? null,
    energy: todayObservation?.energy ?? null,
    activity: arrivalActivityFor({
      runningDistanceKm: todayHealth?.running_distance_km,
      runningDurationMinutes: todayHealth?.running_duration_minutes,
      runningPaceSecondsPerKm: todayHealth?.running_pace_seconds_per_km,
      vigorousZoneMinutes: todayHealth?.vigorous_zone_minutes,
      peakZoneMinutes: todayHealth?.peak_zone_minutes,
      dataQuality: todayHealth?.data_quality,
    }),
  };
}

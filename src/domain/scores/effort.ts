import { refreshActiveHoursSummary, type ActiveHoursSummary } from "@/domain/health/active-hours";
import { clampScore, scoreStatus } from "./baseline";

/** Daily activity goals shared by the score and its explanations. */
export const EFFORT_ZONE_MINUTES_TARGET = 75;
export const EFFORT_EXERCISE_MINUTES_TARGET = 60;
export const EFFORT_STEPS_TARGET = 10_000;

/**
 * Fallback for users without a configured active-energy target. This keeps
 * historical score calculations deterministic until the app supplies its
 * explicit target.
 */
export const DEFAULT_EFFORT_ACTIVE_ENERGY_KCAL_TARGET = 700;

export type EffortScoreOptions = Readonly<{
  /** User-configured active-energy target; invalid values use the fallback. */
  activeEnergyKcalTarget?: number | null;
}>;

export type EffortScoreMeasurements = Readonly<{
  zoneMinutes: number;
  activeEnergyKcal: number;
  exerciseMinutes: number;
  steps: number;
}>;

export type EffortScoreTargets = Readonly<{
  zoneMinutes: number;
  activeEnergyKcal: number;
  exerciseMinutes: number;
  steps: number;
}>;

export function resolveActiveEnergyKcalTarget(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_EFFORT_ACTIVE_ENERGY_KCAL_TARGET;
}

export function effortScoreTargets(options: EffortScoreOptions = {}): EffortScoreTargets {
  return {
    zoneMinutes: EFFORT_ZONE_MINUTES_TARGET,
    activeEnergyKcal: resolveActiveEnergyKcalTarget(options.activeEnergyKcalTarget),
    exerciseMinutes: EFFORT_EXERCISE_MINUTES_TARGET,
    steps: EFFORT_STEPS_TARGET,
  };
}

/** Each goal is capped independently, so excess cannot offset another goal. */
export function activityGoalProgress(value: number, target: number) {
  return Math.min(1, Math.max(0, value / target));
}

function goalScore(progress: readonly { value: number; weight: number }[]) {
  const allGoalsReached = progress.every((component) => component.value >= 1);
  const rounded = clampScore(progress.reduce((sum, component) => sum + component.value * component.weight, 0));
  // Rounding must never award 100 while even one goal remains unfinished.
  return allGoalsReached ? 100 : Math.min(99, rounded);
}

export function calculateEffortScore(input: EffortScoreMeasurements, options: EffortScoreOptions = {}) {
  const targets = effortScoreTargets(options);
  const score = goalScore([
    { value: activityGoalProgress(input.zoneMinutes, targets.zoneMinutes), weight: 50 },
    { value: activityGoalProgress(input.exerciseMinutes, targets.exerciseMinutes), weight: 25 },
    { value: activityGoalProgress(input.activeEnergyKcal, targets.activeEnergyKcal), weight: 15 },
    { value: activityGoalProgress(input.steps, targets.steps), weight: 10 },
  ]);
  return { score, status: scoreStatus(score), algorithmVersion: "effort-v4" } as const;
}

export function calculateEffortScoreFromAvailable(input: {
  zoneMinutes: number | null;
  activeEnergyKcal: number | null;
  exerciseMinutes: number | null;
  steps: number | null;
}, options: EffortScoreOptions = {}) {
  const targets = effortScoreTargets(options);
  const components = [
    { value: input.zoneMinutes, target: targets.zoneMinutes, weight: 50 },
    { value: input.exerciseMinutes, target: targets.exerciseMinutes, weight: 25 },
    { value: input.activeEnergyKcal, target: targets.activeEnergyKcal, weight: 15 },
    { value: input.steps, target: targets.steps, weight: 10 },
  ];
  const available = components.filter((component): component is typeof component & { value: number } => component.value !== null && Number.isFinite(component.value));
  const coverage = available.length / components.length;
  // Preserve the v3 load scale for weekly load and nutrition adjustments.
  // Goal completion saturates; actual load must still reflect extra activity.
  const availableWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const loadScore = available.length < 2 ? null : clampScore(available.reduce((sum, component) => sum + (1 - 2 ** (-Math.max(0, component.value) / component.target)) * component.weight, 0) / availableWeight * 100);
  // An achievement score needs every goal to be observed. Missing is not zero.
  if (available.length !== components.length) return { score: null, status: "limited" as const, coverage, loadScore, algorithmVersion: "effort-v4" as const };
  const score = goalScore(available.map((component) => ({ value: activityGoalProgress(component.value, component.target), weight: component.weight })));
  return { score, status: scoreStatus(score), coverage, loadScore, algorithmVersion: "effort-v4" as const };
}

/** Old rows store v3 load in score; v4 rows keep it separately in drivers. */
export function activityLoadFromScoreRow(row: { score?: unknown; drivers?: unknown } | undefined) {
  const drivers = row?.drivers;
  const value = drivers && typeof drivers === "object" && "activityLoadScore" in drivers
    ? drivers.activityLoadScore
    : row?.score;
  if (value === null || value === undefined) return null;
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}


/** Daily goals agreed for Strain; load calculations above retain their historic scale. */
export const DAILY_STRAIN_TARGETS = { steps: 10_000, zoneMinutes: 45, strengthMinutes: 10, activeHoursProgress: 1 } as const;
export const DAILY_STRAIN_VERSION = "effort-v5";
export type DailyStrainMeasurements = { steps: number | null; zoneMinutes: number | null; strengthMinutes: number | null; activeHoursProgress: number | null };

export function calculateDailyStrain(input: DailyStrainMeasurements) {
  const components: { value: number | null; target: number }[] = Object.entries(DAILY_STRAIN_TARGETS).map(([key, target]) => ({ value: input[key as keyof DailyStrainMeasurements], target }));
  const available = components.filter((item): item is { value: number; target: number } => item.value !== null && Number.isFinite(item.value));
  const coverage = available.length / components.length;
  if (coverage < 1) return { score: null, status: "limited" as const, coverage, algorithmVersion: DAILY_STRAIN_VERSION };
  const score = goalScore(available.map((item) => ({ value: activityGoalProgress(item.value, item.target), weight: 25 })));
  return { score, status: scoreStatus(score), coverage, algorithmVersion: DAILY_STRAIN_VERSION };
}

/** Refresh the clock without inventing observations between imports. */
export function activeHoursFromScoreRow(row: { drivers?: unknown } | undefined, now: Date = new Date()): ActiveHoursSummary | null {
  const drivers = row?.drivers;
  if (!drivers || typeof drivers !== "object" || !("activeHours" in drivers)) return null;
  const summary = drivers.activeHours as ActiveHoursSummary | null;
  if (!summary || !Array.isArray(summary.hourStates) || typeof summary.timeZone !== "string" || !summary.source) return null;
  try { return refreshActiveHoursSummary(summary, now); } catch { return null; }
}

/** Never present scores from earlier goals as the current Strain indicator. */
export function dailyStrainScoreFromRow(row: { score?: unknown; algorithm_version?: unknown; drivers?: unknown } | undefined, now: Date = new Date()) {
  const drivers = row?.drivers;
  const version = row?.algorithm_version ?? (drivers && typeof drivers === "object" && "strainVersion" in drivers ? drivers.strainVersion : null);
  if (version !== DAILY_STRAIN_VERSION) return null;
  if (drivers && typeof drivers === "object" && "strainMeasurements" in drivers && drivers.strainMeasurements) {
    const measurements = drivers.strainMeasurements as DailyStrainMeasurements;
    const hours = activeHoursFromScoreRow(row, now);
    return calculateDailyStrain({ ...measurements, activeHoursProgress: hours?.progress ?? null }).score;
  }
  if (row?.score === null || row?.score === undefined) return null;
  const score = Number(row.score);
  return Number.isFinite(score) ? score : null;
}

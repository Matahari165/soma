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

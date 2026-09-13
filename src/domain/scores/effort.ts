import { clampScore, scoreStatus } from "./baseline";

const LOAD_REFERENCE_FRACTION = Math.log(2);

/** The fixed Effort references shared by the score and its explanations. */
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

/**
 * A reference amount contributes 50% of its component, twice the reference
 * contributes 75%, and further activity keeps adding load without a hard
 * input ceiling. The stored score remains a readable 0–100 asymptote.
 */
export function diminishingLoad(value: number, reference: number) {
  return 1 - Math.exp(-LOAD_REFERENCE_FRACTION * Math.max(value, 0) / reference);
}

export function calculateEffortScore(input: EffortScoreMeasurements, options: EffortScoreOptions = {}) {
  const targets = effortScoreTargets(options);
  const zoneLoad = diminishingLoad(input.zoneMinutes, targets.zoneMinutes) * 50;
  const exerciseLoad = diminishingLoad(input.exerciseMinutes, targets.exerciseMinutes) * 25;
  const energyLoad = diminishingLoad(input.activeEnergyKcal, targets.activeEnergyKcal) * 15;
  const movementLoad = diminishingLoad(input.steps, targets.steps) * 10;
  const score = clampScore(zoneLoad + exerciseLoad + energyLoad + movementLoad);
  return { score, status: scoreStatus(score), algorithmVersion: "effort-v3" } as const;
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
  const available = components.filter((component): component is typeof component & { value: number } => component.value !== null);
  const coverage = available.length / components.length;
  if (available.length < 2) return { score: null, status: "limited" as const, coverage, algorithmVersion: "effort-v3" as const };
  const availableWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const observedLoad = available.reduce((sum, component) => sum + diminishingLoad(component.value, component.target) * component.weight, 0);
  const score = clampScore((observedLoad / availableWeight) * 100);
  return { score, status: scoreStatus(score), coverage, algorithmVersion: "effort-v3" as const };
}

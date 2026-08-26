import { clampScore, scoreStatus } from "./baseline";

const LOAD_REFERENCE_FRACTION = Math.log(2);

/**
 * A reference amount contributes 50% of its component, twice the reference
 * contributes 75%, and further activity keeps adding load without a hard
 * input ceiling. The stored score remains a readable 0–100 asymptote.
 */
export function diminishingLoad(value: number, reference: number) {
  return 1 - Math.exp(-LOAD_REFERENCE_FRACTION * Math.max(value, 0) / reference);
}

export function calculateEffortScore(input: {
  zoneMinutes: number;
  activeEnergyKcal: number;
  exerciseMinutes: number;
  steps: number;
}) {
  const zoneLoad = diminishingLoad(input.zoneMinutes, 75) * 50;
  const exerciseLoad = diminishingLoad(input.exerciseMinutes, 60) * 25;
  const energyLoad = diminishingLoad(input.activeEnergyKcal, 700) * 15;
  const movementLoad = diminishingLoad(input.steps, 12_000) * 10;
  const score = clampScore(zoneLoad + exerciseLoad + energyLoad + movementLoad);
  return { score, status: scoreStatus(score), algorithmVersion: "effort-v3" } as const;
}

export function calculateEffortScoreFromAvailable(input: {
  zoneMinutes: number | null;
  activeEnergyKcal: number | null;
  exerciseMinutes: number | null;
  steps: number | null;
}) {
  const components = [
    { value: input.zoneMinutes, target: 75, weight: 50 },
    { value: input.exerciseMinutes, target: 60, weight: 25 },
    { value: input.activeEnergyKcal, target: 700, weight: 15 },
    { value: input.steps, target: 12_000, weight: 10 },
  ];
  const available = components.filter((component): component is typeof component & { value: number } => component.value !== null);
  const coverage = available.length / components.length;
  if (available.length < 2) return { score: null, status: "limited" as const, coverage, algorithmVersion: "effort-v3" as const };
  const availableWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const observedLoad = available.reduce((sum, component) => sum + diminishingLoad(component.value, component.target) * component.weight, 0);
  const score = clampScore((observedLoad / availableWeight) * 100);
  return { score, status: scoreStatus(score), coverage, algorithmVersion: "effort-v3" as const };
}

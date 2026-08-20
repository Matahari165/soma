import { clampScore, scoreStatus } from "./baseline";

export type FitnessGoal = "build_muscle" | "improve_endurance" | "improve_cardio" | "general_fitness" | "maintain_health" | "other";

export function calculateEffortScore(input: {
  zoneMinutes: number;
  activeEnergyKcal: number;
  exerciseMinutes: number;
  steps: number;
}) {
  const zoneLoad = Math.min(input.zoneMinutes / 75, 1) * 50;
  const exerciseLoad = Math.min(input.exerciseMinutes / 60, 1) * 25;
  const energyLoad = Math.min(input.activeEnergyKcal / 700, 1) * 15;
  const movementLoad = Math.min(input.steps / 12000, 1) * 10;
  const score = clampScore(zoneLoad + exerciseLoad + energyLoad + movementLoad);
  return { score, status: scoreStatus(score), algorithmVersion: "effort-v1" } as const;
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
  if (available.length < 2) return { score: null, status: "limited" as const, coverage, algorithmVersion: "effort-v2" as const };
  const availableWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const observedLoad = available.reduce((sum, component) => sum + Math.min(Math.max(component.value, 0) / component.target, 1) * component.weight, 0);
  const score = clampScore((observedLoad / availableWeight) * 100);
  return { score, status: scoreStatus(score), coverage, algorithmVersion: "effort-v2" as const };
}

const goalTargets: Record<FitnessGoal, [number, number]> = {
  build_muscle: [58, 74],
  improve_endurance: [65, 82],
  improve_cardio: [64, 84],
  general_fitness: [55, 75],
  maintain_health: [45, 68],
  other: [50, 72],
};

export function calculateEffortTarget(input: {
  goal: FitnessGoal;
  recoveryScore: number | null;
  weeklyEffortSoFar: number;
  daysRemainingIncludingToday: number;
}) {
  const [baseMin, baseMax] = goalTargets[input.goal];
  const recoveryAdjustment = input.recoveryScore === null ? 0 : Math.round((input.recoveryScore - 65) * 0.22);
  const weeklyMinimum = baseMin * 6;
  const remainingMinimum = Math.max(weeklyMinimum - input.weeklyEffortSoFar, 0);
  const paceFloor = Math.min(Math.round(remainingMinimum / Math.max(input.daysRemainingIncludingToday, 1)), 85);
  const minimum = Math.min(Math.max(baseMin + recoveryAdjustment, paceFloor, 25), 90);
  const maximum = Math.min(Math.max(baseMax + recoveryAdjustment, minimum + 8), 100);
  return {
    minimum,
    maximum,
    weeklyMinimum,
    weeklyMaximum: baseMax * 6,
    algorithmVersion: "effort-target-v1",
  } as const;
}

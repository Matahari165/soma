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

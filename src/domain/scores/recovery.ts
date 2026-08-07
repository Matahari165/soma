import { clampScore, scoreStatus, zScore } from "./baseline";

export type RecoveryInput = {
  currentHrv: number | null;
  hrvBaseline: number[];
  currentRestingHeartRate: number | null;
  restingHeartRateBaseline: number[];
  sleepScore: number | null;
};

export function calculateRecoveryScore(input: RecoveryInput) {
  const enoughHrv = input.currentHrv !== null && input.hrvBaseline.length >= 7;
  const enoughRhr = input.currentRestingHeartRate !== null && input.restingHeartRateBaseline.length >= 7;
  if (!enoughHrv || !enoughRhr || input.sleepScore === null) {
    return {
      score: null,
      status: "limited" as const,
      drivers: { hrv: null, restingHeartRate: null, sleep: input.sleepScore },
      algorithmVersion: "recovery-v1",
    };
  }

  const hrvComponent = clampScore(50 + zScore(input.currentHrv as number, input.hrvBaseline) * 15);
  const restingHeartRateComponent = clampScore(50 - zScore(input.currentRestingHeartRate as number, input.restingHeartRateBaseline) * 15);
  const score = clampScore(hrvComponent * 0.4 + restingHeartRateComponent * 0.3 + input.sleepScore * 0.3);

  return {
    score,
    status: scoreStatus(score),
    drivers: { hrv: hrvComponent, restingHeartRate: restingHeartRateComponent, sleep: input.sleepScore },
    algorithmVersion: "recovery-v1",
  };
}

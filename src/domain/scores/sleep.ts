export type SleepScoreInput = {
  actualSleepMinutes: number;
  estimatedNeedMinutes: number;
  efficiencyPercent: number;
  regularityPercent: number;
};

export type SleepScoreResult = {
  score: number;
  durationComponent: number;
  efficiencyComponent: number;
  regularityComponent: number;
  algorithmVersion: "sleep-v0.1";
};

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export function calculateSleepScore(input: SleepScoreInput): SleepScoreResult {
  if (input.estimatedNeedMinutes <= 0) {
    throw new Error("Estimated sleep need must be greater than zero.");
  }

  const durationComponent = clamp01(
    input.actualSleepMinutes / input.estimatedNeedMinutes,
  );
  const efficiencyComponent = clamp01(input.efficiencyPercent / 100);
  const regularityComponent = clamp01(input.regularityPercent / 100);

  const score = Math.round(
    100 *
      (0.7 * durationComponent +
        0.15 * efficiencyComponent +
        0.15 * regularityComponent),
  );

  return {
    score,
    durationComponent,
    efficiencyComponent,
    regularityComponent,
    algorithmVersion: "sleep-v0.1",
  };
}

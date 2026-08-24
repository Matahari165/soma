export type SleepNeedInput = {
  baseTargetMinutes: number;
  recentSleepMinutes: number[];
  priorDayEffort: number | null;
};

export function estimateSleepNeed(input: SleepNeedInput) {
  return {
    estimatedNeedMinutes: input.baseTargetMinutes,
    sleepDebtAdjustment: 0,
    effortAdjustment: 0,
    algorithmVersion: "sleep-target-v2",
  } as const;
}

export function recommendBedtime(input: {
  wakeTime: string;
  sleepNeedMinutes: number;
  recentEfficiencyPercent: number;
  regularBedtimeMinutes: number;
  windDownMinutes: number;
}) {
  const [hours, minutes] = input.wakeTime.split(":").map(Number);
  const wakeMinutes = hours * 60 + minutes;
  const efficiency = Math.min(Math.max(input.recentEfficiencyPercent / 100, 0.7), 1);
  const timeInBedMinutes = Math.round(input.sleepNeedMinutes / efficiency);
  let calculated = (wakeMinutes - timeInBedMinutes - input.windDownMinutes + 1440) % 1440;

  const circularDifference = ((calculated - input.regularBedtimeMinutes + 720) % 1440) - 720;
  if (Math.abs(circularDifference) > 45) {
    calculated = (input.regularBedtimeMinutes + Math.sign(circularDifference) * 45 + 1440) % 1440;
  }

  return {
    bedtimeMinutes: calculated,
    timeInBedMinutes,
    algorithmVersion: "bedtime-v1",
  } as const;
}

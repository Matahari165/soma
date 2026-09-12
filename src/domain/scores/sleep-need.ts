export type SleepNeedInput = {
  baseTargetMinutes: number;
  recentSleepMinutes: number[];
  priorDayEffort: number | null;
};

export type BedtimeRecommendation = {
  bedtimeMinutes: number;
  timeInBedMinutes: number;
  sleepNeedMinutes: number;
  wakeTimeMinutes: number;
  windDownMinutes: number;
  recentEfficiencyPercent: number;
  algorithmVersion: string;
};

type RecentSleepTiming = {
  bedtimeMinutes: number | null;
  efficiencyPercent: number | null;
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
  // `bedtime` is the time to get into bed. Wind-down is a separate routine
  // before bed and must not reduce the time reserved for sleep.
  void input.windDownMinutes;
  const calculated = (wakeMinutes - timeInBedMinutes + 1440) % 1440;

  const circularDifference = ((calculated - input.regularBedtimeMinutes + 720) % 1440) - 720;
  let bedtimeMinutes = calculated;
  if (circularDifference > 45) {
    const regularityCandidate = (input.regularBedtimeMinutes + 45) % 1440;
    const candidateTimeInBed = (wakeMinutes - regularityCandidate + 1440) % 1440;
    // Regularity is a preference, never a reason to miss the sleep target.
    if (candidateTimeInBed >= timeInBedMinutes) bedtimeMinutes = regularityCandidate;
  }

  return {
    bedtimeMinutes,
    timeInBedMinutes,
    sleepNeedMinutes: input.sleepNeedMinutes,
    wakeTimeMinutes: wakeMinutes,
    windDownMinutes: input.windDownMinutes,
    recentEfficiencyPercent: input.recentEfficiencyPercent,
    algorithmVersion: "bedtime-v2",
  } as const;
}

export function recommendBedtimeFromHistory(input: {
  wakeTime: string;
  sleepNeedMinutes: number;
  recentNights: RecentSleepTiming[];
  windDownMinutes: number;
}) {
  const recentNights = input.recentNights.slice(-30);
  const efficiencies = recentNights
    .map((night) => night.efficiencyPercent)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const recentEfficiencyPercent = efficiencies.length
    ? efficiencies.reduce((sum, value) => sum + value, 0) / efficiencies.length
    : 85;
  const regularBedtimes = recentNights.slice(-14)
    .map((night) => night.bedtimeMinutes)
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .map((value) => {
      const normalized = ((value % 1440) + 1440) % 1440;
      return normalized < 12 * 60 ? normalized + 1440 : normalized;
    });
  const regularBedtimeMinutes = regularBedtimes.length
    ? Math.round(regularBedtimes.reduce((sum, value) => sum + value, 0) / regularBedtimes.length)
    : 23 * 60;

  return recommendBedtime({
    wakeTime: input.wakeTime,
    sleepNeedMinutes: input.sleepNeedMinutes,
    recentEfficiencyPercent,
    regularBedtimeMinutes,
    windDownMinutes: input.windDownMinutes,
  });
}

/**
 * Returns the time to get into bed when wake time, sleep target and average
 * awake time are the declared inputs. Awake time is added to the target so
 * the recommendation reserves the same amount of in-bed time as the brief's
 * simple rule, without applying an efficiency or regularity adjustment.
 */
export function recommendBedtimeFromAwake(input: {
  wakeTime: string;
  sleepNeedMinutes: number;
  averageAwakeMinutes: number;
}) {
  const [hours, minutes] = input.wakeTime.split(":").map(Number);
  const wakeTimeMinutes = hours * 60 + minutes;
  const awake = Math.max(0, Math.round(input.averageAwakeMinutes));
  const sleepNeed = Math.max(0, Math.round(input.sleepNeedMinutes));
  const timeInBedMinutes = sleepNeed + awake;
  return {
    bedtimeMinutes: ((wakeTimeMinutes - timeInBedMinutes) % 1440 + 1440) % 1440,
    timeInBedMinutes,
    sleepNeedMinutes: sleepNeed,
    wakeTimeMinutes,
    averageAwakeMinutes: awake,
    algorithmVersion: "bedtime-awake-v1",
  } as const;
}

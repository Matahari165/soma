export type SleepDebtDay = {
  date: string;
  targetMinutes: number;
  actualMinutes: number | null;
  dailyDebtMinutes: number | null;
  cumulativeDebtMinutes: number | null;
};

export function calculateSleepDebt(days: Array<{ date: string; targetMinutes: number; actualMinutes: number | null }>) {
  return days.map((day, index): SleepDebtDay => {
    const window = days.slice(Math.max(0, index - 13), index + 1);
    const measuredNights = window.filter((item): item is typeof item & { actualMinutes: number } => item.actualMinutes !== null);
    const cumulativeDebtMinutes = measuredNights.length
      ? Math.max(0, Math.round(measuredNights.reduce((sum, item) => sum + item.targetMinutes - item.actualMinutes, 0)))
      : null;
    return {
      ...day,
      dailyDebtMinutes: day.actualMinutes === null ? null : Math.round(day.targetMinutes - day.actualMinutes),
      cumulativeDebtMinutes,
    };
  });
}

export function isActiveDay(input: { steps: number | null; activeZoneMinutes: number | null; activeMinutes: number | null }): boolean | null {
  const hasActivityMeasurement = input.steps !== null || input.activeZoneMinutes !== null || input.activeMinutes !== null;
  if (!hasActivityMeasurement) return null;
  return (input.steps ?? 0) >= 7_500 || (input.activeZoneMinutes ?? 0) >= 20 || (input.activeMinutes ?? 0) >= 30;
}

export function activityRegularity(days: Array<{ steps: number | null; activeZoneMinutes: number | null; activeMinutes: number | null; effortScore: number | null }>) {
  const observed = days.filter((day) => day.steps !== null || day.activeZoneMinutes !== null || day.activeMinutes !== null);
  const activeDays = observed.filter((day) => isActiveDay(day) === true).length;
  const efforts = observed.map((day) => day.effortScore).filter((value): value is number => value !== null);
  const average = efforts.length ? efforts.reduce((sum, value) => sum + value, 0) / efforts.length : null;
  const deviation = average !== null && efforts.length > 1
    ? Math.sqrt(efforts.reduce((sum, value) => sum + (value - average) ** 2, 0) / efforts.length)
    : null;
  const consistencyScore = average !== null && average > 0 && deviation !== null ? Math.round(Math.max(0, 100 - (deviation / average) * 100)) : null;
  return {
    observedDays: observed.length,
    activeDays,
    inactiveDays: observed.length - activeDays,
    activeDayRate: observed.length ? Math.round((activeDays / observed.length) * 100) : null,
    consistencyScore,
  };
}

export function acuteChronicLoadRatio(effortScores: Array<number | null>) {
  const available = effortScores.filter((value): value is number => value !== null);
  if (available.length < 21) return null;
  const recentLoad = available.slice(-7).reduce((sum, value) => sum + value, 0);
  const habitualWindow = available.slice(-28);
  const habitualWeeklyLoad = habitualWindow.reduce((sum, value) => sum + value, 0) / (habitualWindow.length / 7);
  return habitualWeeklyLoad > 0 ? Math.round((recentLoad / habitualWeeklyLoad) * 100) / 100 : null;
}

export function completedActivityDays<T extends {
  metric_date: string;
  steps: number | null;
  zone_minutes: number | null;
  active_minutes: number | null;
  active_energy_kcal: number | null;
  exercise_minutes: number | null;
}>(days: T[], currentDate: string) {
  return days.filter((day) => day.metric_date < currentDate
    && [day.steps, day.zone_minutes, day.active_minutes, day.active_energy_kcal, day.exercise_minutes].some((value) => value !== null));
}

import { journalAutomaticSource, journalValueMeetsGoal, type JournalDay, type JournalEntry, type JournalTrackingCadence, type JournalVariable } from "@/domain/lab/journal";

export const JOURNAL_ACHIEVEMENT_WINDOW_DAYS = 28;

export type JournalAchievement = {
  variableId: string;
  percentage: number | null;
  successPeriods: number;
  observedPeriods: number;
  cadence: JournalTrackingCadence;
  windowStart: string;
  windowEnd: string;
};

type AchievementInput = {
  variables: readonly JournalVariable[];
  entries: readonly JournalEntry[];
  days: readonly JournalDay[];
  todayDate: string;
  windowDays?: number;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function mondayFor(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1));
  return value.toISOString().slice(0, 10);
}

function periodEnd(periodStart: string) {
  return addDays(periodStart, 6);
}

function effectiveCadence(variable: JournalVariable): JournalTrackingCadence {
  if (variable.trackingCadence) return variable.trackingCadence;
  return journalAutomaticSource(variable.automaticMetricId)?.defaultTrackingCadence ?? "daily";
}

function inWindow(date: string, windowStart: string, windowEnd: string) {
  return date >= windowStart && date <= windowEnd;
}

function achievementForVariable(variable: JournalVariable, input: AchievementInput, windowStart: string, windowEnd: string): JournalAchievement {
  const cadence = effectiveCadence(variable);
  const variableEntries = new Map(
    input.entries
      .filter((entry) => entry.variableId === variable.id && inWindow(entry.entryDate, windowStart, windowEnd))
      .map((entry) => [entry.entryDate, entry.value]),
  );
  if (cadence === "daily") {
    let successPeriods = 0;
    let observedPeriods = 0;
    for (const value of variableEntries.values()) {
      observedPeriods += 1;
      if (journalValueMeetsGoal(variable, value)) successPeriods += 1;
    }
    return {
      variableId: variable.id,
      percentage: observedPeriods > 0 ? Math.round((successPeriods / observedPeriods) * 100) : null,
      successPeriods,
      observedPeriods,
      cadence,
      windowStart,
      windowEnd,
    };
  }

  const periodStates = new Map<string, { observed: boolean; success: boolean }>();
  const ensurePeriod = (period: string) => {
    const current = periodStates.get(period) ?? { observed: false, success: false };
    periodStates.set(period, current);
    return current;
  };

  // A weekly target is evaluated once per Monday–Sunday period. The current
  // week is only counted after a value exists; an unfinished week must not
  // look like a failed week in the middle of the week.
  for (const [date, value] of variableEntries) {
    const state = ensurePeriod(mondayFor(date));
    state.observed = true;
    state.success ||= journalValueMeetsGoal(variable, value);
  }
  let successPeriods = 0;
  let observedPeriods = 0;
  for (const [period, state] of periodStates) {
    const isCurrentPeriod = inWindow(input.todayDate, period, periodEnd(period));
    if (isCurrentPeriod && !state.success) continue;
    if (!state.observed) continue;
    observedPeriods += 1;
    if (state.success) successPeriods += 1;
  }
  return {
    variableId: variable.id,
    percentage: observedPeriods > 0 ? Math.round((successPeriods / observedPeriods) * 100) : null,
    successPeriods,
    observedPeriods,
    cadence,
    windowStart,
    windowEnd,
  };
}

export function journalAchievementsFor(input: AchievementInput): JournalAchievement[] {
  const windowDays = Math.max(1, Math.floor(input.windowDays ?? JOURNAL_ACHIEVEMENT_WINDOW_DAYS));
  const windowEnd = input.todayDate;
  const windowStart = addDays(windowEnd, -(windowDays - 1));
  return input.variables.map((variable) => achievementForVariable(variable, input, windowStart, windowEnd));
}

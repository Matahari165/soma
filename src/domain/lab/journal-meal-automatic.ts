import type { ConfirmedMealRecord } from "./meals";
import type { JournalDay, JournalEntry, JournalVariable } from "./journal";

export const LIGHT_BREAKFAST_DEFAULT_THRESHOLD_KCAL = 350;
export const LIGHT_BREAKFAST_MIN_THRESHOLD_KCAL = 300;
export const LIGHT_BREAKFAST_MAX_THRESHOLD_KCAL = 450;

/**
 * A light breakfast is intentionally a product rule, not a medical standard.
 * The user's daily calorie target personalises it while keeping the range
 * bounded enough to remain recognisable as "light".
 */
export function lightBreakfastThresholdKcal(dailyTargetKcal?: number | null) {
  if (typeof dailyTargetKcal !== "number" || !Number.isFinite(dailyTargetKcal) || dailyTargetKcal <= 0) {
    return LIGHT_BREAKFAST_DEFAULT_THRESHOLD_KCAL;
  }
  return Math.min(
    LIGHT_BREAKFAST_MAX_THRESHOLD_KCAL,
    Math.max(LIGHT_BREAKFAST_MIN_THRESHOLD_KCAL, dailyTargetKcal * 0.15),
  );
}

export function mealRecordsByDate(records: readonly ConfirmedMealRecord[]) {
  const byDate = new Map<string, ConfirmedMealRecord[]>();
  for (const record of records) {
    if (record.status !== "confirmed" || record.entryState === "skipped" || !/^\d{4}-\d{2}-\d{2}$/.test(record.mealDate)) continue;
    const current = byDate.get(record.mealDate) ?? [];
    current.push(record);
    byDate.set(record.mealDate, current);
  }
  return byDate;
}

export function skippedBreakfastDates(records: readonly {
  mealDate: string;
  mealType: string;
  entryState?: string;
}[]) {
  return new Set(records
    .filter((record) => record.mealType === "breakfast" && record.entryState === "skipped" && /^\d{4}-\d{2}-\d{2}$/.test(record.mealDate))
    .map((record) => record.mealDate));
}

function normalizedName(name: string) {
  return name.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Returns dates where the separate manual Breakfast field explicitly says
 * there was no breakfast and the day was validated. An empty day remains
 * unknown, because it may simply not have been filled yet.
 */
export function explicitNoBreakfastByDate(input: {
  variables: readonly JournalVariable[];
  entries: readonly JournalEntry[];
  days: readonly JournalDay[];
}) {
  const breakfastIds = new Set(input.variables
    .filter((variable) => variable.variableType === "boolean" && normalizedName(variable.name) === "breakfast")
    .map((variable) => variable.id));
  const validatedDates = new Set(input.days.filter((day) => day.status === "validated").map((day) => day.entryDate));
  const dates = new Set<string>();
  for (const entry of input.entries) {
    if (breakfastIds.has(entry.variableId) && entry.value === false && validatedDates.has(entry.entryDate)) dates.add(entry.entryDate);
  }
  return dates;
}

function rangeTotal(records: readonly ConfirmedMealRecord[], bound: "low" | "high") {
  const values = records.map((record) => record.caloriesKcal?.[bound] ?? null);
  if (values.some((value) => value === null || typeof value !== "number" || !Number.isFinite(value))) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

/**
 * Evaluate one day's light-breakfast rule.
 *
 * `true` means no breakfast or a clearly light breakfast, `false` means a
 * clearly heavy breakfast, and `null` means the available meal data cannot
 * decide safely.
 */
export function lightBreakfastValue(input: {
  meals: readonly ConfirmedMealRecord[] | undefined;
  explicitlyNoBreakfast?: boolean;
  dailyTargetKcal?: number | null;
}) {
  if (input.explicitlyNoBreakfast) return true;
  const breakfasts = (input.meals ?? []).filter((meal) => meal.mealType === "breakfast");
  if (!breakfasts.length) return null;
  const low = rangeTotal(breakfasts, "low");
  const high = rangeTotal(breakfasts, "high");
  if (low === null || high === null) return null;
  const threshold = lightBreakfastThresholdKcal(input.dailyTargetKcal);
  if (high <= threshold) return true;
  if (low > threshold) return false;
  return null;
}

import "server-only";

import { aggregateConfirmedMeals, type ConfirmedMealRecord } from "@/domain/lab/meals";
import { automaticJournalEntriesFor, type AutomaticJournalHealthDay } from "@/domain/lab/journal-automatic";
import { ADDED_SUGAR_AUTOMATIC_METRIC_ID, defaultJournalVariables, isAddedSugarVariable, journalAutomaticDefaultMatches, journalAutomaticMetricId, journalAutomaticSource, journalCaptureMode, LIGHT_BREAKFAST_AUTOMATIC_METRIC_ID, type JournalDay, type JournalEntry, type JournalEntryValue, type JournalVariable, type JournalVariableType } from "@/domain/lab/journal";
import { explicitNoBreakfastByDate, mealRecordsByDate as mealRecordsByDateForJournal } from "@/domain/lab/journal-meal-automatic";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { loadConfirmedMealRecords } from "@/services/meals";
import { loadNutritionTargetsForUser } from "@/services/nutrition-targets";

export type JournalVariableRow = {
  id: string;
  name: string;
  variable_type: JournalVariableType;
  unit: string | null;
  options: unknown;
  position: number;
  is_active: boolean | null | undefined;
  emoji: string;
  default_value: unknown;
  day_period: JournalVariable["dayPeriod"];
  capture_mode?: unknown;
  automatic_metric_id?: unknown;
  tracking_cadence?: unknown;
};

type JournalEntryRow = { variable_id: string; entry_date: string; value: unknown };

export function variableFromRow(row: JournalVariableRow): JournalVariable {
  const variable: JournalVariable = {
    id: row.id,
    name: row.name,
    variableType: row.variable_type,
    unit: row.unit,
    options: Array.isArray(row.options) ? row.options.filter((value): value is string => typeof value === "string") : [],
    position: row.position,
    // Legacy D1 rows predate the explicit flag. Database defaults are not
    // applied to sparse JSON, so only an explicit false means archived.
    isActive: row.is_active !== false,
    emoji: row.emoji || "🧪",
    defaultValue: typeof row.default_value === "string" || typeof row.default_value === "number" || typeof row.default_value === "boolean" ? row.default_value : null,
    dayPeriod: row.day_period,
    captureMode: row.capture_mode === "automatic" ? "automatic" : "manual",
    automaticMetricId: typeof row.automatic_metric_id === "string" ? row.automatic_metric_id : null,
    trackingCadence: row.tracking_cadence === "weekly" ? "weekly" : row.tracking_cadence === "daily" ? "daily" : journalAutomaticSource(row.automatic_metric_id)?.defaultTrackingCadence ?? "daily",
  };
  // Existing installations already have this field as a manual number. Keep
  // the row and its history, but give it the new meal-derived source without a
  // destructive migration or a page-load write.
  if (!isAddedSugarVariable(variable)) return variable;
  return { ...variable, variableType: "number", unit: variable.unit ?? "g", defaultValue: null, captureMode: "automatic", automaticMetricId: ADDED_SUGAR_AUTOMATIC_METRIC_ID, trackingCadence: "daily" };
}

function entryFromRow(row: JournalEntryRow): JournalEntry | null {
  if (typeof row.value !== "string" && typeof row.value !== "number" && typeof row.value !== "boolean") return null;
  return { variableId: row.variable_id, entryDate: row.entry_date, value: row.value as JournalEntryValue, source: "manual" };
}

export async function ensureJournalVariables(userId: string) {
  const admin = createCloudflareAdminClient();
  const { data: existing, error } = await admin.from("journal_variables").select("id,name,is_active,variable_type,unit,default_value,day_period,capture_mode,automatic_metric_id,tracking_cadence").eq("user_id", userId);
  if (error) throw new Error("Your journal variables could not be loaded.");
  const existingRows = (existing ?? []) as Array<Pick<JournalVariableRow, "id" | "name" | "is_active" | "variable_type" | "unit" | "default_value" | "day_period" | "capture_mode" | "automatic_metric_id" | "tracking_cadence">>;
  const matchesDefinition = (row: typeof existingRows[number], definition: typeof defaultJournalVariables[number]) => journalAutomaticDefaultMatches(
    { name: row.name, automaticMetricId: typeof row.automatic_metric_id === "string" ? row.automatic_metric_id : null },
    { name: definition.name, automaticMetricId: definition.automaticMetricId ?? null },
  );
  const missing = defaultJournalVariables.filter((definition) => !existingRows.some((row) => (
    definition.automaticMetricId
      ? matchesDefinition(row, definition)
      : row.name.toLocaleLowerCase("en") === definition.name.toLocaleLowerCase("en")
  )));
  if (missing.length) {
    const { error: insertError } = await admin.from("journal_variables").insert(missing.map((variable) => ({
    user_id: userId,
    name: variable.name,
    variable_type: variable.variableType,
    unit: variable.unit,
    options: [...variable.options],
    position: variable.position,
    emoji: variable.emoji,
    default_value: variable.defaultValue,
    day_period: variable.dayPeriod,
    capture_mode: variable.captureMode ?? "manual",
    automatic_metric_id: variable.automaticMetricId ?? null,
    tracking_cadence: variable.trackingCadence ?? "daily",
    is_active: true,
    })));
    if (insertError && insertError.code !== "23505") throw new Error("Your starter journal could not be created.");
  }

  const automaticUpdates = existingRows.flatMap((row) => {
    const definition = defaultJournalVariables.find((candidate) => candidate.automaticMetricId && matchesDefinition(row, candidate));
    if (!definition || !definition.automaticMetricId) return [];
    const target = {
      variable_type: definition.variableType,
      unit: definition.unit,
      default_value: null,
      day_period: definition.dayPeriod,
      capture_mode: "automatic",
      automatic_metric_id: definition.automaticMetricId,
      tracking_cadence: definition.trackingCadence ?? journalAutomaticSource(definition.automaticMetricId)?.defaultTrackingCadence ?? "daily",
      is_active: true,
    } as const;
    const changed = row.variable_type !== target.variable_type
      || row.unit !== target.unit
      || row.default_value !== target.default_value
      || row.day_period !== target.day_period
      || row.capture_mode !== target.capture_mode
      || row.automatic_metric_id !== target.automatic_metric_id
      || row.tracking_cadence !== target.tracking_cadence
      || row.is_active !== target.is_active;
    return changed ? [{ id: row.id, target }] : [];
  });
  for (const update of automaticUpdates) {
    const { error: updateError } = await admin.from("journal_variables").update(update.target).eq("id", update.id).eq("user_id", userId);
    if (updateError) throw new Error("Your automatic journal variables could not be configured.");
  }
}

export async function loadJournalData(userId: string, options: { from?: string; to?: string; timeZone?: string; includeAutomaticEntries?: boolean; ensureDefaults?: boolean; mealRecords?: readonly ConfirmedMealRecord[]; dailyTargetKcal?: number | null } = {}) {
  // Loading the journal remains backwards-compatible for write boundaries, but
  // page reads opt out explicitly so they never provision or rewrite variables.
  if (options.ensureDefaults !== false) await ensureJournalVariables(userId);
  const admin = createCloudflareAdminClient();
  let entryQuery = admin.from("journal_entries").select("variable_id,entry_date,value").eq("user_id", userId).order("entry_date", { ascending: true });
  if (options.from) entryQuery = entryQuery.gte("entry_date", options.from);
  if (options.to) entryQuery = entryQuery.lte("entry_date", options.to);
  let dayQuery = admin.from("journal_days").select("entry_date,status,validated_at,omitted_variables").eq("user_id", userId).order("entry_date", { ascending: true });
  if (options.from) dayQuery = dayQuery.gte("entry_date", options.from);
  if (options.to) dayQuery = dayQuery.lte("entry_date", options.to);
  const [variableResult, entryResult, dayResult] = await Promise.all([
    admin.from("journal_variables").select("id,name,variable_type,unit,options,position,is_active,emoji,default_value,day_period,capture_mode,automatic_metric_id,tracking_cadence").eq("user_id", userId).order("position").order("created_at"),
    entryQuery,
    dayQuery,
  ]);
  if (variableResult.error || entryResult.error || dayResult.error) throw new Error("Your journal could not be loaded.");
  const variables = ((variableResult.data ?? []) as JournalVariableRow[]).map(variableFromRow);
  const entries = ((entryResult.data ?? []) as JournalEntryRow[]).flatMap((row) => {
    const entry = entryFromRow(row);
    return entry ? [entry] : [];
  });
  const days = (dayResult.data ?? []).map((row): JournalDay => ({
    entryDate: row.entry_date,
    status: row.status === "validated" ? "validated" : "draft",
    validatedAt: row.validated_at,
    omittedVariableIds: Array.isArray(row.omitted_variables) ? row.omitted_variables.filter((value: unknown): value is string => typeof value === "string") : [],
  }));
  let automaticEntries: JournalEntry[] = [];
  const automaticVariables = variables.filter((variable) => journalCaptureMode(variable) === "automatic");
  if (options.includeAutomaticEntries !== false && automaticVariables.length > 0) {
    const needsHealth = automaticVariables.some((variable) => {
      const metricId = journalAutomaticMetricId(variable);
      return metricId !== ADDED_SUGAR_AUTOMATIC_METRIC_ID && metricId !== LIGHT_BREAKFAST_AUTOMATIC_METRIC_ID;
    });
    const needsMealSugar = automaticVariables.some((variable) => journalAutomaticMetricId(variable) === ADDED_SUGAR_AUTOMATIC_METRIC_ID);
    const needsLightBreakfast = automaticVariables.some((variable) => journalAutomaticMetricId(variable) === LIGHT_BREAKFAST_AUTOMATIC_METRIC_ID);
    const needsMealData = needsMealSugar || needsLightBreakfast;
    let health: AutomaticJournalHealthDay[] = [];
    if (needsHealth) {
      let healthQuery = admin.from("daily_health_metrics").select("metric_date,bedtime,running_distance_km,running_duration_minutes,running_pace_seconds_per_km,running_average_heart_rate,data_quality").eq("user_id", userId).order("metric_date", { ascending: true });
      if (options.from) healthQuery = healthQuery.gte("metric_date", options.from);
      if (options.to) healthQuery = healthQuery.lte("metric_date", options.to);
      const healthResult = await healthQuery;
      if (!healthResult.error) health = (healthResult.data ?? []) as AutomaticJournalHealthDay[];
    }
    const mealRecords = needsMealData
      ? options.mealRecords ?? await loadConfirmedMealRecords(userId, { from: options.from, to: options.to })
      : [];
    const mealAddedSugarByDate = needsMealSugar
      ? new Map(aggregateConfirmedMeals(mealRecords).map((day) => [day.date, day.addedSugarG]))
      : undefined;
    const mealRecordsByDate = needsLightBreakfast ? mealRecordsByDateForJournal(mealRecords) : undefined;
    const explicitlyNoBreakfast = needsLightBreakfast ? explicitNoBreakfastByDate({ variables, entries, days }) : undefined;
    let dailyTargetKcal = options.dailyTargetKcal;
    if (needsLightBreakfast && dailyTargetKcal === undefined) {
      try {
        dailyTargetKcal = (await loadNutritionTargetsForUser(userId)).caloriesKcal.likely;
      } catch {
        dailyTargetKcal = null;
      }
    }
    const omittedByDate = new Map(days.map((day) => [day.entryDate, new Set(day.omittedVariableIds)]));
    automaticEntries = automaticJournalEntriesFor({
      variables,
      health,
      mealAddedSugarByDate,
      mealRecordsByDate,
      explicitlyNoBreakfastByDate: explicitlyNoBreakfast,
      dailyTargetKcal,
      existingEntries: entries,
      omittedVariableIdsByDate: omittedByDate,
      from: options.from,
      to: options.to,
      timeZone: options.timeZone,
    });
  }
  return {
    variables,
    entries: [...entries, ...automaticEntries],
    days,
  };
}

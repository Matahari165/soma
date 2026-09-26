import "server-only";

import { aggregateConfirmedMeals, type ConfirmedMealRecord } from "@/domain/lab/meals";
import { automaticJournalEntriesFor, type AutomaticJournalHealthDay } from "@/domain/lab/journal-automatic";
import { ADDED_SUGAR_AUTOMATIC_METRIC_ID, defaultJournalVariables, healthyHabitCatalog, isAddedSugarVariable, isRetiredBedtimeJournalVariable, journalAutomaticMetricId, journalAutomaticSource, journalCaptureMode, LIGHT_BREAKFAST_AUTOMATIC_METRIC_ID, normalizedJournalVariableName, type JournalDay, type JournalEntry, type JournalEntryValue, type JournalVariable, type JournalVariableType } from "@/domain/lab/journal";
import { explicitNoBreakfastByDate, mealRecordsByDate as mealRecordsByDateForJournal, skippedBreakfastDates } from "@/domain/lab/journal-meal-automatic";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { listMeals, loadConfirmedMealRecords } from "@/services/meals";
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
  return upgradeLegacyAddedSugarVariable({
    id: row.id,
    name: row.name,
    variableType: row.variable_type,
    unit: row.unit,
    options: Array.isArray(row.options) ? row.options.filter((value): value is string => typeof value === "string") : [],
    position: row.position,
    isActive: row.is_active !== false,
    emoji: row.emoji || "🧪",
    defaultValue: typeof row.default_value === "string" || typeof row.default_value === "number" || typeof row.default_value === "boolean" ? row.default_value : null,
    dayPeriod: row.day_period,
    captureMode: row.capture_mode === "automatic" ? "automatic" : "manual",
    automaticMetricId: typeof row.automatic_metric_id === "string" ? row.automatic_metric_id : null,
    trackingCadence: row.tracking_cadence === "weekly" ? "weekly" : row.tracking_cadence === "daily" ? "daily" : journalAutomaticSource(row.automatic_metric_id)?.defaultTrackingCadence ?? "daily",
  });
}

function upgradeLegacyAddedSugarVariable(variable: JournalVariable): JournalVariable {
  if (!isAddedSugarVariable(variable)) return variable;
  return { ...variable, variableType: "number", unit: variable.unit ?? "g", defaultValue: null, captureMode: "automatic", automaticMetricId: ADDED_SUGAR_AUTOMATIC_METRIC_ID, trackingCadence: "daily" };
}

function entryFromRow(row: JournalEntryRow): JournalEntry | null {
  if (typeof row.value !== "string" && typeof row.value !== "number" && typeof row.value !== "boolean") return null;
  return { variableId: row.variable_id, entryDate: row.entry_date, value: row.value as JournalEntryValue, source: "manual" };
}

export async function ensureJournalVariables(
  userId: string,
  options: {
    selectedHabitNames?: string[];
    customHabits?: Array<{ name: string; category?: string; emoji?: string }>;
  } = {},
) {
  const admin = createCloudflareAdminClient();
  const { data: existing, error } = await admin.from("journal_variables").select("id,name,is_active,variable_type,unit,default_value,day_period,capture_mode,automatic_metric_id,tracking_cadence").eq("user_id", userId);
  if (error) throw new Error("Your journal variables could not be loaded.");
  const existingRows = (existing ?? []) as Array<Pick<JournalVariableRow, "id" | "name" | "is_active" | "variable_type" | "unit" | "default_value" | "day_period" | "capture_mode" | "automatic_metric_id" | "tracking_cadence">>;

  // INVARIANT ABSOLU : Ne pas modifier les 18 variables de journal actuelles de Jérémy.
  // Pour un utilisateur existant qui a déjà des variables, ensureJournalVariables() ne doit rien écraser.
  if (existingRows.length > 0) {
    return;
  }

  const categoryPeriodMap: Record<string, JournalVariable["dayPeriod"]> = {
    sleep: "evening",
    nutrition: "morning",
    activity: "day",
    other: "day",
  };

  let baseDefinitions: readonly (typeof defaultJournalVariables)[number][];

  if (options.selectedHabitNames && options.selectedHabitNames.length > 0) {
    const selectedNormalized = new Set(options.selectedHabitNames.map((name) => normalizedJournalVariableName(name)));
    baseDefinitions = defaultJournalVariables.filter((def) => {
      // Toujours inclure les variables de contexte (Vacances, Maladie) indispensables à la baseline
      if (def.dayPeriod === "context") return true;
      // Correspondance directe de nom
      if (selectedNormalized.has(normalizedJournalVariableName(def.name))) return true;
      // Correspondance via le catalogue d'habitudes saines
      const matchingCatalogItem = healthyHabitCatalog.find((item) => item.journalVariableName === def.name);
      if (matchingCatalogItem) {
        if (selectedNormalized.has(normalizedJournalVariableName(matchingCatalogItem.name))) return true;
        if (selectedNormalized.has(normalizedJournalVariableName(matchingCatalogItem.id))) return true;
      }
      // Conserver l'heure de coucher si le coucher avant 23h est coché
      if (def.name === "Bedtime" && (
        selectedNormalized.has(normalizedJournalVariableName("Bedtime before 11 PM")) ||
        selectedNormalized.has(normalizedJournalVariableName("Coucher avant 23 h")) ||
        selectedNormalized.has("coucher_23")
      )) {
        return true;
      }
      // Conserver le petit-déjeuner léger automatique si le petit-déjeuner est coché
      if (def.name === "Light breakfast" && selectedNormalized.has(normalizedJournalVariableName("Breakfast"))) {
        return true;
      }
      return false;
    });
  } else {
    baseDefinitions = defaultJournalVariables;
  }

  const variablesToInsert = [
    ...baseDefinitions.map((variable) => ({
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
    })),
    ...(options.customHabits ?? []).map((custom, index) => ({
      user_id: userId,
      name: custom.name,
      variable_type: "boolean" as const,
      unit: null,
      options: [],
      position: 120 + index * 5,
      emoji: custom.emoji || "✨",
      default_value: false,
      day_period: categoryPeriodMap[custom.category ?? "other"] ?? "day",
      capture_mode: "manual" as const,
      automatic_metric_id: null,
      tracking_cadence: "daily" as const,
      is_active: true,
    })),
  ];

  if (variablesToInsert.length > 0) {
    const { error: insertError } = await admin.from("journal_variables").insert(variablesToInsert);
    if (insertError && insertError.code !== "23505") throw new Error("Your starter journal could not be created.");
  }
}

export async function loadJournalData(userId: string, options: {
  from?: string;
  to?: string;
  timeZone?: string;
  includeAutomaticEntries?: boolean;
  ensureDefaults?: boolean;
  mealRecords?: readonly ConfirmedMealRecord[] | Promise<readonly ConfirmedMealRecord[]>;
  automaticHealth?: readonly AutomaticJournalHealthDay[] | Promise<readonly AutomaticJournalHealthDay[]>;
  skippedBreakfastDates?: ReadonlySet<string>;
  dailyTargetKcal?: number | null | Promise<number | null>;
} = {}) {
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
  const automaticVariables = variables.filter((variable) => journalCaptureMode(variable) === "automatic" && !isRetiredBedtimeJournalVariable(variable));
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
      if (options.automaticHealth) {
        health = [...await options.automaticHealth];
      } else {
        let healthQuery = admin.from("daily_health_metrics").select("metric_date,bedtime,running_distance_km,running_duration_minutes,running_pace_seconds_per_km,running_average_heart_rate,data_quality").eq("user_id", userId).order("metric_date", { ascending: true });
        if (options.from) healthQuery = healthQuery.gte("metric_date", options.from);
        if (options.to) healthQuery = healthQuery.lte("metric_date", options.to);
        const healthResult = await healthQuery;
        if (!healthResult.error) health = (healthResult.data ?? []) as AutomaticJournalHealthDay[];
      }
    }
    const [mealRecords, skippedBreakfast] = await Promise.all([
      needsMealData
        ? options.mealRecords ? Promise.resolve(options.mealRecords) : loadConfirmedMealRecords(userId, { from: options.from, to: options.to })
        : [],
      needsLightBreakfast
        ? options.skippedBreakfastDates ?? listMeals(userId, { from: options.from, to: options.to }).then(skippedBreakfastDates)
        : new Set<string>(),
    ]);
    const mealAddedSugarByDate = needsMealSugar
      ? new Map(aggregateConfirmedMeals(mealRecords).map((day) => [day.date, day.addedSugarG]))
      : undefined;
    const mealRecordsByDate = needsLightBreakfast ? mealRecordsByDateForJournal(mealRecords) : undefined;
    const explicitlyNoBreakfast = needsLightBreakfast
      ? new Set([...explicitNoBreakfastByDate({ variables, entries, days }), ...skippedBreakfast])
      : undefined;
    let dailyTargetKcal = options.dailyTargetKcal === undefined ? undefined : await options.dailyTargetKcal;
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

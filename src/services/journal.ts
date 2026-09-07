import "server-only";

import { automaticJournalEntriesFor, type AutomaticJournalHealthDay } from "@/domain/lab/journal-automatic";
import { defaultJournalVariables, journalAutomaticSource, type JournalDay, type JournalEntry, type JournalEntryValue, type JournalVariable, type JournalVariableType } from "@/domain/lab/journal";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

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
  return {
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
}

function entryFromRow(row: JournalEntryRow): JournalEntry | null {
  if (typeof row.value !== "string" && typeof row.value !== "number" && typeof row.value !== "boolean") return null;
  return { variableId: row.variable_id, entryDate: row.entry_date, value: row.value as JournalEntryValue };
}

export async function ensureJournalVariables(userId: string) {
  const admin = createCloudflareAdminClient();
  const { data: existing, error } = await admin.from("journal_variables").select("name").eq("user_id", userId);
  if (error) throw new Error("Your journal variables could not be loaded.");
  const existingNames = new Set((existing ?? []).map((variable) => variable.name.toLocaleLowerCase("en")));
  const missing = defaultJournalVariables.filter((variable) => !existingNames.has(variable.name.toLocaleLowerCase("en")));
  if (!missing.length) return;
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
    capture_mode: "manual",
    automatic_metric_id: null,
    tracking_cadence: "daily",
    is_active: true,
  })));
  if (insertError && insertError.code !== "23505") throw new Error("Your starter journal could not be created.");
}

export async function loadJournalData(userId: string, options: { from?: string; to?: string; timeZone?: string; includeAutomaticEntries?: boolean; ensureDefaults?: boolean } = {}) {
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
  if (options.includeAutomaticEntries !== false && variables.some((variable) => variable.captureMode === "automatic")) {
    let healthQuery = admin.from("daily_health_metrics").select("metric_date,bedtime,running_distance_km,running_duration_minutes,running_pace_seconds_per_km,running_average_heart_rate,data_quality").eq("user_id", userId).order("metric_date", { ascending: true });
    if (options.from) healthQuery = healthQuery.gte("metric_date", options.from);
    if (options.to) healthQuery = healthQuery.lte("metric_date", options.to);
    const healthResult = await healthQuery;
    if (!healthResult.error) {
      const omittedByDate = new Map(days.map((day) => [day.entryDate, new Set(day.omittedVariableIds)]));
      automaticEntries = automaticJournalEntriesFor({
        variables,
        health: (healthResult.data ?? []) as AutomaticJournalHealthDay[],
        existingEntries: entries,
        omittedVariableIdsByDate: omittedByDate,
        from: options.from,
        to: options.to,
        timeZone: options.timeZone,
      });
    }
  }
  return {
    variables,
    entries: [...entries, ...automaticEntries],
    days,
  };
}

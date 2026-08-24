import "server-only";

import { defaultJournalVariables, type JournalDay, type JournalEntry, type JournalEntryValue, type JournalVariable, type JournalVariableType } from "@/domain/lab/journal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type JournalVariableRow = {
  id: string;
  name: string;
  variable_type: JournalVariableType;
  unit: string | null;
  options: unknown;
  position: number;
  is_active: boolean;
  emoji: string;
  default_value: unknown;
  day_period: JournalVariable["dayPeriod"];
};

type JournalEntryRow = { variable_id: string; entry_date: string; value: unknown };

function variableFromRow(row: JournalVariableRow): JournalVariable {
  const isAutomaticSleepMeasure = ["bedtime", "heure du coucher"].includes(row.name.toLocaleLowerCase("en"));
  return {
    id: row.id,
    name: row.name,
    variableType: row.variable_type,
    unit: row.unit,
    options: Array.isArray(row.options) ? row.options.filter((value): value is string => typeof value === "string") : [],
    position: row.position,
    isActive: row.is_active && !isAutomaticSleepMeasure,
    emoji: row.emoji || "🧪",
    defaultValue: typeof row.default_value === "string" || typeof row.default_value === "number" || typeof row.default_value === "boolean" ? row.default_value : null,
    dayPeriod: row.day_period,
  };
}

function entryFromRow(row: JournalEntryRow): JournalEntry | null {
  if (typeof row.value !== "string" && typeof row.value !== "number" && typeof row.value !== "boolean") return null;
  return { variableId: row.variable_id, entryDate: row.entry_date, value: row.value as JournalEntryValue };
}

export async function ensureJournalVariables(userId: string) {
  const admin = createSupabaseAdminClient();
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
  })));
  if (insertError && insertError.code !== "23505") throw new Error("Your starter journal could not be created.");
}

export async function loadJournalData(userId: string, options: { from?: string; to?: string } = {}) {
  await ensureJournalVariables(userId);
  const admin = createSupabaseAdminClient();
  let entryQuery = admin.from("journal_entries").select("variable_id,entry_date,value").eq("user_id", userId).order("entry_date", { ascending: true });
  if (options.from) entryQuery = entryQuery.gte("entry_date", options.from);
  if (options.to) entryQuery = entryQuery.lte("entry_date", options.to);
  let dayQuery = admin.from("journal_days").select("entry_date,status,validated_at,omitted_variables").eq("user_id", userId).order("entry_date", { ascending: true });
  if (options.from) dayQuery = dayQuery.gte("entry_date", options.from);
  if (options.to) dayQuery = dayQuery.lte("entry_date", options.to);
  const [variableResult, entryResult, dayResult] = await Promise.all([
    admin.from("journal_variables").select("id,name,variable_type,unit,options,position,is_active,emoji,default_value,day_period").eq("user_id", userId).order("position").order("created_at"),
    entryQuery,
    dayQuery,
  ]);
  if (variableResult.error || entryResult.error || dayResult.error) throw new Error("Your journal could not be loaded.");
  return {
    variables: ((variableResult.data ?? []) as JournalVariableRow[]).map(variableFromRow),
    entries: ((entryResult.data ?? []) as JournalEntryRow[]).flatMap((row) => {
      const entry = entryFromRow(row);
      return entry ? [entry] : [];
    }),
    days: (dayResult.data ?? []).map((row): JournalDay => ({
      entryDate: row.entry_date,
      status: row.status === "validated" ? "validated" : "draft",
      validatedAt: row.validated_at,
      omittedVariableIds: Array.isArray(row.omitted_variables) ? row.omitted_variables.filter((value): value is string => typeof value === "string") : [],
    })),
  };
}

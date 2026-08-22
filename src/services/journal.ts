import "server-only";

import { defaultJournalVariables, type JournalEntry, type JournalEntryValue, type JournalVariable, type JournalVariableType } from "@/domain/lab/journal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type JournalVariableRow = {
  id: string;
  name: string;
  variable_type: JournalVariableType;
  unit: string | null;
  options: unknown;
  position: number;
  is_active: boolean;
};

type JournalEntryRow = { variable_id: string; entry_date: string; value: unknown };

function variableFromRow(row: JournalVariableRow): JournalVariable {
  return {
    id: row.id,
    name: row.name,
    variableType: row.variable_type,
    unit: row.unit,
    options: Array.isArray(row.options) ? row.options.filter((value): value is string => typeof value === "string") : [],
    position: row.position,
    isActive: row.is_active,
  };
}

function entryFromRow(row: JournalEntryRow): JournalEntry | null {
  if (typeof row.value !== "string" && typeof row.value !== "number" && typeof row.value !== "boolean") return null;
  return { variableId: row.variable_id, entryDate: row.entry_date, value: row.value as JournalEntryValue };
}

export async function ensureJournalVariables(userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: existing, error } = await admin.from("journal_variables").select("id").eq("user_id", userId).limit(1);
  if (error) throw new Error("Your journal variables could not be loaded.");
  if (existing?.length) return;
  const { error: insertError } = await admin.from("journal_variables").insert(defaultJournalVariables.map((variable, position) => ({
    user_id: userId,
    name: variable.name,
    variable_type: variable.variableType,
    unit: variable.unit,
    options: [...variable.options],
    position,
  })));
  if (insertError && insertError.code !== "23505") throw new Error("Your starter journal could not be created.");
}

export async function loadJournalData(userId: string, options: { from?: string; to?: string } = {}) {
  await ensureJournalVariables(userId);
  const admin = createSupabaseAdminClient();
  let entryQuery = admin.from("journal_entries").select("variable_id,entry_date,value").eq("user_id", userId).order("entry_date", { ascending: true });
  if (options.from) entryQuery = entryQuery.gte("entry_date", options.from);
  if (options.to) entryQuery = entryQuery.lte("entry_date", options.to);
  const [variableResult, entryResult] = await Promise.all([
    admin.from("journal_variables").select("id,name,variable_type,unit,options,position,is_active").eq("user_id", userId).order("position").order("created_at"),
    entryQuery,
  ]);
  if (variableResult.error || entryResult.error) throw new Error("Your journal could not be loaded.");
  return {
    variables: ((variableResult.data ?? []) as JournalVariableRow[]).map(variableFromRow),
    entries: ((entryResult.data ?? []) as JournalEntryRow[]).flatMap((row) => {
      const entry = entryFromRow(row);
      return entry ? [entry] : [];
    }),
  };
}

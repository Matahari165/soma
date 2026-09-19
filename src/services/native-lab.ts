import "server-only";

import { normalizeJournalValue, saveJournalEntriesSchema, type JournalDay, type JournalEntry, type JournalVariable } from "@/domain/lab/journal";
import type { Meal, MealType } from "@/domain/meals";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { loadJournalData } from "@/services/journal";
import { mealToApi } from "@/services/meal-api";
import { listMeals } from "@/services/meals";
import { z } from "zod";

const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const satisfies readonly MealType[];
const DEFAULT_TIME_ZONE = "Europe/Paris";

export type NativeLabDay = {
  date: string;
  timezone: string;
  journal: {
    variables: JournalVariable[];
    entries: JournalEntry[];
    day: JournalDay | null;
  };
  meals: Record<(typeof MEAL_SLOTS)[number], ReturnType<typeof mealToApi> | null>;
};

type JournalData = Awaited<ReturnType<typeof loadJournalData>>;

function dateInTimezone(timeZone: string, value: string | Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function profileTimeZone(userId: string) {
  const result = await createCloudflareAdminClient().from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error("The profile timezone could not be loaded.");
  return typeof result.data?.timezone === "string" && result.data.timezone.trim() ? result.data.timezone : DEFAULT_TIME_ZONE;
}

export function nativeLabDayPayload(input: { date: string; timezone: string; journal: JournalData; meals: Meal[] }): NativeLabDay {
  const mealsBySlot = new Map(input.meals.map((meal) => [meal.mealType, meal]));
  return {
    date: input.date,
    timezone: input.timezone,
    journal: {
      variables: input.journal.variables,
      entries: input.journal.entries.filter((entry) => entry.entryDate === input.date),
      day: input.journal.days.find((day) => day.entryDate === input.date) ?? null,
    },
    meals: Object.fromEntries(MEAL_SLOTS.map((slot) => {
      const meal = mealsBySlot.get(slot);
      return [slot, meal ? mealToApi(meal) : null];
    })) as NativeLabDay["meals"],
  };
}

export async function getNativeLabDay(userId: string, date: string): Promise<NativeLabDay> {
  const timezone = await profileTimeZone(userId);
  const [journal, meals] = await Promise.all([
    loadJournalData(userId, {
      from: date,
      to: date,
      timeZone: timezone,
      includeAutomaticEntries: true,
      ensureDefaults: false,
    }),
    listMeals(userId, { from: date, to: date }),
  ]);
  return nativeLabDayPayload({ date, timezone, journal, meals });
}

export type NativeJournalSave = z.infer<typeof saveJournalEntriesSchema>;

export async function saveNativeJournalEntries(userId: string, input: NativeJournalSave) {
  const admin = createCloudflareAdminClient();
  const timezone = await profileTimeZone(userId);
  const today = dateInTimezone(timezone);
  if (input.entryDate > today || input.entryDate < addDays(today, -4)) {
    throw new Error("Journal drafts are available for today and the previous four days.");
  }

  const dayResult = await admin.from("journal_days").select("status").eq("user_id", userId).eq("entry_date", input.entryDate).maybeSingle();
  if (dayResult.error) throw new Error("This journal day could not be checked.");

  const journal = await loadJournalData(userId, { includeAutomaticEntries: false, ensureDefaults: false });
  const variables = new Map(journal.variables.map((variable) => [variable.id, variable]));
  const normalized = input.entries.map((entry) => {
    const variable = variables.get(entry.variableId);
    if (!variable || !variable.isActive) return { ...entry, variable: null, value: null, invalid: false };
    const value = normalizeJournalValue(variable, entry.value);
    return { ...entry, variable, value, invalid: entry.value !== null && entry.value !== "" && value === null };
  });
  if (normalized.some((entry) => !entry.variable)) throw new Error("One journal variable is unavailable.");
  if (normalized.some((entry) => entry.invalid)) throw new Error("One journal value is invalid.");

  // Editing a validated day keeps it validated, matching the Web journal route.
  const validating = input.mode === "validate" || dayResult.data?.status === "validated";
  const payload = normalized.map((entry) => ({ variable_id: entry.variableId, value: entry.value }));
  const saveResult = await admin.rpc("save_personal_lab_journal_day", {
    p_user_id: userId,
    p_entry_date: input.entryDate,
    p_entries: payload,
    p_validate: validating,
    p_replace_omissions: input.mode === "validate",
  });
  if (saveResult.error) throw new Error(validating ? "This day could not be validated." : "This draft could not be saved.");

  return {
    status: validating ? "validated" as const : "draft" as const,
    saved: payload.filter((entry) => entry.value !== null).length,
    omitted: payload.filter((entry) => entry.value === null).length,
  };
}

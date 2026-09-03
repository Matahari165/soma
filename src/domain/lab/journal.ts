import { z } from "zod";

export const journalVariableTypes = ["boolean", "count", "duration", "number", "scale", "category", "time"] as const;
export type JournalVariableType = (typeof journalVariableTypes)[number];

export type JournalVariable = {
  id: string;
  name: string;
  variableType: JournalVariableType;
  unit: string | null;
  options: string[];
  position: number;
  isActive: boolean;
  emoji: string;
  defaultValue: JournalEntryValue | null;
  dayPeriod: JournalDayPeriod;
};

export type JournalEntryValue = boolean | number | string;
export type JournalEntry = { variableId: string; entryDate: string; value: JournalEntryValue };
export type JournalDraft = Record<string, JournalEntryValue | null>;
export type JournalDraftsByDate = Record<string, JournalDraft>;
export type JournalDayStatus = "draft" | "validated";
export type JournalDay = { entryDate: string; status: JournalDayStatus; validatedAt: string | null; omittedVariableIds: string[] };

export type JournalDayPeriod = "context" | "morning" | "day" | "evening" | "sleep" | "other";

export const journalDayPeriods: ReadonlyArray<{ id: JournalDayPeriod; label: string }> = [
  { id: "context", label: "Day context" },
  { id: "morning", label: "Morning" },
  { id: "day", label: "Day" },
  { id: "evening", label: "Evening" },
  { id: "sleep", label: "Before sleep" },
  { id: "other", label: "Other" },
];

export function journalDayPeriod(position: number): JournalDayPeriod {
  if (position < 10) return "context";
  if (position < 40) return "morning";
  if (position < 60) return "day";
  if (position < 90) return "evening";
  if (position < 140) return "sleep";
  return "other";
}

const name = z.string().trim().min(1).max(80);
const options = z.array(z.string().trim().min(1).max(60)).max(20).default([])
  .transform((values) => [...new Set(values)]);
const rawEntryValue = z.union([z.boolean(), z.number().finite(), z.string().max(120), z.null()]);

function defaultMatchesType(variableType: JournalVariableType, value: JournalEntryValue | null | undefined, choices: string[]) {
  if (value === null || value === undefined) return true;
  if (variableType === "boolean") return typeof value === "boolean";
  if (variableType === "category") return typeof value === "string" && choices.includes(value);
  if (variableType === "time") return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (variableType === "count") return Number.isInteger(value) && value >= 0;
  if (variableType === "duration") return value >= 0;
  if (variableType === "scale") return Number.isInteger(value) && value >= 1 && value <= 5;
  return true;
}

export const createJournalVariableSchema = z.object({
  name,
  variableType: z.enum(journalVariableTypes),
  unit: z.string().trim().max(32).nullable().optional(),
  options,
  emoji: z.string().trim().max(8).default("🧪"),
  defaultValue: rawEntryValue.optional(),
  dayPeriod: z.enum(["context", "morning", "day", "evening", "sleep", "other"]).default("day"),
}).superRefine((value, context) => {
  if (value.variableType === "category" && value.options.length < 2) {
    context.addIssue({ code: "custom", path: ["options"], message: "Add at least two choices." });
  }
  if (!defaultMatchesType(value.variableType, value.defaultValue, value.options)) {
    context.addIssue({ code: "custom", path: ["defaultValue"], message: "The default does not match this measure type." });
  }
});

export const updateJournalVariableSchema = z.object({
  id: z.string().uuid(),
  name: name.optional(),
  variableType: z.enum(journalVariableTypes).optional(),
  unit: z.string().trim().max(32).nullable().optional(),
  options: options.optional(),
  position: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
  emoji: z.string().trim().max(8).optional(),
  defaultValue: rawEntryValue.optional(),
  dayPeriod: z.enum(["context", "morning", "day", "evening", "sleep", "other"]).optional(),
}).superRefine((value, context) => {
  if (value.options !== undefined && value.options.length < 2) {
    context.addIssue({ code: "custom", path: ["options"], message: "Add at least two choices." });
  }
  if (value.variableType !== undefined && !defaultMatchesType(value.variableType, value.defaultValue, value.options ?? [])) {
    context.addIssue({ code: "custom", path: ["defaultValue"], message: "The default does not match this measure type." });
  }
});

export const saveJournalEntriesSchema = z.object({
  entryDate: z.iso.date(),
  mode: z.enum(["draft", "validate"]).default("draft"),
  entries: z.array(z.object({ variableId: z.string().uuid(), value: rawEntryValue })).max(100),
});

export function journalValuesForDate(variables: readonly JournalVariable[], entries: readonly JournalEntry[], days: readonly JournalDay[], date: string): JournalDraft {
  const omitted = new Set(days.find((day) => day.entryDate === date)?.omittedVariableIds ?? []);
  return Object.fromEntries(variables.map((variable) => [
    variable.id,
    omitted.has(variable.id) ? null : normalizeDinnerTimeValue(variable, entries.find((entry) => entry.entryDate === date && entry.variableId === variable.id)?.value ?? variable.defaultValue ?? null),
  ]));
}

export function journalDraftsForDates(dates: readonly string[], variables: readonly JournalVariable[], entries: readonly JournalEntry[], days: readonly JournalDay[]): JournalDraftsByDate {
  return Object.fromEntries(dates.map((date) => [date, journalValuesForDate(variables, entries, days, date)]));
}

export function updateJournalDraft(drafts: JournalDraftsByDate, date: string, variableId: string, value: JournalEntryValue | null): JournalDraftsByDate {
  return { ...drafts, [date]: { ...(drafts[date] ?? {}), [variableId]: value } };
}

export function reconcileJournalDrafts(serverDrafts: JournalDraftsByDate, currentDrafts: JournalDraftsByDate, pendingDates: ReadonlySet<string>): JournalDraftsByDate {
  const next = { ...serverDrafts };
  for (const date of pendingDates) {
    if (currentDrafts[date]) next[date] = currentDrafts[date];
  }
  return next;
}

export function journalEntriesForSave(variableIds: readonly string[], draft: JournalDraft, mode: "draft" | "validate", changedVariableId?: string, includedVariableIds?: ReadonlySet<string>) {
  const ids = mode === "draft" && changedVariableId
    ? [changedVariableId]
    : includedVariableIds
      ? variableIds.filter((variableId) => includedVariableIds.has(variableId))
      : variableIds;
  return ids.map((variableId) => ({ variableId, value: draft[variableId] ?? null }));
}

export function normalizeJournalValue(variable: JournalVariable, raw: unknown): JournalEntryValue | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (variable.variableType === "boolean") return typeof raw === "boolean" ? raw : null;
  if (variable.variableType === "category") return typeof raw === "string" && variable.options.includes(raw) ? raw : null;
  if (variable.variableType === "time") {
    if (typeof raw !== "string") return null;
    return isDinnerTimeVariable(variable) ? normalizeDinnerTimeInput(raw) : /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null;
  }
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) return null;
  if (["caffeine", "added sugar", "magnesium"].includes(variable.name.toLocaleLowerCase("en")) && value < 0) return null;
  if (variable.variableType === "count" && (!Number.isInteger(value) || value < 0)) return null;
  if (variable.variableType === "duration" && value < 0) return null;
  if (variable.variableType === "scale" && (!Number.isInteger(value) || value < 1 || value > 5)) return null;
  return value;
}

export function journalValueAsNumber(variable: JournalVariable, value: JournalEntryValue) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (variable.variableType === "time" && typeof value === "string") {
    const normalized = normalizeDinnerTimeValue(variable, value);
    if (typeof normalized !== "string") return null;
    const [hours, minutes] = normalized.split(":").map(Number);
    const sinceMidnight = hours * 60 + minutes;
    return sinceMidnight < 12 * 60 ? sinceMidnight + 24 * 60 : sinceMidnight;
  }
  return null;
}

export function isDinnerTimeVariable(variable: Pick<JournalVariable, "name" | "variableType">) {
  return variable.variableType === "time" && variable.name.trim().toLocaleLowerCase("en") === "dinner end time";
}

export function normalizeDinnerTimeInput(raw: string) {
  const match = raw.trim().toLocaleLowerCase("en").match(/^(\d{1,2})(?::|h|\.)?(\d{2})$/);
  if (!match) return null;
  const enteredHour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(enteredHour) || enteredHour < 0 || enteredHour > 23 || minute < 0 || minute > 59) return null;
  const hour = enteredHour < 12 ? enteredHour + 12 : enteredHour;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function dinnerTimeForDisplay(value: string) {
  const normalized = normalizeDinnerTimeInput(value);
  if (!normalized) return value;
  const [hour, minute] = normalized.split(":");
  const displayHour = Number(hour) > 12 ? Number(hour) - 12 : Number(hour);
  return `${displayHour}:${minute}`;
}

function normalizeDinnerTimeValue(variable: JournalVariable, value: JournalEntryValue | null) {
  if (!isDinnerTimeVariable(variable) || typeof value !== "string") return value;
  return normalizeDinnerTimeInput(value) ?? value;
}

export const defaultJournalVariables = [
  { name: "Vacation", emoji: "🏖️", variableType: "boolean", unit: null, options: [], position: 0, dayPeriod: "context", defaultValue: false },
  { name: "Illness", emoji: "🤒", variableType: "boolean", unit: null, options: [], position: 5, dayPeriod: "context", defaultValue: false },
  { name: "Breakfast", emoji: "🍳", variableType: "boolean", unit: null, options: [], position: 10, dayPeriod: "morning", defaultValue: false },
  { name: "WHM", emoji: "🫁", variableType: "count", unit: "rounds", options: [], position: 20, dayPeriod: "morning", defaultValue: 0 },
  { name: "Caffeine", emoji: "☕", variableType: "number", unit: "mg", options: [], position: 30, dayPeriod: "day", defaultValue: 0 },
  { name: "Added sugar", emoji: "🍬", variableType: "number", unit: "g", options: [], position: 40, dayPeriod: "day", defaultValue: 0 },
  { name: "Masturbation", emoji: "✋", variableType: "boolean", unit: null, options: [], position: 50, dayPeriod: "day", defaultValue: false },
  { name: "Alcohol", emoji: "🍷", variableType: "count", unit: "drinks", options: [], position: 60, dayPeriod: "evening", defaultValue: 0 },
  { name: "Strength training", emoji: "🏋️", variableType: "boolean", unit: null, options: [], position: 65, dayPeriod: "day", defaultValue: false },
  { name: "Dinner end time", emoji: "🍽️", variableType: "time", unit: null, options: [], position: 70, dayPeriod: "evening", defaultValue: null },
  { name: "Magnesium", emoji: "💊", variableType: "number", unit: "mg", options: [], position: 80, dayPeriod: "morning", defaultValue: 0 },
  { name: "Breathing exercise", emoji: "🌬️", variableType: "boolean", unit: null, options: [], position: 90, dayPeriod: "evening", defaultValue: false },
  { name: "Reading for 30 minutes", emoji: "📖", variableType: "boolean", unit: null, options: [], position: 100, dayPeriod: "evening", defaultValue: false },
  { name: "Dark room", emoji: "🌑", variableType: "boolean", unit: null, options: [], position: 110, dayPeriod: "evening", defaultValue: true },
] as const satisfies ReadonlyArray<{ name: string; emoji: string; variableType: JournalVariableType; unit: string | null; options: readonly string[]; position: number; dayPeriod: JournalDayPeriod; defaultValue: JournalEntryValue | null }>;

export const journalVariableSuggestions = [
  { name: "Late meal", variableType: "boolean", unit: null, options: [] },
  { name: "Illness", variableType: "boolean", unit: null, options: [] },
  { name: "Nap", variableType: "duration", unit: "min", options: [] },
  { name: "Meditation", variableType: "duration", unit: "min", options: [] },
  { name: "Travel", variableType: "boolean", unit: null, options: [] },
] as const satisfies ReadonlyArray<{ name: string; variableType: JournalVariableType; unit: string | null; options: readonly string[] }>;

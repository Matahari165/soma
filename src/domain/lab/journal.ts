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

export function journalFieldHint(variable: Pick<JournalVariable, "name" | "variableType" | "unit">) {
  // The unit is already rendered inside the numeric field. Keep the hint for
  // boolean/time/scale controls, but do not repeat units such as mg or g.
  if (variable.unit) return null;
  if (variable.name === "WHM") return "Rounds";
  if (variable.variableType === "boolean") return "Yes / no";
  if (variable.variableType === "time") return "Time";
  if (variable.variableType === "scale") return "Scale 1–5";
  return null;
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

export function normalizeJournalValue(variable: JournalVariable, raw: unknown): JournalEntryValue | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (variable.variableType === "boolean") return typeof raw === "boolean" ? raw : null;
  if (variable.variableType === "category") return typeof raw === "string" && variable.options.includes(raw) ? raw : null;
  if (variable.variableType === "time") return typeof raw === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null;
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
    const [hours, minutes] = value.split(":").map(Number);
    const sinceMidnight = hours * 60 + minutes;
    return sinceMidnight < 12 * 60 ? sinceMidnight + 24 * 60 : sinceMidnight;
  }
  return null;
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
  { name: "Dinner end time", emoji: "🍽️", variableType: "time", unit: null, options: [], position: 70, dayPeriod: "evening", defaultValue: null },
  { name: "Magnesium", emoji: "💊", variableType: "number", unit: "mg", options: [], position: 80, dayPeriod: "evening", defaultValue: 0 },
  { name: "Breathing exercise", emoji: "🌬️", variableType: "boolean", unit: null, options: [], position: 90, dayPeriod: "sleep", defaultValue: false },
  { name: "Reading for 30 minutes", emoji: "📖", variableType: "boolean", unit: null, options: [], position: 100, dayPeriod: "sleep", defaultValue: false },
  { name: "Dark room", emoji: "🌑", variableType: "boolean", unit: null, options: [], position: 110, dayPeriod: "sleep", defaultValue: true },
] as const satisfies ReadonlyArray<{ name: string; emoji: string; variableType: JournalVariableType; unit: string | null; options: readonly string[]; position: number; dayPeriod: JournalDayPeriod; defaultValue: JournalEntryValue | null }>;

export const journalVariableSuggestions = [
  { name: "Late meal", variableType: "boolean", unit: null, options: [] },
  { name: "Illness", variableType: "boolean", unit: null, options: [] },
  { name: "Nap", variableType: "duration", unit: "min", options: [] },
  { name: "Meditation", variableType: "duration", unit: "min", options: [] },
  { name: "Travel", variableType: "boolean", unit: null, options: [] },
] as const satisfies ReadonlyArray<{ name: string; variableType: JournalVariableType; unit: string | null; options: readonly string[] }>;

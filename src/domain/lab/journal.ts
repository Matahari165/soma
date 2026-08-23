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
};

export type JournalEntryValue = boolean | number | string;
export type JournalEntry = { variableId: string; entryDate: string; value: JournalEntryValue };

const name = z.string().trim().min(1).max(80);
const options = z.array(z.string().trim().min(1).max(60)).max(20).default([])
  .transform((values) => [...new Set(values)]);

export const createJournalVariableSchema = z.object({
  name,
  variableType: z.enum(journalVariableTypes),
  unit: z.string().trim().max(32).nullable().optional(),
  options,
}).superRefine((value, context) => {
  if (value.variableType === "category" && value.options.length < 2) {
    context.addIssue({ code: "custom", path: ["options"], message: "Add at least two choices." });
  }
});

export const updateJournalVariableSchema = z.object({
  id: z.string().uuid(),
  name: name.optional(),
  unit: z.string().trim().max(32).nullable().optional(),
  options: options.optional(),
  position: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
}).superRefine((value, context) => {
  if (value.options !== undefined && value.options.length < 2) {
    context.addIssue({ code: "custom", path: ["options"], message: "Add at least two choices." });
  }
});

const rawEntryValue = z.union([z.boolean(), z.number().finite(), z.string().max(120), z.null()]);

export const saveJournalEntriesSchema = z.object({
  entryDate: z.iso.date(),
  entries: z.array(z.object({ variableId: z.string().uuid(), value: rawEntryValue })).max(100),
});

export function normalizeJournalValue(variable: JournalVariable, raw: unknown): JournalEntryValue | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (variable.variableType === "boolean") return typeof raw === "boolean" ? raw : null;
  if (variable.variableType === "category") return typeof raw === "string" && variable.options.includes(raw) ? raw : null;
  if (variable.variableType === "time") return typeof raw === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) return null;
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
  { name: "Alcohol", variableType: "count", unit: "drinks", options: [] },
  { name: "Caffeine", variableType: "count", unit: "mg", options: [] },
  { name: "Deep Work", variableType: "duration", unit: "min", options: [] },
  { name: "Bedtime", variableType: "time", unit: null, options: [] },
  { name: "Vacation", variableType: "boolean", unit: null, options: [] },
] as const satisfies ReadonlyArray<{ name: string; variableType: JournalVariableType; unit: string | null; options: readonly string[] }>;

export const journalVariableSuggestions = [
  ...defaultJournalVariables,
  { name: "Late meal", variableType: "boolean", unit: null, options: [] },
  { name: "Illness", variableType: "boolean", unit: null, options: [] },
  { name: "Nap", variableType: "duration", unit: "min", options: [] },
  { name: "Meditation", variableType: "duration", unit: "min", options: [] },
  { name: "Travel", variableType: "boolean", unit: null, options: [] },
] as const satisfies ReadonlyArray<{ name: string; variableType: JournalVariableType; unit: string | null; options: readonly string[] }>;

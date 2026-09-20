import { z } from "zod";

export const journalVariableTypes = ["boolean", "count", "duration", "number", "scale", "category", "time"] as const;
export type JournalVariableType = (typeof journalVariableTypes)[number];

export const journalCaptureModes = ["manual", "automatic"] as const;
export type JournalCaptureMode = (typeof journalCaptureModes)[number];

export const journalTrackingCadences = ["daily", "weekly"] as const;
export type JournalTrackingCadence = (typeof journalTrackingCadences)[number];

export const ADDED_SUGAR_AUTOMATIC_METRIC_ID = "meal_added_sugar" as const;
export const ADDED_SUGAR_GOAL_G = 0;
export const ADDED_SUGAR_GOAL_TOLERANCE_G = 4;
export const LIGHT_BREAKFAST_AUTOMATIC_METRIC_ID = "light_breakfast" as const;

export const journalAutomaticMetricIds = ["run_day", "bedtime_before_23", "bedtime", ADDED_SUGAR_AUTOMATIC_METRIC_ID, LIGHT_BREAKFAST_AUTOMATIC_METRIC_ID] as const;
export type JournalAutomaticMetricId = (typeof journalAutomaticMetricIds)[number];

export type JournalAutomaticSource = {
  id: JournalAutomaticMetricId;
  label: string;
  source: "Google Health" | "Soma meals";
  variableType: JournalVariableType;
  unit: string | null;
  dayPeriod: JournalDayPeriod;
  defaultTrackingCadence: JournalTrackingCadence;
};

export const journalAutomaticSources: readonly JournalAutomaticSource[] = [
  { id: "run_day", label: "Running detected", source: "Google Health", variableType: "boolean", unit: null, dayPeriod: "day", defaultTrackingCadence: "weekly" },
  { id: "bedtime_before_23", label: "Bedtime before 11 PM", source: "Google Health", variableType: "boolean", unit: null, dayPeriod: "evening", defaultTrackingCadence: "daily" },
  { id: "bedtime", label: "Detected sleep start", source: "Google Health", variableType: "time", unit: null, dayPeriod: "evening", defaultTrackingCadence: "daily" },
  { id: ADDED_SUGAR_AUTOMATIC_METRIC_ID, label: "Meal added sugars", source: "Soma meals", variableType: "number", unit: "g", dayPeriod: "day", defaultTrackingCadence: "daily" },
  { id: LIGHT_BREAKFAST_AUTOMATIC_METRIC_ID, label: "Light breakfast", source: "Soma meals", variableType: "boolean", unit: null, dayPeriod: "morning", defaultTrackingCadence: "daily" },
] as const;

export function journalAutomaticSource(id: unknown) {
  return journalAutomaticSources.find((source) => source.id === id) ?? null;
}

export function journalCaptureMode(variable: Pick<JournalVariable, "captureMode">) {
  return variable.captureMode === "automatic" ? "automatic" : "manual";
}

export function journalAutomaticMetricId(variable: Pick<JournalVariable, "automaticMetricId">) {
  return typeof variable.automaticMetricId === "string" ? variable.automaticMetricId : null;
}

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
  /** Legacy rows may omit these fields until the source-mode migration is applied. */
  captureMode?: JournalCaptureMode;
  automaticMetricId?: string | null;
  trackingCadence?: JournalTrackingCadence;
};

export type JournalEntryValue = boolean | number | string;
export type JournalEntrySource = "manual" | "automatic";
export type JournalEntry = { variableId: string; entryDate: string; value: JournalEntryValue; source?: JournalEntrySource };
export type JournalDraft = Record<string, JournalEntryValue | null>;
export type JournalDraftsByDate = Record<string, JournalDraft>;
export type JournalDayStatus = "draft" | "validated";
export type JournalDay = { entryDate: string; status: JournalDayStatus; validatedAt: string | null; omittedVariableIds: string[] };

export type JournalDayPeriod = "context" | "morning" | "day" | "evening" | "sleep" | "other";

export function normalizedJournalVariableName(name: string) {
  return name.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isAddedSugarVariable(variable: Pick<JournalVariable, "name" | "automaticMetricId">) {
  const name = normalizedJournalVariableName(variable.name);
  return variable.automaticMetricId === ADDED_SUGAR_AUTOMATIC_METRIC_ID || name === "added sugar" || name === "sucres ajoutes";
}

export function journalAutomaticDefaultMatches(variable: Pick<JournalVariable, "name" | "automaticMetricId">, definition: Pick<JournalVariable, "name" | "automaticMetricId">) {
  const automaticMetricId = journalAutomaticMetricId(definition);
  if (!automaticMetricId) return false;
  if (journalAutomaticMetricId(variable) === automaticMetricId) return true;
  if (automaticMetricId === ADDED_SUGAR_AUTOMATIC_METRIC_ID && isAddedSugarVariable(variable)) return true;
  if (automaticMetricId === "bedtime_before_23") {
    const varName = normalizedJournalVariableName(variable.name);
    if (varName === "coucher avant 23 h" || varName === "bedtime before 11 pm" || varName === "bedtime before 23") return true;
  }
  const sourceLabel = journalAutomaticSource(automaticMetricId)?.label;
  const variableName = normalizedJournalVariableName(variable.name);
  return [definition.name, sourceLabel].filter((name): name is string => Boolean(name)).some((name) => normalizedJournalVariableName(name) === variableName);
}

/** Values at or below the tolerance are recorded as the achieved 0 g goal. */
export function normalizedAddedSugarJournalValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value <= ADDED_SUGAR_GOAL_TOLERANCE_G) return ADDED_SUGAR_GOAL_G;
  return Math.round(value * 10) / 10;
}

export function journalValueMeetsGoal(variable: Pick<JournalVariable, "name" | "automaticMetricId">, value: JournalEntryValue) {
  if (isAddedSugarVariable(variable)) return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= ADDED_SUGAR_GOAL_TOLERANCE_G;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return value.trim().length > 0;
}

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

export function journalVariableSourceError({ captureMode, automaticMetricId, variableType }: { captureMode: JournalCaptureMode; automaticMetricId: string | null | undefined; variableType: JournalVariableType }) {
  const source = journalAutomaticSource(automaticMetricId);
  if (captureMode === "manual" && automaticMetricId) return "A manual metric cannot have an automatic source.";
  if (captureMode === "automatic" && !automaticMetricId) return "Choose an automatic source.";
  if (captureMode === "automatic" && !source) return "This automatic source is unavailable.";
  if (source && source.variableType !== variableType) return `This automatic source expects type ${source.variableType}.`;
  return null;
}

export function defaultMatchesType(variableType: JournalVariableType, value: JournalEntryValue | null | undefined, choices: string[]) {
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
  captureMode: z.enum(journalCaptureModes).default("manual"),
  automaticMetricId: z.string().trim().regex(/^[a-z0-9_:-]{1,100}$/).nullable().default(null),
  trackingCadence: z.enum(journalTrackingCadences).optional(),
}).superRefine((value, context) => {
  if (value.variableType === "category" && value.options.length < 2) {
    context.addIssue({ code: "custom", path: ["options"], message: "Add at least two choices." });
  }
  if (!defaultMatchesType(value.variableType, value.defaultValue, value.options)) {
    context.addIssue({ code: "custom", path: ["defaultValue"], message: "The default does not match this measure type." });
  }
  const sourceError = journalVariableSourceError(value);
  if (sourceError) context.addIssue({ code: "custom", path: ["captureMode"], message: sourceError });
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
  captureMode: z.enum(journalCaptureModes).optional(),
  automaticMetricId: z.string().trim().regex(/^[a-z0-9_:-]{1,100}$/).nullable().optional(),
  trackingCadence: z.enum(journalTrackingCadences).optional(),
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
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.entries.forEach((entry, index) => {
    if (seen.has(entry.variableId)) {
      context.addIssue({ code: "custom", path: ["entries", index, "variableId"], message: "Each journal variable can appear only once." });
    }
    seen.add(entry.variableId);
  });
});

export function journalValuesForDate(variables: readonly JournalVariable[], entries: readonly JournalEntry[], days: readonly JournalDay[], date: string): JournalDraft {
  const omitted = new Set(days.find((day) => day.entryDate === date)?.omittedVariableIds ?? []);
  return Object.fromEntries(variables.map((variable) => [
    variable.id,
    omitted.has(variable.id) ? null : normalizeDinnerTimeValue(variable, entries.find((entry) => entry.entryDate === date && entry.variableId === variable.id)?.value ?? (journalCaptureMode(variable) === "automatic" ? null : variable.defaultValue) ?? null),
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

type DefaultJournalVariable = { name: string; emoji: string; variableType: JournalVariableType; unit: string | null; options: readonly string[]; position: number; dayPeriod: JournalDayPeriod; defaultValue: JournalEntryValue | null; captureMode?: JournalCaptureMode; automaticMetricId?: string | null; trackingCadence?: JournalTrackingCadence };

export type HabitCategory = "sleep" | "nutrition" | "activity";

export type HealthyHabitCatalogItem = {
  id: string;
  name: string;
  category: HabitCategory;
  emoji: string;
  description: string;
  defaultSelected: boolean;
  journalVariableName: string;
};

export const healthyHabitCatalog: readonly HealthyHabitCatalogItem[] = [
  // Sleep
  { id: "coucher_23", name: "Bedtime before 11 PM", category: "sleep", emoji: "🌙", description: "Circadian rhythm consistency", defaultSelected: true, journalVariableName: "Bedtime before 11 PM" },
  { id: "dark_room", name: "Dark, cool bedroom", category: "sleep", emoji: "🌑", description: "Optimal environment for deep sleep", defaultSelected: true, journalVariableName: "Dark room" },
  { id: "reading", name: "Reading for 20 minutes", category: "sleep", emoji: "📖", description: "Wind-down routine before sleep", defaultSelected: true, journalVariableName: "Reading for 20 minutes" },
  { id: "breathing", name: "Breathing exercise", category: "sleep", emoji: "🌬️", description: "Calming the autonomic nervous system", defaultSelected: false, journalVariableName: "Breathing exercise" },
  { id: "dinner_time", name: "Early dinner cutoff", category: "sleep", emoji: "🍽️", description: "Complete digestion before sleeping", defaultSelected: true, journalVariableName: "Dinner end time" },

  // Nutrition
  { id: "sugar", name: "Limit added sugars", category: "nutrition", emoji: "🍬", description: "Blood glucose stability and alertness", defaultSelected: true, journalVariableName: "Added sugar" },
  { id: "breakfast", name: "Balanced breakfast", category: "nutrition", emoji: "🍳", description: "First metabolic anchor of the day", defaultSelected: true, journalVariableName: "Breakfast" },
  { id: "caffeine", name: "Caffeine tracking", category: "nutrition", emoji: "☕", description: "Moderation and cutoff after 2 PM", defaultSelected: true, journalVariableName: "Caffeine" },
  { id: "alcohol", name: "Alcohol tracking", category: "nutrition", emoji: "🍷", description: "Observe impact on sleep and HRV", defaultSelected: true, journalVariableName: "Alcohol" },
  { id: "magnesium", name: "Magnesium", category: "nutrition", emoji: "💊", description: "Muscle support and nervous recovery", defaultSelected: false, journalVariableName: "Magnesium" },

  // Activity
  { id: "running", name: "Running", category: "activity", emoji: "🏃", description: "Aerobic capacity and endurance", defaultSelected: true, journalVariableName: "Running" },
  { id: "strength", name: "Strength training", category: "activity", emoji: "🏋️", description: "Muscle mass and bone density", defaultSelected: true, journalVariableName: "Strength training" },
  { id: "walking", name: "Daily walk (8,000 steps)", category: "activity", emoji: "🚶", description: "Movement volume without excess fatigue", defaultSelected: false, journalVariableName: "Walking" },
  { id: "mobility", name: "Mobility or stretching", category: "activity", emoji: "🧘", description: "Joint range of motion and release", defaultSelected: false, journalVariableName: "Mobility" },
];

export const defaultJournalVariables: ReadonlyArray<DefaultJournalVariable> = [
  { name: "Vacation", emoji: "🏖️", variableType: "boolean", unit: null, options: [], position: 0, dayPeriod: "context", defaultValue: false },
  { name: "Illness", emoji: "🤒", variableType: "boolean", unit: null, options: [], position: 5, dayPeriod: "context", defaultValue: false },
  { name: "Breakfast", emoji: "🍳", variableType: "boolean", unit: null, options: [], position: 10, dayPeriod: "morning", defaultValue: false },
  { name: "Light breakfast", emoji: "🥣", variableType: "boolean", unit: null, options: [], position: 15, dayPeriod: "morning", defaultValue: null, captureMode: "automatic", automaticMetricId: LIGHT_BREAKFAST_AUTOMATIC_METRIC_ID, trackingCadence: "daily" },
  { name: "Caffeine", emoji: "☕", variableType: "number", unit: "mg", options: [], position: 30, dayPeriod: "day", defaultValue: 0 },
  { name: "Added sugar", emoji: "🍬", variableType: "number", unit: "g", options: [], position: 40, dayPeriod: "day", defaultValue: null, captureMode: "automatic", automaticMetricId: ADDED_SUGAR_AUTOMATIC_METRIC_ID, trackingCadence: "daily" },
  { name: "Running", emoji: "🏃", variableType: "boolean", unit: null, options: [], position: 55, dayPeriod: "day", defaultValue: null, captureMode: "automatic", automaticMetricId: "run_day", trackingCadence: "weekly" },
  { name: "Alcohol", emoji: "🍷", variableType: "count", unit: "drinks", options: [], position: 60, dayPeriod: "evening", defaultValue: 0 },
  { name: "Strength training", emoji: "🏋️", variableType: "boolean", unit: null, options: [], position: 65, dayPeriod: "day", defaultValue: false },
  { name: "Dinner end time", emoji: "🍽️", variableType: "time", unit: null, options: [], position: 70, dayPeriod: "evening", defaultValue: null },
  { name: "Bedtime before 11 PM", emoji: "🌙", variableType: "boolean", unit: null, options: [], position: 75, dayPeriod: "evening", defaultValue: null, captureMode: "automatic", automaticMetricId: "bedtime_before_23", trackingCadence: "daily" },
  { name: "Bedtime", emoji: "🌘", variableType: "time", unit: null, options: [], position: 78, dayPeriod: "evening", defaultValue: null, captureMode: "automatic", automaticMetricId: "bedtime", trackingCadence: "daily" },
  { name: "Magnesium", emoji: "💊", variableType: "number", unit: "mg", options: [], position: 80, dayPeriod: "morning", defaultValue: 0 },
  { name: "Breathing exercise", emoji: "🌬️", variableType: "boolean", unit: null, options: [], position: 90, dayPeriod: "evening", defaultValue: false },
  { name: "Reading for 20 minutes", emoji: "📖", variableType: "boolean", unit: null, options: [], position: 100, dayPeriod: "evening", defaultValue: false },
  { name: "Dark room", emoji: "🌑", variableType: "boolean", unit: null, options: [], position: 110, dayPeriod: "evening", defaultValue: true },
];

export const journalVariableSuggestions = [
  { name: "Late meal", variableType: "boolean", unit: null, options: [] },
  { name: "Illness", variableType: "boolean", unit: null, options: [] },
  { name: "Nap", variableType: "duration", unit: "min", options: [] },
  { name: "Meditation", variableType: "duration", unit: "min", options: [] },
  { name: "Travel", variableType: "boolean", unit: null, options: [] },
] as const satisfies ReadonlyArray<{ name: string; variableType: JournalVariableType; unit: string | null; options: readonly string[] }>;

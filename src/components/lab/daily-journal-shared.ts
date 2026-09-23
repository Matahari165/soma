import {
  journalDayPeriods,
  journalVariableSuggestions,
  type JournalEntryValue,
  type JournalDayPeriod,
  type JournalVariable,
  type JournalVariableType,
  type JournalCaptureMode,
  type JournalTrackingCadence,
} from "@/domain/lab/journal";
import { JOURNAL_ACHIEVEMENT_WINDOW_DAYS, type JournalAchievement } from "@/domain/lab/journal-achievement";

import { localizedMetricLabel, localizedMetricUnit } from "./lab-copy";

export type DraftValue = JournalEntryValue | null;
export type NewVariable = {
  name: string;
  variableType: JournalVariableType;
  unit: string;
  options: string;
  emoji: string;
  dayPeriod: JournalDayPeriod;
  defaultValue: string;
  captureMode: JournalCaptureMode;
  automaticMetricId: string | null;
  trackingCadence: JournalTrackingCadence;
};

export const typeLabels: Record<JournalVariableType, string> = {
  boolean: "Yes / No",
  count: "Counter",
  duration: "Duration",
  number: "Number",
  scale: "Scale 1–5",
  category: "Category",
  time: "Time",
};

export const journalDisplayOrder: JournalDayPeriod[] = ["morning", "day", "evening", "context", "other"];
export const editableJournalDayPeriods = journalDayPeriods.filter((period) => period.id !== "sleep");
export const numericTypes = new Set<JournalVariableType>(["count", "duration", "number", "scale"]);
export const textNumericTypes = new Set<JournalVariableType>(["count", "duration", "number"]);

const dayPeriodLabels: Record<JournalDayPeriod, string> = {
  context: "Day context",
  morning: "Morning",
  day: "Daytime",
  evening: "Evening",
  sleep: "Before sleep",
  other: "Other",
};

export type JournalSaveStatus = "draft" | "saving" | "saved" | "error";
export type JournalStatusTreatment = "v1" | "v2" | "v3";

export function journalStatusText({ validated, validating, saveStatus }: { validated: boolean; validating: boolean; saveStatus: JournalSaveStatus }) {
  if (validating) return "Validating…";
  if (saveStatus === "saving") return "Saving…";
  if (saveStatus === "error") return "Save failed";
  if (validated) return "Day validated";
  if (saveStatus === "saved") return "Draft saved";
  return "Local draft";
}

export function journalVariableKey(name: string) {
  return name.trim().toLocaleLowerCase("en");
}

export function journalVariableLabel(variable: Pick<JournalVariable, "name"> | Pick<NewVariable, "name">) {
  return localizedMetricLabel(`journal:${variable.name}`, variable.name);
}

export function journalVariableUnit(variable: Pick<JournalVariable, "unit">) {
  if (!variable.unit) return variable.unit;
  return localizedMetricUnit(variable.unit);
}

export function dayPeriodLabel(period: JournalDayPeriod) {
  return dayPeriodLabels[period];
}

export function splitOptions(value: string) {
  return value.split(",").map((option) => option.trim()).filter(Boolean);
}

export function displayedDayPeriod(variable: JournalVariable) {
  if (journalVariableKey(variable.name) === "magnesium") return "morning";
  return variable.dayPeriod === "sleep" ? "evening" : variable.dayPeriod;
}

export function suggestionDraft(suggestion: (typeof journalVariableSuggestions)[number]): NewVariable {
  return {
    name: suggestion.name,
    variableType: suggestion.variableType,
    unit: suggestion.unit ?? "",
    options: suggestion.options.join(", "),
    emoji: "🧪",
    dayPeriod: "day",
    defaultValue: suggestion.variableType === "boolean" ? "false" : "0",
    captureMode: "manual",
    automaticMetricId: null,
    trackingCadence: "daily",
  };
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function achievementWindowDays(achievement: JournalAchievement) {
  const start = Date.parse(`${achievement.windowStart}T12:00:00Z`);
  const end = Date.parse(`${achievement.windowEnd}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return JOURNAL_ACHIEVEMENT_WINDOW_DAYS;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

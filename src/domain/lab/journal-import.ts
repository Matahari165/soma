import { z } from "zod";

import type { JournalEntry, JournalEntryValue, JournalVariable, JournalVariableType } from "./journal";

const sourceCell = z.union([z.literal(0), z.literal(1), z.null()]);

export const journalImportSourceSchema = z.object({
  spreadsheetId: z.string().trim().min(1).max(200),
  sheetName: z.literal("Goose"),
  headers: z.array(z.string().nullable()).min(2).max(27),
  targets: z.array(z.union([z.string(), z.number().finite()]).nullable()).min(2).max(27),
  rows: z.array(z.object({
    sourceRow: z.number().int().positive().max(10000),
    date: z.iso.date(),
    values: z.array(sourceCell).max(26),
  })).max(1000),
}).superRefine((source, context) => {
  if (source.headers.length !== source.targets.length) {
    context.addIssue({ code: "custom", path: ["targets"], message: "The header and target rows must have the same number of cells." });
  }
  const expectedValues = source.headers.length - 1;
  source.rows.forEach((row, index) => {
    if (row.values.length !== expectedValues) {
      context.addIssue({ code: "custom", path: ["rows", index, "values"], message: "Each source row must contain one value per tracking column." });
    }
  });
});

export const journalImportResolutionSchema = z.object({
  key: z.string().trim().min(1).max(180),
  action: z.enum(["keep_soma", "use_sheet"]),
});

export const journalImportRequestSchema = z.object({
  mode: z.enum(["preview", "commit"]),
  source: journalImportSourceSchema,
  resolutions: z.array(journalImportResolutionSchema).max(1000).default([]),
});

export type JournalImportSource = z.infer<typeof journalImportSourceSchema>;
export type JournalImportResolution = z.infer<typeof journalImportResolutionSchema>;
export type JournalImportResolutionMap = Readonly<Record<string, JournalImportResolution["action"]>>;

type ImportMetricBehaviour = "direct" | "breakfast_skipped" | "whm_presence";

export type JournalSheetImportMetric = {
  key: string;
  sourceHeader: string;
  sourceLabel: string;
  canonicalName: string;
  aliases: readonly string[];
  emoji: string;
  variableType: JournalVariableType;
  unit: string | null;
  dayPeriod: "context" | "morning" | "day" | "evening" | "sleep" | "other";
  captureMode: "manual" | "automatic";
  automaticMetricId: string | null;
  trackingCadence: "daily" | "weekly";
  behaviour: ImportMetricBehaviour;
};

const sheetMetrics: readonly JournalSheetImportMetric[] = [
  { key: "wake", sourceHeader: "⏰ Réveil", sourceLabel: "Réveil", canonicalName: "Réveil", aliases: ["réveil", "wake", "wake up"], emoji: "⏰", variableType: "boolean", unit: null, dayPeriod: "morning", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "direct" },
  { key: "breakfast", sourceHeader: "🍳 Breakfast", sourceLabel: "Breakfast", canonicalName: "Light breakfast", aliases: ["breakfast", "light breakfast", "petit déjeuner", "petit dejeuner"], emoji: "🍳", variableType: "boolean", unit: null, dayPeriod: "morning", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "breakfast_skipped" },
  { key: "strength", sourceHeader: "💪 Muscu", sourceLabel: "Muscu", canonicalName: "Strength training", aliases: ["muscu", "strength", "strength training", "musculation"], emoji: "💪", variableType: "boolean", unit: null, dayPeriod: "day", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "direct" },
  { key: "whm", sourceHeader: "🧘‍♂️ WHM", sourceLabel: "WHM", canonicalName: "WHM", aliases: ["whm", "wim hof", "wim hof method", "respiration wim hof"], emoji: "🧘‍♂️", variableType: "count", unit: "rounds", dayPeriod: "morning", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "whm_presence" },
  { key: "english", sourceHeader: "🇬🇧 Anglais", sourceLabel: "Anglais", canonicalName: "Anglais", aliases: ["anglais", "english"], emoji: "🇬🇧", variableType: "boolean", unit: null, dayPeriod: "day", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "direct" },
  { key: "podcasts", sourceHeader: "🎧 Podcasts", sourceLabel: "Podcasts", canonicalName: "Podcasts", aliases: ["podcasts", "podcast"], emoji: "🎧", variableType: "boolean", unit: null, dayPeriod: "day", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "direct" },
  { key: "deep_work", sourceHeader: "🧠 Deep Work", sourceLabel: "Deep Work", canonicalName: "Deep Work", aliases: ["deep work", "deepwork"], emoji: "🧠", variableType: "boolean", unit: null, dayPeriod: "day", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "direct" },
  { key: "snack", sourceHeader: "🚫 Snack", sourceLabel: "Snack", canonicalName: "Snack", aliases: ["snack", "no snack"], emoji: "🚫", variableType: "boolean", unit: null, dayPeriod: "day", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "direct" },
  { key: "learning", sourceHeader: "📚 Apprendre", sourceLabel: "Apprendre", canonicalName: "Apprendre", aliases: ["apprendre", "learning", "learn"], emoji: "📚", variableType: "boolean", unit: null, dayPeriod: "day", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "direct" },
  { key: "tid", sourceHeader: "✍️ TID", sourceLabel: "TID", canonicalName: "TID", aliases: ["tid"], emoji: "✍️", variableType: "boolean", unit: null, dayPeriod: "evening", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "direct" },
  { key: "lab", sourceHeader: "Lab", sourceLabel: "Lab", canonicalName: "Lab", aliases: ["lab", "habits"], emoji: "🧪", variableType: "boolean", unit: null, dayPeriod: "day", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "direct" },
  { key: "floss", sourceHeader: "🦷 Floss", sourceLabel: "Floss", canonicalName: "Floss", aliases: ["floss", "dental floss", "fil dentaire"], emoji: "🦷", variableType: "boolean", unit: null, dayPeriod: "evening", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "direct" },
  { key: "reading", sourceHeader: "📖 Lecture", sourceLabel: "Lecture", canonicalName: "Reading for 30 minutes", aliases: ["lecture", "reading", "reading for 30 minutes"], emoji: "📖", variableType: "boolean", unit: null, dayPeriod: "evening", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily", behaviour: "direct" },
  { key: "bedtime", sourceHeader: "💤 Sommeil", sourceLabel: "Sommeil", canonicalName: "Coucher avant 23 h", aliases: ["sommeil", "sleep", "bedtime", "coucher avant 23 h", "bedtime before 23"], emoji: "💤", variableType: "boolean", unit: null, dayPeriod: "evening", captureMode: "automatic", automaticMetricId: "bedtime_before_23", trackingCadence: "daily", behaviour: "direct" },
  { key: "running", sourceHeader: "🏃‍♂️ Running", sourceLabel: "Running", canonicalName: "Running", aliases: ["running", "run", "course", "courir"], emoji: "🏃‍♂️", variableType: "boolean", unit: null, dayPeriod: "day", captureMode: "automatic", automaticMetricId: "run_day", trackingCadence: "weekly", behaviour: "direct" },
] as const;

export function journalSheetImportMetrics() {
  return sheetMetrics;
}

export function normalizeImportLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function importMetricForHeader(header: string | null | undefined) {
  if (!header) return null;
  const normalized = normalizeImportLabel(header);
  return sheetMetrics.find((metric) => [metric.sourceHeader, metric.sourceLabel, metric.canonicalName, ...metric.aliases].some((candidate) => normalizeImportLabel(candidate) === normalized)) ?? null;
}

function sourceValueForMetric(metric: JournalSheetImportMetric, raw: 0 | 1 | null): JournalEntryValue | null {
  if (raw === null || metric.behaviour === "whm_presence") return null;
  if (metric.behaviour === "breakfast_skipped") return raw === 0;
  return raw === 1;
}

function matchingVariable(metric: JournalSheetImportMetric, variables: readonly JournalVariable[]) {
  const names = new Set([metric.canonicalName, metric.sourceLabel, ...metric.aliases].map(normalizeImportLabel));
  return variables.find((variable) => (
    metric.automaticMetricId !== null && variable.automaticMetricId === metric.automaticMetricId
  ) || names.has(normalizeImportLabel(variable.name))) ?? null;
}

export type JournalImportMetricPlan = {
  key: string;
  sourceHeader: string;
  sourceLabel: string;
  target: string | null;
  variableId: string | null;
  variableName: string;
  variableType: JournalVariableType;
  captureMode: "manual" | "automatic";
  trackingCadence: "daily" | "weekly";
  action: "existing" | "create" | "reactivate" | "canonical_only";
};

export type JournalImportCellPlan = {
  key: string;
  date: string;
  variableId: string | null;
  rawValue: 0 | 1 | null;
  normalizedValue: JournalEntryValue | null;
  action: "write" | "omit" | "unchanged" | "keep_soma" | "keep_soma_semantics" | "keep_soma_rounds" | "skip_automatic_blank" | "skip_source_precision" | "conflict";
  conflictKey?: string;
};

export type JournalImportConflict = {
  key: string;
  date: string;
  sourceHabitName: string;
  sourceValue: 0 | 1;
  normalizedSourceValue: JournalEntryValue;
  somaHabitName: string;
  somaValue: JournalEntryValue;
  somaUnit: string | null;
  reason: string;
};

export type JournalImportPlan = {
  metrics: JournalImportMetricPlan[];
  cells: JournalImportCellPlan[];
  conflicts: JournalImportConflict[];
  newVariables: JournalSheetImportMetric[];
  reactivateVariableIds: string[];
  unknownHeaders: string[];
  stats: {
    sourceRows: number;
    sourceCells: number;
    writeCells: number;
    omittedCells: number;
    unchangedCells: number;
    preservedSomaCells: number;
    skippedPrecisionCells: number;
    skippedAutomaticBlankCells: number;
    conflictCells: number;
  };
};

export function importedVariableForMetric(metric: JournalSheetImportMetric) {
  return {
    name: metric.canonicalName,
    variableType: metric.variableType,
    unit: metric.unit,
    options: [] as string[],
    position: 150,
    isActive: true,
    emoji: metric.emoji,
    defaultValue: null,
    dayPeriod: metric.dayPeriod,
    captureMode: metric.captureMode,
    automaticMetricId: metric.automaticMetricId,
    trackingCadence: metric.trackingCadence,
  };
}

export function planJournalImport(input: {
  source: JournalImportSource;
  variables: readonly JournalVariable[];
  entries: readonly JournalEntry[];
  resolutions?: JournalImportResolutionMap;
}): JournalImportPlan {
  const resolutions = input.resolutions ?? {};
  const columns = input.source.headers.slice(1).map((header, index) => ({ header, target: input.source.targets[index + 1] === null || input.source.targets[index + 1] === undefined ? null : String(input.source.targets[index + 1]), index, metric: importMetricForHeader(header) }));
  const unknownHeaders = columns.flatMap((column) => column.header && !column.metric ? [column.header] : []);
  const metricColumns = columns.flatMap((column) => column.metric ? [{ ...column, metric: column.metric }] : []);
  const metrics = metricColumns.map(({ metric, header, target }) => {
    const variable = matchingVariable(metric, input.variables);
    return {
      key: metric.key,
      sourceHeader: header ?? metric.sourceHeader,
      sourceLabel: metric.sourceLabel,
      target,
      variableId: variable?.id ?? null,
      variableName: variable?.name ?? metric.canonicalName,
      variableType: variable?.variableType ?? metric.variableType,
      captureMode: variable?.captureMode ?? metric.captureMode,
      trackingCadence: variable?.trackingCadence ?? metric.trackingCadence,
      action: metric.behaviour === "whm_presence" ? "canonical_only" : variable ? variable.isActive ? "existing" : "reactivate" : "create",
    } satisfies JournalImportMetricPlan;
  });
  const variableByMetric = new Map(metricColumns.map(({ metric }) => [metric.key, matchingVariable(metric, input.variables)]));
  const existingByDateAndVariable = new Map(input.entries.map((entry) => [`${entry.entryDate}:${entry.variableId}`, entry.value]));
  const conflicts: JournalImportConflict[] = [];
  const cells: JournalImportCellPlan[] = [];

  for (const row of input.source.rows) {
    for (const column of metricColumns) {
      const metric = column.metric;
      const variable = variableByMetric.get(metric.key);
      const rawValue = row.values[column.index] ?? null;
      const normalizedValue = sourceValueForMetric(metric, rawValue);
      const existingValue = variable ? existingByDateAndVariable.get(`${row.date}:${variable.id}`) : undefined;
      const hasExistingValue = existingValue !== undefined;
      const cell: JournalImportCellPlan = {
        key: metric.key,
        date: row.date,
        variableId: variable?.id ?? null,
        rawValue,
        normalizedValue,
        action: "unchanged",
      };

      if (metric.behaviour === "whm_presence") {
        cell.action = hasExistingValue ? "keep_soma_rounds" : "skip_source_precision";
      } else if (rawValue === null) {
        cell.action = hasExistingValue ? "keep_soma" : metric.captureMode === "automatic" ? "skip_automatic_blank" : "omit";
      } else if (!hasExistingValue) {
        cell.action = "write";
      } else if (metric.behaviour === "breakfast_skipped") {
        // The source uses 1 for "no breakfast" while Soma's boolean is the
        // more precise "light breakfast" value. Existing Soma wins without
        // manufacturing a user-facing conflict.
        cell.action = "keep_soma_semantics";
      } else if (existingValue === normalizedValue) {
        cell.action = "unchanged";
      } else {
        const conflictKey = `${row.date}:${metric.key}`;
        const conflict: JournalImportConflict = {
          key: conflictKey,
          date: row.date,
          sourceHabitName: metric.sourceLabel,
          sourceValue: rawValue,
          normalizedSourceValue: normalizedValue as JournalEntryValue,
          somaHabitName: variable?.name ?? metric.canonicalName,
          somaValue: existingValue as JournalEntryValue,
          somaUnit: variable?.unit ?? metric.unit,
          reason: "The same day and habit already have a different value in Soma.",
        };
        conflicts.push(conflict);
        cell.conflictKey = conflictKey;
        const resolution = resolutions[conflictKey];
        cell.action = resolution === "use_sheet" ? "write" : resolution === "keep_soma" ? "keep_soma" : "conflict";
      }
      cells.push(cell);
    }
  }

  const newVariables = metricColumns.flatMap(({ metric }) => {
    if (metric.behaviour === "whm_presence") return [];
    return matchingVariable(metric, input.variables) ? [] : [metric];
  });
  const reactivateVariableIds = metricColumns.flatMap(({ metric }) => {
    const variable = matchingVariable(metric, input.variables);
    return variable && !variable.isActive && metric.behaviour !== "whm_presence" ? [variable.id] : [];
  });
  const stats = {
    sourceRows: input.source.rows.length,
    sourceCells: cells.filter((cell) => cell.rawValue !== null).length,
    writeCells: cells.filter((cell) => cell.action === "write").length,
    omittedCells: cells.filter((cell) => cell.action === "omit").length,
    unchangedCells: cells.filter((cell) => cell.action === "unchanged").length,
    preservedSomaCells: cells.filter((cell) => ["keep_soma", "keep_soma_semantics", "keep_soma_rounds"].includes(cell.action)).length,
    skippedPrecisionCells: cells.filter((cell) => cell.action === "skip_source_precision").length,
    skippedAutomaticBlankCells: cells.filter((cell) => cell.action === "skip_automatic_blank").length,
    conflictCells: conflicts.length,
  };
  return { metrics, cells, conflicts, newVariables, reactivateVariableIds, unknownHeaders, stats };
}

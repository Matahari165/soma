import "server-only";

import {
  importedVariableForMetric,
  planJournalImport,
  type JournalImportPlan,
  type JournalImportResolutionMap,
  type JournalImportSource,
} from "@/domain/lab/journal-import";
import { claimCloudflareLock, createCloudflareAdminClient, releaseCloudflareLock, saveCloudflareJournalDay } from "@/lib/cloudflare/db";
import { loadJournalData } from "@/services/journal";

export class JournalImportConflictError extends Error {
  constructor(readonly plan: JournalImportPlan) {
    super("The journal import has unresolved conflicts.");
    this.name = "JournalImportConflictError";
  }
}

function sourceDateRange(source: JournalImportSource) {
  const dates = source.rows.map((row) => row.date).sort();
  return { from: dates[0] ?? null, to: dates.at(-1) ?? null };
}

async function loadImportState(userId: string, source: JournalImportSource) {
  const range = sourceDateRange(source);
  if (!range.from || !range.to) return { journal: { variables: [], entries: [], days: [] }, timeZone: "Europe/Paris" };
  const admin = createCloudflareAdminClient();
  const { data: profile } = await admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
  const journal = await loadJournalData(userId, {
    from: range.from,
    to: range.to,
    timeZone: typeof profile?.timezone === "string" ? profile.timezone : "Europe/Paris",
    includeAutomaticEntries: true,
    ensureDefaults: false,
  });
  return { journal, timeZone: typeof profile?.timezone === "string" ? profile.timezone : "Europe/Paris" };
}

function resolutionMap(resolutions: JournalImportResolutionMap | undefined) {
  return resolutions ?? {};
}

export async function previewJournalImport(userId: string, source: JournalImportSource, resolutions?: JournalImportResolutionMap) {
  const state = await loadImportState(userId, source);
  const plan = planJournalImport({
    source,
    variables: state.journal.variables,
    entries: state.journal.entries,
    resolutions: resolutionMap(resolutions),
  });
  return { plan, dateRange: sourceDateRange(source), timeZone: state.timeZone };
}

function importPlanForClient(plan: JournalImportPlan) {
  return {
    metrics: plan.metrics,
    conflicts: plan.conflicts,
    unknownHeaders: plan.unknownHeaders,
    newVariableNames: plan.newVariables.map((metric) => metric.canonicalName),
    reactivatedVariableIds: plan.reactivateVariableIds,
    stats: plan.stats,
  };
}

export function journalImportResponse(input: { plan: JournalImportPlan; dateRange: { from: string | null; to: string | null }; importedDates?: number; importId?: string }) {
  return {
    dateRange: input.dateRange,
    importedDates: input.importedDates ?? 0,
    importId: input.importId ?? null,
    ...importPlanForClient(input.plan),
  };
}

function resolutionMapFromPlanInput(resolutions: JournalImportResolutionMap | undefined) {
  return resolutions ?? {};
}

async function ensureImportVariables(userId: string, plan: JournalImportPlan) {
  const admin = createCloudflareAdminClient();
  if (plan.newVariables.length) {
    const rows = plan.newVariables.map((metric, index) => {
      const variable = importedVariableForMetric(metric);
      return {
        user_id: userId,
        name: variable.name,
        variable_type: variable.variableType,
        unit: variable.unit,
        options: variable.options,
        position: 150 + index,
        is_active: variable.isActive,
        emoji: variable.emoji,
        default_value: variable.defaultValue,
        day_period: variable.dayPeriod,
        capture_mode: variable.captureMode,
        automatic_metric_id: variable.automaticMetricId,
        tracking_cadence: variable.trackingCadence,
      };
    });
    const { error } = await admin.from("journal_variables").upsert(rows, { onConflict: "user_id,name", ignoreDuplicates: true });
    if (error) throw new Error("The new journal measures could not be created.");
  }
  for (const variableId of plan.reactivateVariableIds) {
    const { error } = await admin.from("journal_variables").update({ is_active: true }).eq("id", variableId).eq("user_id", userId);
    if (error) throw new Error("An archived journal measure could not be reactivated.");
  }
}

function entriesByDate(plan: JournalImportPlan) {
  const byDate = new Map<string, Array<{ variable_id: string; value: unknown }>>();
  for (const cell of plan.cells) {
    if (cell.action !== "write" && cell.action !== "omit") continue;
    if (!cell.variableId) throw new Error("A journal measure is missing during import.");
    const value = cell.action === "omit" ? null : cell.normalizedValue;
    if (value === null && cell.action === "write") throw new Error("An imported journal value could not be normalized.");
    const current = byDate.get(cell.date) ?? [];
    current.push({ variable_id: cell.variableId, value });
    byDate.set(cell.date, current);
  }
  return byDate;
}

export async function commitJournalImport(userId: string, source: JournalImportSource, resolutions?: JournalImportResolutionMap) {
  const lockKey = `journal-import:${userId}:${source.spreadsheetId}:${source.sheetName}`;
  const claimed = await claimCloudflareLock(lockKey, userId, 120_000);
  if (!claimed) throw new Error("Another journal import is already running.");

  const admin = createCloudflareAdminClient();
  const importId = crypto.randomUUID();
  const resolved = resolutionMapFromPlanInput(resolutions);
  try {
    let state = await loadImportState(userId, source);
    let plan = planJournalImport({ source, variables: state.journal.variables, entries: state.journal.entries, resolutions: resolved });
    if (plan.conflicts.some((conflict) => !resolved[conflict.key])) throw new JournalImportConflictError(plan);

    const { error: auditStartError } = await admin.from("journal_imports").insert({
      id: importId,
      user_id: userId,
      source_kind: "google_sheets",
      source_spreadsheet_id: source.spreadsheetId,
      source_sheet_name: source.sheetName,
      source_headers: source.headers,
      source_targets: source.targets,
      source_rows: source.rows,
      mapping: plan.metrics,
      conflict_resolutions: resolved,
      status: "started",
      statistics: plan.stats,
    });
    if (auditStartError) throw new Error("The source snapshot could not be saved.");

    try {
      await ensureImportVariables(userId, plan);
      state = await loadImportState(userId, source);
      plan = planJournalImport({ source, variables: state.journal.variables, entries: state.journal.entries, resolutions: resolved });
      if (plan.conflicts.some((conflict) => !resolved[conflict.key])) throw new JournalImportConflictError(plan);

      const byDate = entriesByDate(plan);
      for (const [entryDate, entries] of byDate) {
        await saveCloudflareJournalDay({ userId, entryDate, entries, validate: true, replaceOmissions: false });
      }
      const { error: auditCompleteError } = await admin.from("journal_imports").update({ status: "completed", statistics: { ...plan.stats, importedDates: byDate.size } }).eq("id", importId).eq("user_id", userId);
      if (auditCompleteError) throw new Error("The journal was imported, but its source snapshot could not be finalized.");
      return { plan, dateRange: sourceDateRange(source), importedDates: byDate.size, importId };
    } catch (error) {
      await admin.from("journal_imports").update({ status: "failed", error_message: error instanceof Error ? error.message : "Import failed." }).eq("id", importId).eq("user_id", userId);
      throw error;
    }
  } finally {
    await releaseCloudflareLock(lockKey, userId).catch(() => undefined);
  }
}

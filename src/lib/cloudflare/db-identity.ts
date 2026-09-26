import type { D1DatabaseLike, D1PreparedStatement, Row } from "./db-types";

const conflictKeys: Record<string, string[]> = {
  profiles: ["user_id"],
  sleep_preferences: ["user_id"],
  dashboard_layouts: ["user_id"],
  provider_connections: ["user_id", "provider"],
  sync_jobs: ["connection_id", "idempotency_key"],
  soma_credentials: ["email"],
  webhook_events: ["deduplication_key"],
  ingestion_checkpoints: ["user_id", "provider", "data_type"],
  health_records: ["user_id", "provider", "data_type", "source_record_id"],
  google_health_reconciliation_stage: ["job_id", "reconciliation_token", "source_record_id"],
  daily_health_metrics: ["user_id", "metric_date"],
  daily_scores: ["user_id", "score_date", "kind"],
  insights: ["user_id", "deduplication_key"],
  correlation_results: ["user_id", "variable_x", "variable_y", "lag_days", "date_start", "date_end"],
  briefs: ["user_id", "kind", "brief_date"],
  journal_variables: ["user_id", "name"],
  journal_entries: ["user_id", "variable_id", "entry_date"],
  lab_narratives: ["user_id"],
  lab_narrative_history: ["user_id", "analysis_date"],
  lab_relation_snapshots: ["user_id", "analysis_date", "period", "method_version"],
  journal_imports: ["id"],
  journal_days: ["user_id", "entry_date"],
  lab_metric_preferences: ["user_id", "metric_id"],
  daily_calendar_metrics: ["user_id", "metric_date"],
  daily_checkins: ["user_id", "checkin_date"],
  health_record_archives: ["user_id", "provider", "data_type", "range_start", "range_end"],
  // Meal rows are constrained by calendar slot. Updates and deletes must use
  // that same physical key instead of the generated row id.
  meals: ["user_id", "meal_date", "meal_type"],
  meal_photos: ["user_id", "id"],
  meal_analyses: ["user_id", "id"],
  meal_feelings: ["user_id", "meal_id"],
};

export const labMatrixRevisionTables = [
  "profiles",
  "daily_health_metrics",
  "daily_scores",
  "daily_calendar_metrics",
  "daily_checkins",
  "meals",
  "meal_photos",
  "meal_analyses",
  "meal_feelings",
  "journal_variables",
  "journal_entries",
  "journal_days",
  "lab_metric_preferences",
  "nutrition_targets",
] as const;

const labMatrixRevisionTableSet = new Set<string>(labMatrixRevisionTables);
export const LAB_MATRIX_REVISION_TABLE = "lab_matrix_revisions";

export function affectsLabMatrixRevision(table: string) {
  return labMatrixRevisionTableSet.has(table);
}

export function nextSupabaseLabMatrixRevision() {
  return crypto.randomUUID();
}

export function labMatrixRevisionStatement(db: D1DatabaseLike, userId: string): D1PreparedStatement {
  const now = new Date().toISOString();
  const row = { user_id: userId, revision: 1, updated_at: now };
  return db.prepare(`
    INSERT INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(table_name, row_key) DO UPDATE SET
      user_id = excluded.user_id,
      json_data = json_set(
        excluded.json_data,
        '$.revision',
        COALESCE(CAST(json_extract(soma_rows.json_data, '$.revision') AS INTEGER), 0) + 1
      ),
      updated_at = excluded.updated_at
  `).bind(LAB_MATRIX_REVISION_TABLE, userId, userId, JSON.stringify(row), now, now);
}

export function stableIdentity(table: string, row: Row, explicitConflict?: string) {
  const keys = explicitConflict?.split(",").map((key) => key.trim()).filter(Boolean)
    ?? conflictKeys[table]
    ?? (row.id ? ["id"] : []);
  const identity = keys.length && keys.every((key) => row[key] !== undefined)
    ? keys.map((key) => [key, row[key]])
    : [["id", row.id ?? crypto.randomUUID()]];
  return encodeURIComponent(JSON.stringify(identity));
}

export function cleanRow(row: Row) {
  return JSON.parse(JSON.stringify(row)) as Row;
}

export function withDefaults(row: Row) {
  const now = new Date().toISOString();
  return cleanRow({
    ...row,
    id: row.id ?? crypto.randomUUID(),
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  });
}

import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any -- This compatibility layer deliberately mirrors Supabase's dynamic query API. */

import { getCloudflareContext } from "@opennextjs/cloudflare";

type Row = any;
type CloudflareError = { message: string; code?: string; details?: string; hint?: string };
type QueryResult<T> = { data: T; error: CloudflareError | null; count?: number | null };
type ManyResult = QueryResult<any[] | null>;
type SingleResult = QueryResult<any | null>;
type Filter = {
  field: string;
  operator: "eq" | "neq" | "in" | "is" | "gte" | "gt" | "lte" | "lt" | "contains" | "not";
  value: any;
  secondaryOperator?: string;
};
type Sort = { field: string; ascending: boolean };
type Mutation =
  | { kind: "insert"; values: Row[] }
  | { kind: "upsert"; values: Row[]; onConflict?: string; ignoreDuplicates?: boolean }
  | { kind: "update"; values: Row }
  | { kind: "delete" };

type ReadPlan = { sql: string; bindings: unknown[]; paginationPushed: boolean };

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Row>(): Promise<{ results?: T[]; success: boolean; error?: string }>;
  first<T = Row>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
};

type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
};

type R2ObjectLike = { arrayBuffer(): Promise<ArrayBuffer>; body: ReadableStream | null };
type R2BucketLike = {
  get(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView | string | ReadableStream, options?: Record<string, unknown>): Promise<unknown>;
  delete(key: string): Promise<void>;
};

export type SomaCloudflareEnv = {
  SOMA_DB: D1DatabaseLike;
  SOMA_ARCHIVES: R2BucketLike;
  [key: string]: unknown;
};

const conflictKeys: Record<string, string[]> = {
  profiles: ["user_id"],
  sleep_preferences: ["user_id"],
  dashboard_layouts: ["user_id"],
  provider_connections: ["user_id", "provider"],
  webhook_events: ["deduplication_key"],
  ingestion_checkpoints: ["user_id", "provider", "data_type"],
  health_records: ["user_id", "provider", "data_type", "source_record_id"],
  daily_health_metrics: ["user_id", "metric_date"],
  daily_scores: ["user_id", "score_date", "kind"],
  insights: ["user_id", "deduplication_key"],
  correlation_results: ["user_id", "variable_x", "variable_y", "lag_days", "date_start", "date_end"],
  briefs: ["user_id", "kind", "brief_date"],
  agent_action_proposals: ["user_id", "idempotency_key"],
  journal_variables: ["user_id", "name"],
  journal_entries: ["user_id", "variable_id", "entry_date"],
  lab_narratives: ["user_id"],
  lab_narrative_history: ["user_id", "analysis_date"],
  journal_days: ["user_id", "entry_date"],
  lab_metric_preferences: ["user_id", "metric_id"],
  daily_calendar_metrics: ["user_id", "metric_date"],
  daily_checkins: ["user_id", "checkin_date"],
  health_record_archives: ["user_id", "provider", "data_type", "range_start", "range_end"],
};

export function cloudflareEnv() {
  return getCloudflareContext().env as unknown as SomaCloudflareEnv;
}

export function cloudflareDb() {
  const database = cloudflareEnv().SOMA_DB;
  if (!database) throw new Error("The SOMA_DB binding is not configured.");
  return database;
}

export function cloudflareArchives() {
  const bucket = cloudflareEnv().SOMA_ARCHIVES;
  if (!bucket) throw new Error("The SOMA_ARCHIVES binding is not configured.");
  return bucket;
}

export async function claimCloudflareLock(lockKey: string, userId: string, ttlMs = 60_000) {
  const db = cloudflareDb();
  const now = Date.now();
  await db.prepare("DELETE FROM soma_rows WHERE table_name = ? AND row_key = ? AND CAST(json_extract(json_data, '$.expires_at_ms') AS INTEGER) < ?")
    .bind("operation_locks", lockKey, now).run();
  const row = { user_id: userId, expires_at_ms: now + ttlMs };
  const result = await db.prepare("INSERT OR IGNORE INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind("operation_locks", lockKey, userId, JSON.stringify(row), new Date(now).toISOString(), new Date(now).toISOString()).run();
  if (!result.success) throw new Error(result.error ?? "The operation lock could not be acquired.");
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function releaseCloudflareLock(lockKey: string, userId: string) {
  const result = await cloudflareDb().prepare("DELETE FROM soma_rows WHERE table_name = ? AND row_key = ? AND user_id = ?")
    .bind("operation_locks", lockKey, userId).run();
  if (!result.success) throw new Error(result.error ?? "The operation lock could not be released.");
}

export async function latestHealthRecordsByType(userId: string, dataTypes: readonly string[]) {
  if (!dataTypes.length) return [] as Array<{ data_type: string; civil_date: string | null; measured_at: string | null }>;
  const placeholders = dataTypes.map(() => "?").join(", ");
  const statement = cloudflareDb().prepare(`
    WITH ranked AS (
      SELECT
        json_extract(json_data, '$.data_type') AS data_type,
        json_extract(json_data, '$.civil_date') AS civil_date,
        json_extract(json_data, '$.measured_at') AS measured_at,
        ROW_NUMBER() OVER (
          PARTITION BY json_extract(json_data, '$.data_type')
          ORDER BY
            json_extract(json_data, '$.civil_date') IS NULL,
            json_extract(json_data, '$.civil_date') DESC,
            json_extract(json_data, '$.measured_at') IS NULL,
            json_extract(json_data, '$.measured_at') DESC
        ) AS position
      FROM soma_rows
      WHERE table_name = 'health_records'
        AND user_id = ?
        AND json_extract(json_data, '$.data_type') IN (${placeholders})
    )
    SELECT data_type, civil_date, measured_at
    FROM ranked
    WHERE position = 1
  `).bind(userId, ...dataTypes);
  const result = await statement.all<{ data_type: string; civil_date: string | null; measured_at: string | null }>();
  if (!result.success) throw new Error(result.error ?? "Latest health records could not be loaded from D1.");
  return result.results ?? [];
}

export async function healthSyncDiagnostics(userId: string, dataTypes: readonly string[]) {
  const healthResult = await cloudflareDb().prepare(`
    SELECT
      json_extract(json_data, '$.data_type') AS data_type,
      COUNT(*) AS record_count,
      SUM(CASE WHEN json_extract(json_data, '$.civil_date') IS NOT NULL THEN 1 ELSE 0 END) AS dated_count
    FROM soma_rows
    WHERE table_name = 'health_records'
      AND user_id = ?
    GROUP BY json_extract(json_data, '$.data_type')
  `).bind(userId).all<{ data_type: string; record_count: number; dated_count: number }>();
  if (!healthResult.success) throw new Error(healthResult.error ?? "Health record diagnostics could not be loaded from D1.");

  const analyticsResult = await cloudflareDb().prepare(`
    SELECT table_name, COUNT(*) AS row_count
    FROM soma_rows
    WHERE user_id = ?
      AND table_name IN ('daily_health_metrics', 'daily_scores')
    GROUP BY table_name
  `).bind(userId).all<{ table_name: string; row_count: number }>();
  if (!analyticsResult.success) throw new Error(analyticsResult.error ?? "Health analytics diagnostics could not be loaded from D1.");

  const healthRows = healthResult.results ?? [];
  const analyticsRows = new Map((analyticsResult.results ?? []).map((row) => [row.table_name, Number(row.row_count)]));
  const recordCounts = new Map(healthRows.map((row) => [row.data_type, Number(row.record_count)]));
  return {
    importedRecords: Object.fromEntries(dataTypes.map((dataType) => [dataType, recordCounts.get(dataType) ?? 0])),
    analytics: {
      datedRecords: healthRows.reduce((total, row) => total + Number(row.dated_count), 0),
      metricDays: analyticsRows.get("daily_health_metrics") ?? 0,
      scoreRows: analyticsRows.get("daily_scores") ?? 0,
    },
  };
}

export async function healthRecordsForAnalysis(userId: string, dataTypes: readonly string[], analysisStart: string) {
  if (!dataTypes.length) return [];
  const placeholders = dataTypes.map(() => "?").join(", ");
  const analysisStartTime = `${analysisStart}T00:00:00.000Z`;
  const result = await cloudflareDb().prepare(`
    SELECT json_data
    FROM soma_rows
    WHERE table_name = 'health_records'
      AND user_id = ?
      AND json_extract(json_data, '$.data_type') IN (${placeholders})
      AND (
        json_extract(json_data, '$.civil_date') >= ?
        OR json_extract(json_data, '$.end_time') >= ?
        OR json_extract(json_data, '$.start_time') >= ?
        OR json_extract(json_data, '$.measured_at') >= ?
      )
    ORDER BY json_extract(json_data, '$.id')
  `).bind(userId, ...dataTypes, analysisStart, analysisStartTime, analysisStartTime, analysisStartTime)
    .all<{ json_data: string }>();
  if (!result.success) throw new Error(result.error ?? "Health analysis records could not be loaded from D1.");
  return (result.results ?? []).map((row) => JSON.parse(row.json_data) as Row);
}

const labMatrixRevisionTables = [
  "profiles",
  "daily_health_metrics",
  "daily_scores",
  "daily_calendar_metrics",
  "daily_checkins",
  "journal_variables",
  "lab_metric_preferences",
] as const;

export type LabMatrixRevisionRow = { table_name: string; row_count: number; latest_update: string | null };

export function serializeLabMatrixRevision(rows: readonly LabMatrixRevisionRow[]) {
  return [...rows]
    .sort((first, second) => first.table_name.localeCompare(second.table_name))
    .map((row) => `${row.table_name}:${Number(row.row_count)}:${row.latest_update ?? ""}`)
    .join("|");
}

export async function labMatrixInputRevision(userId: string) {
  const db = cloudflareDb();
  const placeholders = labMatrixRevisionTables.map(() => "?").join(", ");
  const [baseResult, validatedJournalResult] = await Promise.all([
    db.prepare(`
      SELECT table_name, COUNT(*) AS row_count, MAX(COALESCE(updated_at, created_at, '')) AS latest_update
      FROM soma_rows
      WHERE user_id = ? AND table_name IN (${placeholders})
      GROUP BY table_name
    `).bind(userId, ...labMatrixRevisionTables).all<LabMatrixRevisionRow>(),
    db.prepare(`
      SELECT
        'validated_journal_days' AS table_name,
        COUNT(*) AS row_count,
        MAX(COALESCE(updated_at, created_at, '')) AS latest_update
      FROM soma_rows
      WHERE table_name = 'journal_days'
        AND user_id = ?
        AND json_extract(json_data, '$.status') = 'validated'
    `).bind(userId).all<LabMatrixRevisionRow>(),
  ]);
  if (!baseResult.success) throw new Error(baseResult.error ?? "Lab matrix revision could not be loaded from D1.");
  if (!validatedJournalResult.success) throw new Error(validatedJournalResult.error ?? "Validated journal revision could not be loaded from D1.");
  return serializeLabMatrixRevision([...(baseResult.results ?? []), ...(validatedJournalResult.results ?? [])]);
}

function stableIdentity(table: string, row: Row, explicitConflict?: string) {
  const keys = explicitConflict?.split(",").map((key) => key.trim()).filter(Boolean)
    ?? conflictKeys[table]
    ?? (row.id ? ["id"] : []);
  const identity = keys.length && keys.every((key) => row[key] !== undefined)
    ? keys.map((key) => [key, row[key]])
    : [["id", row.id ?? crypto.randomUUID()]];
  return encodeURIComponent(JSON.stringify(identity));
}

function topLevelColumns(selector: string | undefined) {
  if (!selector || selector.trim() === "*") return null;
  const columns: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of selector) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      columns.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) columns.push(current.trim());
  return columns.map((column) => column.includes("(") ? column.slice(0, column.indexOf("(")).trim() : column.split(":").at(-1) as string);
}

function projectRow(row: Row, selector: string | undefined) {
  const columns = topLevelColumns(selector);
  if (!columns) return row;
  // PostgreSQL columns selected through Supabase are returned as null when a
  // row has no value. Preserve that contract for sparse JSON rows in D1 so
  // consumers never mistake a missing measurement for a number (or for zero).
  return Object.fromEntries(columns.map((column) => [column, row[column] === undefined ? null : row[column]]));
}

function valueAt(row: Row, field: string) {
  return field.split(".").reduce<any>((value, key) => value?.[key], row);
}

function matches(row: Row, filter: Filter): boolean {
  const actual = valueAt(row, filter.field);
  switch (filter.operator) {
    case "eq": return actual === filter.value;
    case "neq": return actual !== filter.value;
    case "in": return Array.isArray(filter.value) && filter.value.includes(actual);
    case "is": return filter.value === null ? actual == null : actual === filter.value;
    case "gte": return actual >= filter.value;
    case "gt": return actual > filter.value;
    case "lte": return actual <= filter.value;
    case "lt": return actual < filter.value;
    case "contains": return Array.isArray(actual) && filter.value.every((item: any) => actual.includes(item));
    case "not": return !matches(row, { field: filter.field, operator: filter.secondaryOperator as Filter["operator"], value: filter.value });
  }
}

function parseOrExpression(expression: string) {
  return expression.split(",").map((part) => {
    const [field, operator, ...raw] = part.split(".");
    const joined = raw.join(".");
    const value: string | null = joined === "null" ? null : joined;
    return { field, operator, value };
  });
}

function matchesOr(row: Row, expressions: ReturnType<typeof parseOrExpression>) {
  return expressions.some(({ field, operator, value }) => {
    const actual = valueAt(row, field);
    if (operator === "eq") return actual === value;
    if (operator === "gte") return value !== null && actual >= value;
    if (operator === "gt") return value !== null && actual > value;
    if (operator === "lte") return value !== null && actual <= value;
    if (operator === "lt") return value !== null && actual < value;
    if (operator === "is") return value === null ? actual == null : actual === value;
    return false;
  });
}

function safeJsonPath(field: string) {
  return /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(field) ? `$.${field}` : null;
}

function d1Value(value: any) {
  return typeof value === "boolean" ? Number(value) : value;
}

export function buildCloudflareReadPlan({
  table,
  filters,
  orFilterCount,
  sorts,
  fromIndex,
  toIndex,
  maxRows,
}: {
  table: string;
  filters: Filter[];
  orFilterCount: number;
  sorts: Sort[];
  fromIndex: number;
  toIndex?: number;
  maxRows?: number;
}): ReadPlan {
  const where = ["table_name = ?"];
  const bindings: unknown[] = [table];
  let allFiltersPushed = true;

  for (const filter of filters) {
    const isUserId = filter.field === "user_id";
    const path = safeJsonPath(filter.field);
    const expression = isUserId ? "user_id" : path ? `json_extract(json_data, '${path}')` : null;
    if (!expression || filter.operator === "contains" || filter.operator === "not" || filter.operator === "neq") {
      allFiltersPushed = false;
      continue;
    }
    if (filter.value === null && filter.operator !== "is") {
      allFiltersPushed = false;
      continue;
    }
    if (filter.operator === "is" && filter.value === null) {
      where.push(`${expression} IS NULL`);
      continue;
    }
    if (filter.operator === "in") {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        where.push("0 = 1");
        continue;
      }
      where.push(`${expression} IN (${filter.value.map(() => "?").join(", ")})`);
      bindings.push(...filter.value.map(d1Value));
      continue;
    }
    const operator = { eq: "=", neq: "!=", is: "IS", gte: ">=", gt: ">", lte: "<=", lt: "<" }[filter.operator];
    if (!operator) {
      allFiltersPushed = false;
      continue;
    }
    where.push(`${expression} ${operator} ?`);
    bindings.push(d1Value(filter.value));
  }

  let sql = `SELECT json_data FROM soma_rows WHERE ${where.join(" AND ")}`;
  const order = sorts.flatMap((sort) => {
    const path = safeJsonPath(sort.field);
    if (!path) return [];
    const expression = `json_extract(json_data, '${path}')`;
    return [`${expression} IS NULL ${sort.ascending ? "ASC" : "DESC"}`, `${expression} ${sort.ascending ? "ASC" : "DESC"}`];
  });
  const allSortsPushed = order.length === sorts.length * 2;
  if (allSortsPushed && order.length) sql += ` ORDER BY ${order.join(", ")}`;

  const paginationPushed = allFiltersPushed && allSortsPushed && orFilterCount === 0;
  if (paginationPushed) {
    const rangeSize = toIndex === undefined ? undefined : Math.max(0, toIndex - fromIndex + 1);
    const limit = rangeSize === undefined ? maxRows : maxRows === undefined ? rangeSize : Math.min(rangeSize, maxRows);
    if (limit !== undefined) {
      sql += " LIMIT ? OFFSET ?";
      bindings.push(Math.max(0, limit), Math.max(0, fromIndex));
    } else if (fromIndex > 0) {
      sql += " LIMIT -1 OFFSET ?";
      bindings.push(fromIndex);
    }
  }

  return { sql, bindings, paginationPushed };
}

function cleanRow(row: Row) {
  return JSON.parse(JSON.stringify(row)) as Row;
}

function withDefaults(row: Row) {
  const now = new Date().toISOString();
  return cleanRow({
    ...row,
    id: row.id ?? crypto.randomUUID(),
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  });
}

async function writeRows(table: string, rows: Row[], explicitConflict?: string, ignoreDuplicates = false) {
  const db = cloudflareDb();
  const statements = rows.map((row) => {
    const rowKey = stableIdentity(table, row, explicitConflict);
    const sql = ignoreDuplicates
      ? "INSERT OR IGNORE INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      : "INSERT INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(table_name, row_key) DO UPDATE SET user_id = excluded.user_id, json_data = excluded.json_data, updated_at = excluded.updated_at";
    return db.prepare(sql).bind(table, rowKey, row.user_id ?? null, JSON.stringify(row), row.created_at ?? null, row.updated_at ?? null);
  });
  for (let index = 0; index < statements.length; index += 40) await db.batch(statements.slice(index, index + 40));
}

class CloudflareQueryBuilder implements PromiseLike<ManyResult> {
  private selector: string | undefined;
  private selectOptions: { count?: "exact"; head?: boolean } | undefined;
  private filters: Filter[] = [];
  private orFilters: Array<ReturnType<typeof parseOrExpression>> = [];
  private sorts: Sort[] = [];
  private maxRows: number | undefined;
  private fromIndex = 0;
  private toIndex: number | undefined;
  private cardinality: "many" | "single" | "maybeSingle" = "many";
  private mutation: Mutation | undefined;

  constructor(private table: string) {}

  select(selector = "*", options?: { count?: "exact"; head?: boolean }) { this.selector = selector; this.selectOptions = options; return this; }
  insert(values: Row | Row[]) { this.mutation = { kind: "insert", values: Array.isArray(values) ? values : [values] }; return this; }
  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.mutation = { kind: "upsert", values: Array.isArray(values) ? values : [values], onConflict: options?.onConflict, ignoreDuplicates: options?.ignoreDuplicates };
    return this;
  }
  update(values: Row) { this.mutation = { kind: "update", values }; return this; }
  delete() { this.mutation = { kind: "delete" }; return this; }
  eq(field: string, value: any) { this.filters.push({ field, operator: "eq", value }); return this; }
  neq(field: string, value: any) { this.filters.push({ field, operator: "neq", value }); return this; }
  in(field: string, value: any[]) { this.filters.push({ field, operator: "in", value }); return this; }
  is(field: string, value: any) { this.filters.push({ field, operator: "is", value }); return this; }
  gte(field: string, value: any) { this.filters.push({ field, operator: "gte", value }); return this; }
  gt(field: string, value: any) { this.filters.push({ field, operator: "gt", value }); return this; }
  lte(field: string, value: any) { this.filters.push({ field, operator: "lte", value }); return this; }
  lt(field: string, value: any) { this.filters.push({ field, operator: "lt", value }); return this; }
  contains(field: string, value: any[]) { this.filters.push({ field, operator: "contains", value }); return this; }
  not(field: string, operator: string, value: any) { this.filters.push({ field, operator: "not", secondaryOperator: operator, value }); return this; }
  or(expression: string) { this.orFilters.push(parseOrExpression(expression)); return this; }
  order(field: string, options?: { ascending?: boolean; nullsFirst?: boolean }) { this.sorts.push({ field, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.maxRows = value; return this; }
  range(from: number, to: number) { this.fromIndex = from; this.toIndex = to; return this; }
  single() { this.cardinality = "single"; return this as unknown as PromiseLike<SingleResult>; }
  maybeSingle() { this.cardinality = "maybeSingle"; return this as unknown as PromiseLike<SingleResult>; }

  private async readRows() {
    const db = cloudflareDb();
    const plan = buildCloudflareReadPlan({
      table: this.table,
      filters: this.filters,
      orFilterCount: this.orFilters.length,
      sorts: this.sorts,
      fromIndex: this.fromIndex,
      toIndex: this.toIndex,
      maxRows: this.maxRows,
    });
    const query = db.prepare(plan.sql).bind(...plan.bindings);
    const result = await query.all<{ json_data: string }>();
    if (!result.success) throw new Error(result.error ?? "D1 read failed.");
    let rows = (result.results ?? []).map((item) => JSON.parse(item.json_data) as Row);
    rows = rows.filter((row) => this.filters.every((filter) => matches(row, filter)));
    rows = rows.filter((row) => this.orFilters.every((expressions) => matchesOr(row, expressions)));
    for (const sort of [...this.sorts].reverse()) {
      rows.sort((left, right) => {
        const a = valueAt(left, sort.field);
        const b = valueAt(right, sort.field);
        const compared = a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0;
        return sort.ascending ? compared : -compared;
      });
    }
    if (!plan.paginationPushed) {
      if (this.toIndex !== undefined) rows = rows.slice(this.fromIndex, this.toIndex + 1);
      else if (this.fromIndex) rows = rows.slice(this.fromIndex);
      if (this.maxRows !== undefined) rows = rows.slice(0, this.maxRows);
    }
    if (this.table === "workout_programs" && this.selector?.includes("workout_program_exercises(")) {
      const [exerciseRows, libraryRows] = await Promise.all([
        db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ?").bind("workout_program_exercises").all<{ json_data: string }>(),
        db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ?").bind("exercise_library").all<{ json_data: string }>(),
      ]);
      const exercises = (exerciseRows.results ?? []).map((item) => JSON.parse(item.json_data) as Row);
      const library = new Map((libraryRows.results ?? []).map((item) => {
        const parsed = JSON.parse(item.json_data) as Row;
        return [parsed.id, parsed];
      }));
      rows = rows.map((row) => ({
        ...row,
        workout_program_exercises: exercises
          .filter((exercise) => exercise.program_id === row.id)
          .sort((left, right) => Number(left.position) - Number(right.position))
          .map((exercise) => ({ ...exercise, exercise_library: library.get(exercise.exercise_id) ?? null })),
      }));
    }
    return rows;
  }

  private shape(rows: Row[], totalCount?: number): QueryResult<any> {
    const projected = rows.map((row) => projectRow(row, this.selector));
    const count = this.selectOptions?.count ? (totalCount ?? rows.length) : undefined;
    if (this.selectOptions?.head) return { data: null, error: null, count };
    if (this.cardinality === "single") {
      if (projected.length !== 1) return { data: null, error: { message: "Expected exactly one row.", code: "PGRST116" }, count };
      return { data: projected[0], error: null, count };
    }
    if (this.cardinality === "maybeSingle") {
      if (projected.length > 1) return { data: null, error: { message: "Expected at most one row.", code: "PGRST116" }, count };
      return { data: projected[0] ?? null, error: null, count };
    }
    return { data: projected, error: null, count };
  }

  private async executeMutation() {
    if (!this.mutation) return this.shape(await this.readRows());
    if (this.mutation.kind === "insert" || this.mutation.kind === "upsert") {
      const mutation = this.mutation;
      const rows = mutation.values.map(withDefaults);
      await writeRows(this.table, rows, mutation.kind === "upsert" ? mutation.onConflict : undefined, mutation.kind === "upsert" && mutation.ignoreDuplicates);
      return this.shape(rows);
    }
    const existing = await this.readRows();
    if (this.mutation.kind === "delete") {
      const db = cloudflareDb();
      const statements = existing.map((row) => db.prepare("DELETE FROM soma_rows WHERE table_name = ? AND row_key = ?").bind(this.table, stableIdentity(this.table, row)));
      for (let index = 0; index < statements.length; index += 40) await db.batch(statements.slice(index, index + 40));
      return this.shape(existing);
    }
    const values = this.mutation.values;
    const changed = existing.map((row) => cleanRow({ ...row, ...values, updated_at: new Date().toISOString() }));
    await writeRows(this.table, changed);
    return this.shape(changed);
  }

  private async execute(): Promise<QueryResult<any>> {
    try {
      return await this.executeMutation();
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Cloudflare D1 operation failed." } };
    }
  }

  then<TResult1 = ManyResult, TResult2 = never>(
    onfulfilled?: ((value: ManyResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected) as PromiseLike<TResult1 | TResult2>;
  }
}

export function createCloudflareAdminClient() {
  return {
    from(table: string) { return new CloudflareQueryBuilder(table); },
    async rpc(name: string, parameters: Row) {
      const { executeCloudflareRpc } = await import("@/lib/cloudflare/rpc");
      return executeCloudflareRpc(name, parameters);
    },
    auth: {
      admin: {
        async deleteUser(userId: string) {
          try {
            const db = cloudflareDb();
            await db.batch([
              db.prepare("DELETE FROM soma_sessions WHERE user_id = ?").bind(userId),
              db.prepare("DELETE FROM soma_users WHERE id = ?").bind(userId),
              db.prepare("DELETE FROM soma_rows WHERE user_id = ?").bind(userId),
            ]);
            return { data: null, error: null };
          } catch (error) {
            return { data: null, error: { message: error instanceof Error ? error.message : "Account deletion failed." } };
          }
        },
      },
    },
  };
}

export type CloudflareAdminClient = ReturnType<typeof createCloudflareAdminClient>;

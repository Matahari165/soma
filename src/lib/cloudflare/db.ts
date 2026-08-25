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
    const userFilter = this.filters.find((filter) => filter.field === "user_id" && filter.operator === "eq");
    const query = userFilter
      ? db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ? AND user_id = ?").bind(this.table, userFilter.value)
      : db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ?").bind(this.table);
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
    if (this.toIndex !== undefined) rows = rows.slice(this.fromIndex, this.toIndex + 1);
    else if (this.fromIndex) rows = rows.slice(this.fromIndex);
    if (this.maxRows !== undefined) rows = rows.slice(0, this.maxRows);
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

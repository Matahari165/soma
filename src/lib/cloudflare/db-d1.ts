import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any -- The compatibility layer mirrors Supabase's dynamic query API. */

import { affectsLabMatrixRevision, labMatrixRevisionStatement, stableIdentity, withDefaults, cleanRow } from "./db-identity";
import {
  buildCloudflareReadPlan,
  buildCloudflareUpdatePlan,
  matches,
  matchesOr,
  paginateRows,
  parseOrExpression,
  queryError,
  shapeQueryResult,
  sortRows,
} from "./db-query";
import type {
  D1BatchResult,
  D1DatabaseLike,
  Filter,
  ManyResult,
  Mutation,
  QueryBuilderDependencies,
  QueryResult,
  Row,
  SelectOptions,
  SingleResult,
  Sort,
} from "./db-types";

async function writeRows(db: D1DatabaseLike, table: string, rows: Row[], explicitConflict?: string, ignoreDuplicates = false) {
  const statements = rows.map((row) => {
    const rowKey = stableIdentity(table, row, explicitConflict);
    const sql = ignoreDuplicates
      ? "INSERT OR IGNORE INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      : "INSERT INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(table_name, row_key) DO UPDATE SET user_id = excluded.user_id, json_data = excluded.json_data, updated_at = excluded.updated_at";
    return db.prepare(sql).bind(table, rowKey, row.user_id ?? null, JSON.stringify(row), row.created_at ?? null, row.updated_at ?? null);
  });
  for (let index = 0; index < statements.length; index += 35) {
    const rowSlice = rows.slice(index, index + 35);
    const revisionUserIds = affectsLabMatrixRevision(table)
      ? [...new Set(rowSlice.flatMap((row) => typeof row.user_id === "string" ? [row.user_id] : []))]
      : [];
    const results = await db.batch<D1BatchResult>([
      ...statements.slice(index, index + 35),
      ...revisionUserIds.map((userId) => labMatrixRevisionStatement(db, userId)),
    ]);
    assertBatchSucceeded(results, "Cloudflare D1 write failed.");
  }
}

async function updateRowsInPlace(db: D1DatabaseLike, table: string, existing: Row[], changed: Row[], conditions: Filter[] = []) {
  const persisted: Row[] = [];
  for (let index = 0; index < changed.length; index += 30) {
    const existingSlice = existing.slice(index, index + 30);
    const changedSlice = changed.slice(index, index + 30);
    const revisionUserIds = affectsLabMatrixRevision(table)
      ? [...new Set(changedSlice.flatMap((row) => typeof row.user_id === "string" ? [row.user_id] : []))]
      : [];
    const statements = changedSlice.map((row, rowIndex) => {
      const plan = buildCloudflareUpdatePlan(table, existingSlice[rowIndex], row, conditions);
      return db.prepare(plan.sql).bind(...plan.bindings);
    });
    const results = await db.batch<D1BatchResult>([
      ...statements,
      ...revisionUserIds.map((userId) => labMatrixRevisionStatement(db, userId)),
    ]);
    assertBatchSucceeded(results, "Cloudflare D1 update failed.");
    changedSlice.forEach((row, rowIndex) => {
      if (results[rowIndex]?.meta?.changes !== 0) persisted.push(row);
    });
  }
  return persisted;
}

function assertBatchSucceeded(results: D1BatchResult[], fallback: string) {
  const failed = results.find((result) => result?.success === false);
  if (failed) throw new Error(failed.error ?? fallback);
}

export class CloudflareQueryBuilder implements PromiseLike<ManyResult> {
  private selector: string | undefined;
  private selectOptions: SelectOptions | undefined;
  private filters: Filter[] = [];
  private orFilters: Array<ReturnType<typeof parseOrExpression>> = [];
  private sorts: Sort[] = [];
  private maxRows: number | undefined;
  private fromIndex = 0;
  private toIndex: number | undefined;
  private cardinality: "many" | "single" | "maybeSingle" = "many";
  private mutation: Mutation | undefined;

  constructor(private readonly db: D1DatabaseLike, private readonly table: string) {}

  select(selector = "*", options?: SelectOptions) { this.selector = selector; this.selectOptions = options; return this; }
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
  withTimeout(timeoutMs: number) { void timeoutMs; return this; }
  single() { this.cardinality = "single"; return this as unknown as PromiseLike<SingleResult>; }
  maybeSingle() { this.cardinality = "maybeSingle"; return this as unknown as PromiseLike<SingleResult>; }

  private async readRows() {
    const plan = buildCloudflareReadPlan({
      table: this.table,
      filters: this.filters,
      orFilterCount: this.orFilters.length,
      sorts: this.sorts,
      fromIndex: this.fromIndex,
      toIndex: this.toIndex,
      maxRows: this.maxRows,
    });
    const result = await this.db.prepare(plan.sql).bind(...plan.bindings).all<{ json_data: string }>();
    if (!result.success) throw new Error(result.error ?? "D1 read failed.");
    let rows = (result.results ?? []).map((item) => JSON.parse(item.json_data) as Row);
    rows = rows.filter((row) => this.filters.every((filter) => matches(row, filter)));
    rows = rows.filter((row) => this.orFilters.every((expressions) => matchesOr(row, expressions)));
    // Keep database order once offsets were applied: JS collation can differ.
    if (!plan.paginationPushed) sortRows(rows, this.sorts);
    if (!plan.paginationPushed) rows = paginateRows(rows, this.fromIndex, this.toIndex, this.maxRows);

    if (this.table === "workout_programs" && this.selector?.includes("workout_program_exercises(")) {
      const [exerciseRows, libraryRows] = await Promise.all([
        this.db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ?").bind("workout_program_exercises").all<{ json_data: string }>(),
        this.db.prepare("SELECT json_data FROM soma_rows WHERE table_name = ?").bind("exercise_library").all<{ json_data: string }>(),
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

  private async executeMutation() {
    if (!this.mutation) return shapeQueryResult(await this.readRows(), this.selector, this.selectOptions, this.cardinality);
    if (this.mutation.kind === "insert" || this.mutation.kind === "upsert") {
      const mutation = this.mutation;
      const rows = mutation.values.map(withDefaults);
      await writeRows(this.db, this.table, rows, mutation.kind === "upsert" ? mutation.onConflict : undefined, mutation.kind === "upsert" && mutation.ignoreDuplicates);
      return shapeQueryResult(rows, this.selector, this.selectOptions, this.cardinality);
    }
    const existing = await this.readRows();
    if (this.mutation.kind === "delete") {
      const statements = existing.map((row) => this.db.prepare("DELETE FROM soma_rows WHERE table_name = ? AND row_key = ?").bind(this.table, stableIdentity(this.table, row)));
      for (let index = 0; index < statements.length; index += 35) {
        const rowSlice = existing.slice(index, index + 35);
        const revisionUserIds = affectsLabMatrixRevision(this.table)
          ? [...new Set(rowSlice.flatMap((row) => typeof row.user_id === "string" ? [row.user_id] : []))]
          : [];
        const results = await this.db.batch<D1BatchResult>([
          ...statements.slice(index, index + 35),
          ...revisionUserIds.map((userId) => labMatrixRevisionStatement(this.db, userId)),
        ]);
        assertBatchSucceeded(results, "Cloudflare D1 delete failed.");
      }
      return shapeQueryResult(existing, this.selector, this.selectOptions, this.cardinality);
    }
    const values = this.mutation.values;
    const changed = existing.map((row) => {
      const updatedAt = this.table === "assistant_data_jobs"
        ? new Date(Math.max(Date.now(), (Date.parse(String(row.updated_at)) || 0) + 1, Date.parse(String(values.updated_at)) || 0)).toISOString()
        : new Date().toISOString();
      return cleanRow({ ...row, ...values, updated_at: updatedAt });
    });
    const persisted = await updateRowsInPlace(this.db, this.table, existing, changed, this.filters);
    return shapeQueryResult(persisted, this.selector, this.selectOptions, this.cardinality);
  }

  private async execute(): Promise<QueryResult<any>> {
    try {
      return await this.executeMutation();
    } catch (error) {
      return queryError(error, "Cloudflare D1 operation failed.");
    }
  }

  then<TResult1 = ManyResult, TResult2 = never>(
    onfulfilled?: ((value: ManyResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected) as PromiseLike<TResult1 | TResult2>;
  }
}

export function createD1AdminClient(dbOrFactory: D1DatabaseLike | (() => D1DatabaseLike), { executeRpc }: QueryBuilderDependencies) {
  const resolveDb = typeof dbOrFactory === "function" ? dbOrFactory : () => dbOrFactory;
  return {
    from(table: string) { return new CloudflareQueryBuilder(resolveDb(), table); },
    async rpc(name: string, parameters: Row) {
      return executeRpc(name, parameters);
    },
    auth: {
      admin: {
        async deleteUser(userId: string) {
          try {
            const db = resolveDb();
            const results = await db.batch<D1BatchResult>([
              db.prepare("DELETE FROM soma_sessions WHERE user_id = ?").bind(userId),
              db.prepare("DELETE FROM soma_credentials WHERE user_id = ?").bind(userId),
              db.prepare("DELETE FROM soma_rows WHERE user_id = ?").bind(userId),
              db.prepare("DELETE FROM soma_users WHERE id = ?").bind(userId),
            ]);
            assertBatchSucceeded(results, "Account deletion failed.");
            return { data: null, error: null };
          } catch (error) {
            return { data: null, error: { message: error instanceof Error ? error.message : "Account deletion failed." } };
          }
        },
      },
    },
  };
}

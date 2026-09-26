import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any -- The compatibility layer mirrors Supabase's dynamic query API. */

import {
  affectsLabMatrixRevision,
  LAB_MATRIX_REVISION_TABLE,
  nextSupabaseLabMatrixRevision,
  stableIdentity,
  withDefaults,
  cleanRow,
} from "./db-identity";
import {
  matches,
  matchesOr,
  paginateRows,
  parseOrExpression,
  queryError,
  shapeQueryResult,
  sortRows,
  topLevelColumns,
} from "./db-query";
import type {
  ManyResult,
  Mutation,
  QueryBuilderDependencies,
  QueryResult,
  Row,
  SelectOptions,
  SingleResult,
  Sort,
  SupabaseFilter,
  SupabaseOrTerm,
  SupabaseRequest,
  SupabaseStoredRow,
} from "./db-types";

export const SUPABASE_STORAGE_PAGE_SIZE = 1_000;
export const SUPABASE_REQUEST_TIMEOUT_MS = 10_000;

const physicalTables = new Set(["soma_users", "soma_sessions", "soma_credentials", "soma_auth_identities"]);

export function hasSupabaseRuntime() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return { url, key };
}

export function createSupabaseRequest(): SupabaseRequest {
  async function performRequest<T>(path: string, init: RequestInit = {}, timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS): Promise<{ data: T; count: number | null }> {
    const { url, key } = supabaseConfig();
    const headers = new Headers(init.headers);
    headers.set("apikey", key);
    headers.set("Authorization", `Bearer ${key}`);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    const controller = new AbortController();
    const upstreamSignal = init.signal;
    const relayAbort = () => controller.abort();
    if (upstreamSignal) {
      if (upstreamSignal.aborted) controller.abort();
      else upstreamSignal.addEventListener("abort", relayAbort, { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), Math.max(1, Math.floor(timeoutMs)));
    try {
      const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers, signal: controller.signal });
      const body = await response.text();
      let parsed: unknown = null;
      if (body) {
        try { parsed = JSON.parse(body); } catch { parsed = body; }
      }
      if (!response.ok) {
        const message = typeof parsed === "object" && parsed && "message" in parsed
          ? String((parsed as { message: unknown }).message)
          : `Supabase request failed (${response.status}).`;
        throw new Error(message);
      }
      const rangeTotal = response.headers.get("content-range")?.split("/").at(-1);
      const count = rangeTotal && /^\d+$/.test(rangeTotal) ? Number(rangeTotal) : null;
      return { data: parsed as T, count };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error("Supabase request timed out.");
      throw error;
    } finally {
      clearTimeout(timeoutId);
      upstreamSignal?.removeEventListener("abort", relayAbort);
    }
  }
  const request: SupabaseRequest = async <T>(path: string, init?: RequestInit, timeoutMs?: number) => (await performRequest<T>(path, init, timeoutMs)).data;
  request.count = async (path, timeoutMs) => {
    const result = await performRequest<null>(path, { method: "HEAD", headers: { Prefer: "count=exact" } }, timeoutMs);
    if (result.count === null) throw new Error("Supabase did not return an exact count.");
    return result.count;
  };
  return request;
}

export function supabasePath(table: string, filters: Array<[string, string]>) {
  const params = new URLSearchParams();
  for (const [key, value] of filters) params.append(key, value);
  const query = params.toString();
  return `${encodeURIComponent(table)}${query ? `?${query}` : ""}`;
}

function supabaseFilterValue(filter: SupabaseFilter) {
  if (filter.operator === "is" && filter.value === null) return "is.null";
  if (filter.operator === "in") return `in.(${(filter.value as unknown[]).map((value) => String(value)).join(",")})`;
  if (filter.operator === "not") return `not.${filter.secondaryOperator}.${String(filter.value)}`;
  return `${filter.operator}.${String(filter.value)}`;
}

function supabaseMutationFilter(filter: SupabaseFilter): [string, string] | null {
  const field = filter.field === "user_id" ? "user_id" : supabaseJsonField(filter.field);
  return field ? [field, supabaseFilterValue(filter)] : null;
}

function storageRow(table: string, row: Row, explicitConflict?: string): SupabaseStoredRow {
  const value = withDefaults(row);
  return {
    table_name: table,
    row_key: stableIdentity(table, value, explicitConflict),
    user_id: value.user_id ?? null,
    json_data: value,
    created_at: value.created_at ?? null,
    updated_at: value.updated_at ?? null,
  };
}

async function bumpSupabaseLabMatrixRevisions(request: SupabaseRequest, userIds: readonly string[]) {
  const uniqueUserIds = [...new Set(userIds)];
  for (const userId of uniqueUserIds) {
    const stored = storageRow(LAB_MATRIX_REVISION_TABLE, {
      user_id: userId,
      revision: nextSupabaseLabMatrixRevision(),
      updated_at: new Date().toISOString(),
    }, "user_id");
    await request<unknown[]>("soma_rows?on_conflict=table_name%2Crow_key", {
      method: "POST",
      headers: new Headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([stored]),
    });
  }
}

function logicalRow(item: SupabaseStoredRow) {
  const projected = Object.fromEntries(Object.entries(item).filter(([key]) => key.startsWith("soma_field_")).map(([key, value]) => [key.slice("soma_field_".length), value]));
  const row = cleanRow(item.json_data ?? projected);
  if (row.user_id === undefined && item.user_id !== null) row.user_id = item.user_id;
  return row;
}

function supabaseJsonField(field: string) {
  return /^[A-Za-z0-9_]+$/.test(field) ? `json_data->>${field}` : null;
}

function canPushSupabaseFilter(filter: SupabaseFilter) {
  if (filter.value === null && filter.operator !== "is") return false;
  if (filter.field === "user_id") return filter.operator !== "contains" && filter.operator !== "not" && filter.operator !== "neq";
  if (!supabaseJsonField(filter.field)) return false;
  if (["contains", "not", "neq"].includes(filter.operator)) return false;
  if (filter.operator === "in") return Array.isArray(filter.value) && filter.value.length > 0;
  return filter.operator === "is" ? filter.value === null : true;
}

function canPushSupabaseSort(sort: Sort) {
  return Boolean(supabaseJsonField(sort.field));
}

async function readSupabaseStorageRows(
  request: SupabaseRequest,
  table: string,
  filters: SupabaseFilter[],
  sorts: Sort[],
  orFilters: SupabaseOrTerm[][],
  fromIndex: number,
  toIndex: number | undefined,
  maxRows: number | undefined,
  exactCount: boolean,
  requestTimeoutMs: number | undefined,
  selector: string | undefined,
  head: boolean,
) {
  const selected = topLevelColumns(selector);
  const required = selected ? [...new Set([...selected, ...filters.map((filter) => filter.field.split(".")[0]), ...sorts.map((sort) => sort.field.split(".")[0]), ...orFilters.flat().map((term) => term.field.split(".")[0])])] : null;
  // JSON extraction cannot distinguish a missing key from explicit JSON null.
  // Keep full rows when a local strict comparison needs that distinction.
  const needsMissingKeys = filters.some((filter) =>
    (filter.operator !== "is" && filter.value == null) ||
    (filter.operator === "in" && Array.isArray(filter.value) && filter.value.some((value) => value == null))) ||
    orFilters.flat().some((term) => term.operator !== "is" && term.value === null);
  const projection = !needsMissingKeys && required?.every((field) => /^[A-Za-z0-9_]+$/.test(field))
    ? ["user_id", ...required.filter((field) => field !== "user_id").map((field) => `soma_field_${field}:json_data->${field}`)].join(",")
    : "table_name,row_key,user_id,json_data,created_at,updated_at";
  const serverFilters: Array<[string, string]> = [
    ["select", projection],
    ["table_name", `eq.${table}`],
  ];
  let allFiltersPushed = true;
  for (const filter of filters) {
    if (!canPushSupabaseFilter(filter)) {
      allFiltersPushed = false;
      continue;
    }
    const field = filter.field === "user_id" ? "user_id" : supabaseJsonField(filter.field);
    if (field) serverFilters.push([field, supabaseFilterValue(filter)]);
  }

  const allSortsPushed = sorts.every(canPushSupabaseSort);
  if (allSortsPushed && sorts.length) {
    serverFilters.push(["order", sorts.map((sort) => `${supabaseJsonField(sort.field)}.${sort.ascending ? "asc" : "desc"}`).join(",")]);
  } else {
    serverFilters.push(["order", "row_key.asc"]);
  }

  let allOrFiltersPushed = true;
  for (const expressions of orFilters) {
    const terms = expressions.map(({ field, operator, value }) => {
      const column = field === "user_id" ? "user_id" : supabaseJsonField(field);
      if (!column || !["eq", "gte", "gt", "lte", "lt", "is"].includes(operator) || (value === null && operator !== "is")) return null;
      return `${column}.${operator === "is" && value === null ? "is.null" : `${operator}.${value}`}`;
    });
    if (terms.some((term) => term === null)) {
      allOrFiltersPushed = false;
      continue;
    }
    serverFilters.push(["or", `(${terms.join(",")})`]);
  }

  const filtersPushed = allFiltersPushed && allOrFiltersPushed;
  const count = exactCount && filtersPushed && request.count
    ? await request.count(supabasePath("soma_rows", [...serverFilters.filter(([key]) => key !== "select" && key !== "order"), ["select", "row_key"]]), requestTimeoutMs)
    : undefined;
  if (head && count !== undefined) return { rows: [], paginationPushed: true, count };
  const paginationPushed = filtersPushed && allSortsPushed && (!exactCount || count !== undefined);
  const rangeSize = toIndex === undefined ? undefined : Math.max(0, toIndex - fromIndex + 1);
  const requestedLimit = rangeSize === undefined ? maxRows : maxRows === undefined ? rangeSize : Math.min(rangeSize, maxRows);
  const hasBoundedPage = paginationPushed && (requestedLimit !== undefined || fromIndex > 0);

  const storedRows: SupabaseStoredRow[] = [];
  const startOffset = hasBoundedPage ? Math.max(0, fromIndex) : 0;
  for (let offset = 0; ; offset += SUPABASE_STORAGE_PAGE_SIZE) {
    const remaining = hasBoundedPage && requestedLimit !== undefined ? Math.max(0, requestedLimit - offset) : SUPABASE_STORAGE_PAGE_SIZE;
    const pageSize = Math.min(SUPABASE_STORAGE_PAGE_SIZE, remaining);
    if (pageSize === 0) break;
    const page = await request<SupabaseStoredRow[]>(supabasePath("soma_rows", [
      ...serverFilters,
      ["limit", String(pageSize)],
      ["offset", String(startOffset + offset)],
    ]), {}, requestTimeoutMs ?? SUPABASE_REQUEST_TIMEOUT_MS);
    storedRows.push(...page);
    if (page.length < pageSize || (hasBoundedPage && requestedLimit !== undefined && storedRows.length >= requestedLimit)) break;
  }
  return { rows: storedRows.map(logicalRow), paginationPushed: hasBoundedPage, count };
}

export class SupabaseQueryBuilder implements PromiseLike<ManyResult> {
  private selector: string | undefined;
  private selectOptions: SelectOptions | undefined;
  private filters: SupabaseFilter[] = [];
  private orFilters: SupabaseOrTerm[][] = [];
  private sorts: Sort[] = [];
  private maxRows: number | undefined;
  private fromIndex = 0;
  private toIndex: number | undefined;
  private cardinality: "many" | "single" | "maybeSingle" = "many";
  private mutation: Mutation | undefined;
  private requestTimeoutMs: number | undefined;

  constructor(private readonly request: SupabaseRequest, private readonly table: string) {}

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
  withTimeout(timeoutMs: number) { this.requestTimeoutMs = timeoutMs; return this; }
  single() { this.cardinality = "single"; return this as unknown as PromiseLike<SingleResult>; }
  maybeSingle() { this.cardinality = "maybeSingle"; return this as unknown as PromiseLike<SingleResult>; }

  private isPhysicalTable() {
    return physicalTables.has(this.table);
  }

  private async readRows(): Promise<{ rows: Row[]; paginationPushed: boolean; count?: number }> {
    if (this.isPhysicalTable()) {
      const filters: Array<[string, string]> = [["select", this.selector?.trim() || "*"]];
      for (const filter of this.filters) filters.push([filter.field, supabaseFilterValue(filter)]);
      const count = !this.mutation && this.selectOptions?.count === "exact" && this.request.count
        ? await this.request.count(supabasePath(this.table, filters), this.requestTimeoutMs)
        : undefined;
      if (!this.mutation && this.selectOptions?.head && count !== undefined) return { rows: [], paginationPushed: true, count };
      const rows = await this.request<Row[]>(supabasePath(this.table, filters), {}, this.requestTimeoutMs ?? SUPABASE_REQUEST_TIMEOUT_MS);
      sortRows(rows, this.sorts);
      return { rows, paginationPushed: false, count };
    }

    const storageResult = await readSupabaseStorageRows(
      this.request,
      this.table,
      this.filters,
      this.sorts,
      this.orFilters,
      this.fromIndex,
      this.toIndex,
      this.maxRows,
      this.selectOptions?.count === "exact",
      this.requestTimeoutMs,
      this.mutation ? "*" : this.selector,
      !this.mutation && this.selectOptions?.head === true,
    );
    let rows = storageResult.rows;
    rows = rows.filter((row) => this.filters.every((filter) => matches(row, filter)));
    rows = rows.filter((row) => this.orFilters.every((expressions) => matchesOr(row, expressions)));
    sortRows(rows, this.sorts);
    return { rows, paginationPushed: storageResult.paginationPushed, count: storageResult.count };
  }

  private async insertPhysical(rows: Row[], upsert: boolean, onConflict?: string, ignoreDuplicates = false) {
    const headers = new Headers({ Prefer: upsert ? `resolution=${ignoreDuplicates ? "ignore-duplicates" : "merge-duplicates"},return=representation` : "return=representation" });
    const query = upsert && onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
    return this.request<Row[]>(`${encodeURIComponent(this.table)}${query}`, { method: "POST", headers, body: JSON.stringify(rows) });
  }

  private async insertLogical(rows: Row[], upsert: boolean, onConflict?: string, ignoreDuplicates = false) {
    const stored = rows.map((row) => storageRow(this.table, row, onConflict));
    const headers = new Headers({ Prefer: upsert ? `resolution=${ignoreDuplicates ? "ignore-duplicates" : "merge-duplicates"},return=representation` : "return=representation" });
    const query = upsert ? "?on_conflict=table_name%2Crow_key" : "";
    await this.request<unknown[]>(`soma_rows${query}`, { method: "POST", headers, body: JSON.stringify(stored) });
    if (affectsLabMatrixRevision(this.table)) {
      const userIds = [...new Set(rows.flatMap((row) => typeof row.user_id === "string" ? [row.user_id] : []))];
      if (userIds.length) await bumpSupabaseLabMatrixRevisions(this.request, userIds);
    }
  }

  private async updatePhysical(existing: Row[], values: Row) {
    for (const row of existing) {
      const key = this.table === "soma_sessions" ? "token_hash" : this.table === "soma_credentials" ? "user_id" : "id";
      const updated = { ...row, ...values };
      await this.request<unknown[]>(supabasePath(this.table, [[key, `eq.${String(row[key])}`]]), { method: "PATCH", headers: new Headers({ Prefer: "return=representation" }), body: JSON.stringify(updated) });
    }
    return existing.map((row) => ({ ...row, ...values }));
  }

  private async mutate() {
    if (!this.mutation) {
      const readResult = await this.readRows();
      const paged = readResult.paginationPushed ? readResult.rows : paginateRows(readResult.rows, this.fromIndex, this.toIndex, this.maxRows);
      return shapeQueryResult(paged, this.selector, this.selectOptions, this.cardinality, readResult.count ?? readResult.rows.length);
    }

    const mutation = this.mutation;
    if (mutation.kind === "insert" || mutation.kind === "upsert") {
      // Physical compatibility tables have exact schemas. soma_sessions is
      // keyed by token_hash and has no id column, so keep rows untouched there.
      const rows = mutation.values.map((row) => this.isPhysicalTable() ? cleanRow(row) : withDefaults(row));
      const isUpsert = mutation.kind === "upsert";
      const onConflict = isUpsert ? mutation.onConflict : undefined;
      const ignoreDuplicates = isUpsert ? mutation.ignoreDuplicates : false;
      if (this.isPhysicalTable()) await this.insertPhysical(rows, isUpsert, onConflict, ignoreDuplicates);
      else await this.insertLogical(rows, isUpsert, onConflict, ignoreDuplicates);
      return shapeQueryResult(rows, this.selector, this.selectOptions, this.cardinality);
    }

    const readResult = await this.readRows();
    const existing = readResult.rows;
    if (this.isPhysicalTable()) {
      if (mutation.kind === "delete") {
        const key = this.table === "soma_sessions" ? "token_hash" : "id";
        for (const row of existing) await this.request<unknown[]>(supabasePath(this.table, [[key, `eq.${String(row[key])}`]]), { method: "DELETE", headers: new Headers({ Prefer: "return=minimal" }) });
        return shapeQueryResult(existing, this.selector, this.selectOptions, this.cardinality);
      }
      return shapeQueryResult(await this.updatePhysical(existing, mutation.values), this.selector, this.selectOptions, this.cardinality);
    }

    if (mutation.kind === "delete") {
      for (const row of existing) await this.request<unknown[]>(supabasePath("soma_rows", [["table_name", `eq.${this.table}`], ["row_key", `eq.${stableIdentity(this.table, row)}`]]), { method: "DELETE", headers: new Headers({ Prefer: "return=minimal" }) });
      if (existing.length && affectsLabMatrixRevision(this.table)) {
        await bumpSupabaseLabMatrixRevisions(this.request, existing.flatMap((row) => typeof row.user_id === "string" ? [row.user_id] : []));
      }
      return shapeQueryResult(existing, this.selector, this.selectOptions, this.cardinality);
    }

    const changed = existing.map((row) => cleanRow({ ...row, ...mutation.values, updated_at: new Date().toISOString() }));
    const persisted: Row[] = [];
    for (let index = 0; index < existing.length; index += 1) {
      const oldKey = stableIdentity(this.table, existing[index]);
      const newRow = changed[index];
      const filters = this.filters.flatMap((filter) => {
        const pair = supabaseMutationFilter(filter);
        return pair ? [pair] : [];
      });
      const updated = await this.request<unknown[]>(supabasePath("soma_rows", [["table_name", `eq.${this.table}`], ["row_key", `eq.${oldKey}`], ...filters]), {
        method: "PATCH",
        headers: new Headers({ Prefer: "return=representation" }),
        body: JSON.stringify(storageRow(this.table, newRow)),
      });
      if (updated.length > 0) persisted.push(newRow);
    }
    if (persisted.length && affectsLabMatrixRevision(this.table)) {
      await bumpSupabaseLabMatrixRevisions(this.request, persisted.flatMap((row) => typeof row.user_id === "string" ? [row.user_id] : []));
    }
    return shapeQueryResult(persisted, this.selector, this.selectOptions, this.cardinality);
  }

  private async execute(): Promise<QueryResult<any>> {
    try {
      return await this.mutate();
    } catch (error) {
      return queryError(error, "Supabase operation failed.");
    }
  }

  then<TResult1 = ManyResult, TResult2 = never>(
    onfulfilled?: ((value: ManyResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any) as PromiseLike<TResult1 | TResult2>;
  }
}

export function createSupabaseAdminClient(request: SupabaseRequest, { executeRpc }: QueryBuilderDependencies) {
  return {
    from(table: string) { return new SupabaseQueryBuilder(request, table); },
    async rpc(name: string, parameters: Row) {
      return executeRpc(name, parameters);
    },
    auth: {
      admin: {
        async deleteUser(userId: string) {
          try {
            await request<unknown[]>(supabasePath("soma_sessions", [["user_id", `eq.${userId}`]]), { method: "DELETE", headers: new Headers({ Prefer: "return=minimal" }) });
            await request<unknown[]>(supabasePath("soma_credentials", [["user_id", `eq.${userId}`]]), { method: "DELETE", headers: new Headers({ Prefer: "return=minimal" }) });
            await request<unknown[]>(supabasePath("soma_rows", [["user_id", `eq.${userId}`]]), { method: "DELETE", headers: new Headers({ Prefer: "return=minimal" }) });
            await request<unknown[]>(supabasePath("soma_users", [["id", `eq.${userId}`]]), { method: "DELETE", headers: new Headers({ Prefer: "return=minimal" }) });
            return { data: null, error: null };
          } catch (error) {
            return { data: null, error: { message: error instanceof Error ? error.message : "Account deletion failed." } };
          }
        },
      },
    },
  };
}

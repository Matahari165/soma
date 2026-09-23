/* eslint-disable @typescript-eslint/no-explicit-any -- Query compatibility requires dynamic row values. */

import { stableIdentity } from "./db-identity";
import type {
  Cardinality,
  Filter,
  QueryResult,
  ReadPlan,
  Row,
  SelectOptions,
  Sort,
  SupabaseOrTerm,
  UpdatePlan,
} from "./db-types";

export function topLevelColumns(selector: string | undefined) {
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

export function projectRow(row: Row, selector: string | undefined) {
  const columns = topLevelColumns(selector);
  if (!columns) return row;
  // Supabase returns null for a selected column that is absent. Keep the same
  // contract for sparse JSON rows in D1 so missing data never becomes zero.
  return Object.fromEntries(columns.map((column) => [column, row[column] === undefined ? null : row[column]]));
}

export function valueAt(row: Row, field: string) {
  return field.split(".").reduce<any>((value, key) => value?.[key], row);
}

export function matches(row: Row, filter: Filter): boolean {
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

export function parseOrExpression(expression: string): SupabaseOrTerm[] {
  return expression.split(",").map((part) => {
    const [field, operator, ...raw] = part.split(".");
    const joined = raw.join(".");
    const value: string | null = joined === "null" ? null : joined;
    return { field, operator, value };
  });
}

export function matchesOr(row: Row, expressions: SupabaseOrTerm[]) {
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

export function safeJsonPath(field: string) {
  return /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(field) ? `$.${field}` : null;
}

export function d1Value(value: any) {
  return typeof value === "boolean" ? Number(value) : value;
}

export function sortRows(rows: Row[], sorts: Sort[]) {
  for (const sort of [...sorts].reverse()) {
    rows.sort((left, right) => {
      const a = valueAt(left, sort.field);
      const b = valueAt(right, sort.field);
      const compared = a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0;
      return sort.ascending ? compared : -compared;
    });
  }
  return rows;
}

export function paginateRows(rows: Row[], fromIndex: number, toIndex: number | undefined, maxRows: number | undefined) {
  const to = toIndex === undefined ? undefined : toIndex + 1;
  return rows.slice(fromIndex, to).slice(0, maxRows);
}

export function shapeQueryResult(
  rows: Row[],
  selector: string | undefined,
  selectOptions: SelectOptions | undefined,
  cardinality: Cardinality,
  totalCount?: number,
): QueryResult<any> {
  const projected = rows.map((row) => projectRow(row, selector));
  const count = selectOptions?.count ? (totalCount ?? rows.length) : undefined;
  if (selectOptions?.head) return { data: null, error: null, count };
  if (cardinality === "single") {
    if (projected.length !== 1) return { data: null, error: { message: "Expected exactly one row.", code: "PGRST116" }, count };
    return { data: projected[0], error: null, count };
  }
  if (cardinality === "maybeSingle") {
    if (projected.length > 1) return { data: null, error: { message: "Expected at most one row.", code: "PGRST116" }, count };
    return { data: projected[0] ?? null, error: null, count };
  }
  return { data: projected, error: null, count };
}

export function queryError(error: unknown, fallback: string): QueryResult<null> {
  return { data: null, error: { message: error instanceof Error ? error.message : fallback } };
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

export function buildCloudflareUpdatePlan(table: string, existing: Row, changed: Row, conditions: Filter[] = []): UpdatePlan {
  const where = ["table_name = ?", "row_key = ?"];
  const conditionBindings: unknown[] = [table, stableIdentity(table, existing)];
  for (const condition of conditions) {
    const expression = condition.field === "user_id"
      ? "user_id"
      : safeJsonPath(condition.field) ? `json_extract(json_data, '$.${condition.field}')` : null;
    if (!expression) continue;
    const operator = ({
      eq: "=",
      neq: "!=",
      gte: ">=",
      gt: ">",
      lte: "<=",
      lt: "<",
    } as Partial<Record<Filter["operator"], string>>)[condition.operator];
    if (condition.operator === "is" && condition.value === null) {
      where.push(`${expression} IS NULL`);
    } else if (operator) {
      where.push(`${expression} ${operator} ?`);
      conditionBindings.push(d1Value(condition.value));
    }
  }
  return {
    sql: `
      UPDATE soma_rows
      SET row_key = ?, user_id = ?, json_data = ?, updated_at = ?
      WHERE ${where.join(" AND ")}
    `,
    bindings: [
      stableIdentity(table, changed),
      changed.user_id ?? null,
      JSON.stringify(changed),
      changed.updated_at ?? null,
      ...conditionBindings,
    ],
  };
}

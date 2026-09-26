/* eslint-disable @typescript-eslint/no-explicit-any -- The compatibility layer mirrors Supabase's dynamic row API. */

export type Row = any;

export type CloudflareError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export type QueryResult<T> = {
  data: T;
  error: CloudflareError | null;
  count?: number | null;
};

export type ManyResult = QueryResult<any[] | null>;
export type SingleResult = QueryResult<any | null>;

export type Filter = {
  field: string;
  operator: "eq" | "neq" | "in" | "is" | "gte" | "gt" | "lte" | "lt" | "contains" | "not";
  value: any;
  secondaryOperator?: string;
};

export type Sort = {
  field: string;
  ascending: boolean;
};

export type Mutation =
  | { kind: "insert"; values: Row[] }
  | { kind: "upsert"; values: Row[]; onConflict?: string; ignoreDuplicates?: boolean }
  | { kind: "update"; values: Row }
  | { kind: "delete" };

export type ReadPlan = {
  sql: string;
  bindings: unknown[];
  paginationPushed: boolean;
};

export type UpdatePlan = {
  sql: string;
  bindings: unknown[];
};

export type SelectOptions = {
  count?: "exact";
  head?: boolean;
};

export type Cardinality = "many" | "single" | "maybeSingle";

export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Row>(): Promise<{ results?: T[]; success: boolean; error?: string }>;
  first<T = Row>(): Promise<T | null>;
  run(): Promise<{ success: boolean; error?: string; meta?: { changes?: number } }>;
};

export type D1BatchResult = {
  success?: boolean;
  error?: string;
  meta?: { changes?: number };
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
};

export type R2ObjectLike = {
  arrayBuffer(): Promise<ArrayBuffer>;
  body: ReadableStream | null;
};

export type R2BucketLike = {
  get(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView | string | ReadableStream, options?: Record<string, unknown>): Promise<unknown>;
  delete(key: string): Promise<void>;
};

export type SomaCloudflareEnv = {
  SOMA_DB: D1DatabaseLike;
  SOMA_ARCHIVES: R2BucketLike;
  [key: string]: unknown;
};

export type SupabaseStoredRow = {
  table_name: string;
  row_key: string;
  user_id: string | null;
  json_data: Row;
  created_at: string | null;
  updated_at: string | null;
};

export type SupabaseFilter = Filter & { field: string };
export type SupabaseOrTerm = { field: string; operator: string; value: string | null };

export type SupabaseRequest = {
  <T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T>;
  count?: (path: string, timeoutMs?: number) => Promise<number>;
};

export type RpcResult = {
  data: any;
  error: { message: string; code?: string } | null;
};

export type QueryBuilderDependencies = {
  executeRpc: (name: string, parameters: Row) => Promise<RpcResult>;
};

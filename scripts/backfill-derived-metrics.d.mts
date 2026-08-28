export const TARGET_FIELDS: readonly string[];
export const DEFAULT_CUTOFFS: { whoopThrough: string; googleFrom: string };
export function parseRowsText(source: string, expectedTable: "health_records" | "daily_health_metrics"): unknown[];
export type DerivedMetrics = {
  sedentary_minutes: number | null;
  vo2_max: number | null;
  running_distance_km: number | null;
  running_duration_minutes: number | null;
  running_pace_seconds_per_km: number | null;
  running_average_heart_rate: number | null;
};
export type BackfillRow = {
  metric_date: string;
  derived: DerivedMetrics;
  existing: Record<string, unknown> | null;
  status: string;
  writeValues: Partial<DerivedMetrics>;
};
export type BackfillReport = {
  fieldCounts: Record<keyof DerivedMetrics, { candidateValues: number; new: number; alreadyPresent: number; conflict: number }>;
  statusCounts: Record<string, number>;
  [key: string]: unknown;
};
export function buildPlan(input?: {
  candidates?: Record<string, unknown>[];
  existingRecords?: Record<string, unknown>[];
  existingMetrics?: Record<string, unknown>[];
  userId?: string;
  timeZone?: string;
  whoopThrough?: string;
  googleFrom?: string;
}): { userId: string; rows: BackfillRow[]; report: BackfillReport; records: Record<string, unknown>[]; candidateStatus: string[] };
export function buildSql(plan: ReturnType<typeof buildPlan>, options?: { generateSql?: boolean; now?: string }): { sql: string; sqlRows: number };

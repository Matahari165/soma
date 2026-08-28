export const DEFAULT_CUTOFFS: {
  readonly whoopThrough: string;
  readonly googleFrom: string;
};

export function parseRowsText(source: string): Record<string, unknown>[];
export function recordDate(record: Record<string, unknown>): string | null;
export function semanticRelation(first: Record<string, unknown>, second: Record<string, unknown>): "equal" | "conflict" | null;
export function compareRecords(input: {
  candidates: Record<string, unknown>[];
  existing: Record<string, unknown>[];
}, options?: Record<string, unknown>): {
  results: Array<Record<string, unknown>>;
  report: {
    counts: Record<string, number>;
    [key: string]: unknown;
  };
};
export function buildSql(comparison: {
  results: Array<Record<string, unknown>>;
}, options?: { generateSql?: boolean; now?: string }): {
  sql: string;
  sqlRecords: number;
};

export type XaiUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_in_usd_ticks: number;
};

export function parseXaiUsage(value: unknown): XaiUsage {
  const usage = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const number = (key: keyof XaiUsage) => Number.isFinite(usage[key]) ? Number(usage[key]) : 0;
  return {
    input_tokens: number("input_tokens"),
    output_tokens: number("output_tokens"),
    total_tokens: number("total_tokens"),
    cost_in_usd_ticks: number("cost_in_usd_ticks"),
  };
}

export function boundedJson(value: unknown, maximumCharacters = 12_000) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maximumCharacters) return serialized;
  let low = 0;
  let high = serialized.length;
  let bounded = JSON.stringify({ truncated: true, contextExcerpt: "" });
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = JSON.stringify({ truncated: true, contextExcerpt: serialized.slice(0, middle) });
    if (candidate.length <= maximumCharacters) {
      bounded = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return bounded;
}

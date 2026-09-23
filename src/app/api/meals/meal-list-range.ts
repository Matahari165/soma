const MAX_MEAL_HISTORY_DAYS = 90;

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mealListRange(query: { date?: string; from?: string; to?: string }, now = new Date()) {
  if (query.date) return { from: query.date, to: query.date };
  // Include the next UTC date so today's meal remains visible in time zones
  // ahead of UTC. Older history is requested in successive date windows.
  const to = query.to ?? shiftDate(now.toISOString().slice(0, 10), 1);
  const from = query.from ?? shiftDate(to, -(MAX_MEAL_HISTORY_DAYS - 1));
  const span = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  if (span < 1 || span > MAX_MEAL_HISTORY_DAYS) return null;
  return { from, to };
}

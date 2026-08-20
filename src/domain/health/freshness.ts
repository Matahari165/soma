import type { SignalFreshness } from "@/domain/health";

const DAY_MS = 86_400_000;

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function calculateSignalFreshness(input: {
  measuredAt?: string | null;
  importedAt?: string | null;
  coverage: number;
  now?: Date;
}): SignalFreshness {
  const measured = validDate(input.measuredAt);
  const imported = validDate(input.importedAt);
  const coverage = Math.min(1, Math.max(0, input.coverage));
  if (!measured || coverage === 0) return { measuredAt: input.measuredAt ?? null, importedAt: input.importedAt ?? null, state: "missing", coverage };

  const age = Math.max(0, (input.now ?? new Date()).getTime() - measured.getTime());
  const importAge = imported ? Math.max(0, (input.now ?? new Date()).getTime() - imported.getTime()) : Infinity;
  const state = !imported ? "partial" : age > 2 * DAY_MS || importAge > 2 * DAY_MS ? "stale" : coverage < 1 ? "partial" : "current";
  return { measuredAt: input.measuredAt ?? null, importedAt: input.importedAt ?? null, state, coverage };
}

export function formatFreshnessMoment(value: string | null, timeZone: string) {
  if (!value) return "unknown";
  const date = validDate(value);
  if (!date) return "unknown";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

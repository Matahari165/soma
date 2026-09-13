import "server-only";

export type ServerTimingEntry = {
  name: string;
  durationMs: number;
};

export function serverNow() {
  return typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
}

export function elapsedServerMs(startedAt: number) {
  const duration = serverNow() - startedAt;
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}

export function withServerTiming<T extends Response>(response: T, entries: readonly ServerTimingEntry[]) {
  const value = entries
    .filter((entry) => /^[a-z][a-z0-9_-]*$/i.test(entry.name) && Number.isFinite(entry.durationMs))
    .map((entry) => `${entry.name};dur=${Math.max(0, entry.durationMs).toFixed(1)}`)
    .join(", ");
  if (value) response.headers.set("Server-Timing", value);
  return response;
}

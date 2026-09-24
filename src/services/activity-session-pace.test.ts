import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryCall = {
  table: string;
  filters: Array<{ method: string; column?: string; value?: unknown }>;
  range?: [number, number];
};

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  queries: [] as QueryCall[],
  records: [] as Array<Record<string, unknown>>,
  fail: false,
}));

vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: () => ({ from: testState.from }),
}));

import { getActivitySessionPace } from "./activity-session-pace";

const sessionStart = "2026-09-10T07:00:00.000Z";
const sessionEnd = "2026-09-10T07:04:00.000Z";

function record(index: number, start: string, end: string, millimeters: number) {
  return {
    source_record_id: `distance-${index}`,
    start_time: start,
    end_time: end,
    payload: { distance: { interval: { startTime: start, endTime: end }, millimeters: String(millimeters) } },
  };
}

function resultFor(query: QueryCall) {
  if (testState.fail) return { data: null, error: { message: "temporary error" } };
  const range = query.range ?? [0, Number.MAX_SAFE_INTEGER];
  return { data: testState.records.slice(range[0], range[1] + 1), error: null };
}

function createQuery(table: string) {
  const query: QueryCall & Record<string, unknown> = { table, filters: [] };
  const chain = (method: string, column?: string, value?: unknown) => {
    query.filters.push({ method, column, value });
    return chain;
  };
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => chain("eq", column, value));
  chain.lt = vi.fn((column: string, value: unknown) => chain("lt", column, value));
  chain.gt = vi.fn((column: string, value: unknown) => chain("gt", column, value));
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn((from: number, to: number) => { query.range = [from, to]; return chain; });
  chain.then = ((resolve: Parameters<Promise<ReturnType<typeof resultFor>>["then"]>[0], reject: Parameters<Promise<ReturnType<typeof resultFor>>["then"]>[1]) => Promise.resolve(resultFor(query)).then(resolve, reject)) as unknown;
  testState.queries.push(query);
  return chain;
}

describe("activity session pace fallback", () => {
  beforeEach(() => {
    testState.queries.length = 0;
    testState.records = [];
    testState.fail = false;
    testState.from.mockImplementation((table: string) => createQuery(table));
  });

  it("interpolates kilometer boundaries and reports an actual final partial distance", async () => {
    testState.records = [
      record(1, sessionStart, "2026-09-10T07:01:00.000Z", 500_000),
      record(2, "2026-09-10T07:00:00.000Z", "2026-09-10T07:01:00.000Z", 500_000),
      record(3, "2026-09-10T07:01:00.000Z", "2026-09-10T07:02:00.000Z", 750_000),
      record(4, "2026-09-10T07:02:00.000Z", "2026-09-10T07:03:00.000Z", 250_000),
      record(5, "2026-09-10T07:03:00.000Z", sessionEnd, 100_000),
    ];

    const result = await getActivitySessionPace("user-1", { startTime: sessionStart, endTime: sessionEnd });

    expect(result).toEqual([
      {
        index: 1,
        startTime: sessionStart,
        endTime: "2026-09-10T07:01:40.000Z",
        distanceKm: 1,
        durationSeconds: 100,
        paceSecondsPerKm: 100,
        source: "estimated_distance_records",
        estimated: true,
        partial: false,
      },
      {
        index: 2,
        startTime: "2026-09-10T07:01:40.000Z",
        endTime: sessionEnd,
        distanceKm: 0.6,
        durationSeconds: 140,
        paceSecondsPerKm: 140 / 0.6,
        source: "estimated_distance_records",
        estimated: true,
        partial: true,
      },
    ]);
    expect(testState.queries[0]?.filters).toEqual(expect.arrayContaining([
      { method: "eq", column: "user_id", value: "user-1" },
      { method: "eq", column: "provider", value: "google_health" },
      { method: "eq", column: "data_type", value: "distance" },
      { method: "lt", column: "start_time", value: sessionEnd },
      { method: "gt", column: "end_time", value: sessionStart },
    ]));
  });

  it("clips interval edges by time and scales their distance while marking the estimate", async () => {
    testState.records = [
      record(1, "2026-09-10T06:59:30.000Z", "2026-09-10T07:00:30.000Z", 500_000),
      record(2, "2026-09-10T07:00:30.000Z", "2026-09-10T07:01:30.000Z", 500_000),
      record(3, "2026-09-10T07:01:30.000Z", "2026-09-10T07:02:30.000Z", 500_000),
    ];

    const result = await getActivitySessionPace("user-1", {
      startTime: "2026-09-10T07:00:00.000Z",
      endTime: "2026-09-10T07:02:00.000Z",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ startTime: "2026-09-10T07:00:00.000Z", endTime: "2026-09-10T07:02:00.000Z", distanceKm: 1, durationSeconds: 120, estimated: true });
  });

  it("stops at a missing interval and never interpolates across the gap", async () => {
    testState.records = [
      record(1, sessionStart, "2026-09-10T07:01:00.000Z", 500_000),
      record(2, "2026-09-10T07:01:00.000Z", "2026-09-10T07:02:00.000Z", 750_000),
      record(3, "2026-09-10T07:03:00.000Z", sessionEnd, 1_000_000),
    ];

    const result = await getActivitySessionPace("user-1", { startTime: sessionStart, endTime: sessionEnd });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ distanceKm: 1, endTime: "2026-09-10T07:01:40.000Z", partial: false });
  });

  it("returns no splits for overlapping source intervals that could double count distance", async () => {
    testState.records = [
      record(1, sessionStart, "2026-09-10T07:01:00.000Z", 500_000),
      record(2, "2026-09-10T07:00:30.000Z", "2026-09-10T07:01:30.000Z", 500_000),
      record(3, "2026-09-10T07:01:30.000Z", sessionEnd, 1_000_000),
    ];

    await expect(getActivitySessionPace("user-1", { startTime: sessionStart, endTime: sessionEnd })).resolves.toEqual([]);
  });

  it("returns an empty fallback for missing, malformed, failed, or invalid data", async () => {
    await expect(getActivitySessionPace("user-1", { startTime: sessionStart, endTime: sessionEnd })).resolves.toEqual([]);
    await expect(getActivitySessionPace("", { startTime: sessionStart, endTime: sessionEnd })).resolves.toEqual([]);
    await expect(getActivitySessionPace("user-1", { startTime: sessionEnd, endTime: sessionStart })).resolves.toEqual([]);

    testState.records = [{ ...record(1, sessionStart, sessionEnd, 1_000_000), payload: { distance: { interval: { startTime: sessionStart, endTime: sessionEnd }, millimeters: "not-a-number" } } }];
    await expect(getActivitySessionPace("user-1", { startTime: sessionStart, endTime: sessionEnd })).resolves.toEqual([]);

    testState.records = [record(1, sessionStart, sessionEnd, 1_000_000)];
    testState.fail = true;
    await expect(getActivitySessionPace("user-1", { startTime: sessionStart, endTime: sessionEnd })).resolves.toEqual([]);
  });
});

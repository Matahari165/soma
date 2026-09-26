import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeHealthArchive } from "@/domain/health/archive-codec";
import { matches, sortRows } from "@/lib/cloudflare/db-query";
import type { Filter, Row, Sort } from "@/lib/cloudflare/db-types";
import { queryAssistantRawHealth, safeHealthPayload } from "./raw-health";

const cursorSecret = "synthetic-cursor-signing-test-key";
const query = { dataType: "heart-rate", period: { from: "2020-01-01T00:00:00Z", to: "2020-01-03T00:00:00Z" }, limit: 2 };

describe("targeted raw health", () => {
  it("advances past empty partitions without claiming the whole range is empty", async () => {
    const readDay = vi.fn().mockResolvedValue({ rows: [], hasMore: false, archivesIncluded: false });
    const first = await queryAssistantRawHealth("test-user", query, { readDay, cursorSecret });
    expect(readDay.mock.calls[0].slice(0, 4)).toEqual(["test-user", "heart-rate", "2020-01-01T00:00:00.000Z", "2020-01-02T00:00:00.000Z"]);
    expect(first.manifest.complete).toBe(false);
    const second = await queryAssistantRawHealth("test-user", { ...query, cursor: first.manifest.nextCursor }, { readDay, cursorSecret });
    expect(second.manifest.complete).toBe(true);
    expect(readDay.mock.calls[1][2]).toBe("2020-01-02T00:00:00.000Z");
  });

  it("binds cursors to the authenticated user and filters", async () => {
    const readDay = vi.fn().mockResolvedValue({ rows: [], hasMore: false, archivesIncluded: false });
    const first = await queryAssistantRawHealth("test-user", query, { readDay, cursorSecret });
    await expect(queryAssistantRawHealth("other-user", { ...query, cursor: first.manifest.nextCursor }, { readDay, cursorSecret })).rejects.toThrow(/another user or query/);
    await expect(queryAssistantRawHealth("test-user", { ...query, dataType: "steps", cursor: first.manifest.nextCursor }, { readDay, cursorSecret })).rejects.toThrow();
    expect(readDay).toHaveBeenCalledTimes(1);
  });

  it("continues inside a partition and marks oversized payloads explicitly", async () => {
    const readDay = vi.fn().mockResolvedValue({ rows: [
      { source_record_id: "sample-a", measured_at: "2020-01-01T00:01:00Z", payload: { notes: "x".repeat(12_001) } },
      { source_record_id: "sample-b", measured_at: "2020-01-01T00:01:00Z", payload: { beatsPerMinute: 100 } },
    ], hasMore: true, archivesIncluded: true });
    const first = await queryAssistantRawHealth("test-user", query, { readDay, cursorSecret });
    expect(first.items[0].payloadComplete).toBe(false);
    expect(first.manifest.payloadsComplete).toBe(false);
    await queryAssistantRawHealth("test-user", { ...query, cursor: first.manifest.nextCursor }, { readDay, cursorSecret });
    expect(readDay.mock.calls[1][4]).toBe("2020-01-01T00:01:00Z|sample-b");
  });

  it("removes credential-like fields recursively without losing health measurements", () => {
    expect(safeHealthPayload({ token: "synthetic", data: { userId: "synthetic", beatsPerMinute: 100, sourceDevice: "test-device" } }))
      .toEqual({ data: { beatsPerMinute: 100, sourceDevice: "test-device" } });
  });
});

it("bounds total payload volume and marks omitted fields instead of silently truncating", async () => {
  const readDay = vi.fn().mockResolvedValue({ rows: Array.from({ length: 10 }, (_, index) => ({
    source_record_id: `sample-${index}`, measured_at: "2020-01-01T00:00:01Z", payload: { notes: "x".repeat(10_000) },
  })), hasMore: false, archivesIncluded: false });
  const result = await queryAssistantRawHealth("test-user", { ...query, limit: 10 }, { readDay, cursorSecret });
  expect(JSON.stringify(result.items).length).toBeLessThan(70_000);
  expect(result.manifest.payloadsComplete).toBe(false);
  expect(result.items.some((item) => !item.payloadComplete)).toBe(true);
});


const rawStorage = vi.hoisted(() => ({
  records: [] as Record<string, unknown>[], manifests: [] as Record<string, unknown>[],
  idOrder: "ordinal" as "ordinal" | "utf8" | "reverse",
  objects: new Map<string, Buffer>(), requests: [] as { table: string; limit: number | null; filters: Filter[] }[],
}));
vi.mock("@/lib/cloudflare/db", () => ({ createCloudflareAdminClient: () => ({ from: (table: string) => {
  const filters: Filter[] = [];
  const sorts: Sort[] = [];
  let maximum: number | null = null;
  let offset = 0;
  const builder = {
    select: () => builder,
    eq: (field: string, value: unknown) => { filters.push({ field, operator: "eq", value }); return builder; },
    is: (field: string, value: unknown) => { filters.push({ field, operator: "is", value }); return builder; },
    gte: (field: string, value: unknown) => { filters.push({ field, operator: "gte", value }); return builder; },
    gt: (field: string, value: unknown) => { filters.push({ field, operator: "gt", value }); return builder; },
    lt: (field: string, value: unknown) => { filters.push({ field, operator: "lt", value }); return builder; },
    order: (field: string) => { sorts.push({ field, ascending: true }); return builder; },
    limit: (limit: number) => { maximum = limit; return builder; },
    range: (from: number, to: number) => { offset = from; maximum = to - from + 1; return builder; },
    then: (resolve: (result: { data: Row[]; error: null }) => unknown) => {
      rawStorage.requests.push({ table, limit: maximum, filters: [...filters] });
      const rows = (table === "health_records" ? rawStorage.records : rawStorage.manifests)
        .filter((row) => filters.every((filter) => matches(row, filter)));
      if (rawStorage.idOrder === "ordinal") sortRows(rows, sorts);
      else for (const sort of [...sorts].reverse()) rows.sort((left, right) => {
        if (sort.field !== "source_record_id") {
          const a = String(left[sort.field]); const b = String(right[sort.field]);
          return a < b ? -1 : a > b ? 1 : 0;
        }
        const compared = Buffer.compare(Buffer.from(String(left.source_record_id)), Buffer.from(String(right.source_record_id)));
        return rawStorage.idOrder === "reverse" ? -compared : compared;
      });
      return Promise.resolve({ data: maximum === null ? rows : rows.slice(offset, offset + maximum), error: null }).then(resolve);
    },
  };
  return builder;
} }) }));
vi.mock("@/lib/r2", () => ({ getR2ArchiveObject: async (path: string) => {
  const object = rawStorage.objects.get(path);
  if (!object) throw new Error("Synthetic missing archive.");
  return object;
} }));

beforeEach(() => {
  rawStorage.idOrder = "ordinal"; rawStorage.records = []; rawStorage.manifests = []; rawStorage.objects.clear(); rawStorage.requests = [];
});

function liveRecord(id: string, dataType: string, fields: Record<string, unknown> = {}) {
  return { user_id: "test-user", provider: "google_health", data_type: dataType,
    source_record_id: id, measured_at: null, start_time: null, civil_date: null,
    payload: { syntheticValue: 1 }, ...fields };
}
async function addArchive(rows: Record<string, unknown>[], overrides: Record<string, unknown> = {}) {
  const rangeStart = "2020-01-01T00:00:00.000Z";
  const rangeEnd = "2020-01-02T00:00:00.000Z";
  const encoded = await encodeHealthArchive({ userId: "test-user", provider: "google_health", dataType: "heart-rate", rangeStart, rangeEnd, rows });
  rawStorage.objects.set("synthetic-archive", encoded.object);
  rawStorage.manifests.push({ user_id: "test-user", provider: "google_health", data_type: "heart-rate", range_start: rangeStart,
    range_end: rangeEnd, object_path: "synthetic-archive", storage_backend: "r2", row_count: rows.length,
    content_sha256: encoded.contentSha256, object_sha256: encoded.objectSha256, ...overrides });
}
async function collectDefault(dataType: string, limit = 1, to = "2020-01-02T00:00:00Z") {
  const ids: (string | null)[] = [];
  const pages = [];
  let cursor: string | null = null;
  for (let index = 0; index < 20; index += 1) {
    const page = await queryAssistantRawHealth("test-user", { dataType, period: { from: query.period.from, to }, limit, cursor }, { cursorSecret });
    ids.push(...page.items.map((item) => item.recordId)); pages.push(page);
    if (!page.manifest.hasMore) return { ids, pages };
    expect(page.manifest.nextCursor).not.toBe(cursor);
    cursor = page.manifest.nextCursor;
  }
  throw new Error("Synthetic raw pagination did not terminate.");
}

describe("raw health default storage reader", () => {
  it.each(["daily-heart-rate-variability", "steps", "distance", "active-zone-minutes", "active-energy-burned", "active-minutes", "altitude", "calories-in-heart-rate-zone", "floors", "sedentary-period", "time-in-heart-rate-zone", "total-calories"])(
    "includes civil rollups and hourly points for %s without loading an unbounded live history", async (dataType) => {
      rawStorage.records = [
        liveRecord("rollup", dataType, { civil_date: "2020-01-01" }),
        liveRecord("hourly", dataType, { measured_at: "2020-01-01T10:00:00.000Z", civil_date: "2020-01-01" }),
        liveRecord("fallback", dataType, { start_time: "2020-01-01T11:00:00.000Z" }),
        liveRecord("foreign", dataType, { user_id: "other-user", civil_date: "2020-01-01" }),
      ];
      const result = await collectDefault(dataType);
      expect(result.ids).toEqual(["rollup", "hourly", "fallback"]);
      expect(result.pages[0].items[0].civilDate).toBe("2020-01-01");
      expect(result.pages.at(-1)?.manifest.complete).toBe(true);
      const liveRequests = rawStorage.requests.filter((request) => request.table === "health_records");
      expect(liveRequests.length).toBeGreaterThan(0);
      expect(liveRequests.every((request) => request.limit !== null && request.limit <= 200)).toBe(true);
      expect(liveRequests.every((request) => !request.filters.some((filter) => filter.field === "source_record_id" && filter.operator === "gt"))).toBe(true);
      expect(liveRequests.every((request) => request.filters.some((filter) => filter.field === "user_id" && filter.value === "test-user"))).toBe(true);
    },
  );

  it("keeps ties, opaque IDs and non-ASCII IDs in exactly the storage order", async () => {
    const ids = ["a", "B", "é", "Ω", "a|suffix", "Ä", "😀", "\ue000"];
    rawStorage.records = ids.map((id) => liveRecord(id, "heart-rate", { measured_at: "2020-01-01T12:00:00.000Z" }));
    const result = await collectDefault("heart-rate");
    expect(result.ids).toEqual([...ids].sort((a, b) => a < b ? -1 : a > b ? 1 : 0));
    expect(new Set(result.ids).size).toBe(ids.length);
    expect(result.pages).toHaveLength(ids.length);
  });

  it("merges verified archives with live ties once, then advances across empty days", async () => {
    const instant = "2020-01-01T12:00:00.000Z";
    const shared = liveRecord("a", "heart-rate", { measured_at: instant });
    await addArchive([shared, liveRecord("B", "heart-rate", { measured_at: instant })]);
    rawStorage.records = [shared, liveRecord("é", "heart-rate", { measured_at: instant }),
      liveRecord("next-day", "heart-rate", { measured_at: "2020-01-02T10:00:00.000Z" })];
    const result = await collectDefault("heart-rate", 1, "2020-01-04T00:00:00Z");
    expect(result.ids).toEqual(["B", "a", "é", "next-day"]);
    expect(result.pages[0].manifest.archivesIncluded).toBe(true);
    expect(result.pages.at(-1)?.items).toEqual([]);
    expect(result.pages.at(-1)?.manifest.complete).toBe(true);
  });

  it("rejects an archive with mismatched integrity instead of declaring the range complete", async () => {
    await addArchive([liveRecord("a", "heart-rate", { measured_at: "2020-01-01T12:00:00.000Z" })], { content_sha256: "synthetic-wrong-hash" });
    await expect(collectDefault("heart-rate")).rejects.toThrow(/integrity verification/);
  });

  it("does not include midnight civil data in a range starting later that day", async () => {
    rawStorage.records = [liveRecord("rollup", "steps", { civil_date: "2020-01-01" }),
      liveRecord("hourly", "steps", { measured_at: "2020-01-01T13:00:00.000Z" })];
    const result = await queryAssistantRawHealth("test-user", { dataType: "steps", period: { from: "2020-01-01T12:00:00Z", to: "2020-01-02T00:00:00Z" } }, { cursorSecret });
    expect(result.items.map((item) => item.recordId)).toEqual(["hourly"]);
    expect(result.manifest.complete).toBe(true);
  });
});


it("paginates midnight ties across civil rollups and timestamped records", async () => {
  rawStorage.records = [
    liveRecord("a", "steps", { civil_date: "2020-01-01" }),
    liveRecord("B", "steps", { measured_at: "2020-01-01T00:00:00.000Z" }),
    liveRecord("é", "steps", { civil_date: "2020-01-01" }),
  ];
  const result = await collectDefault("steps");
  expect(result.ids).toEqual(["B", "a", "é"]);
  expect(result.pages).toHaveLength(3);
});


it.each(["utf8", "reverse"] as const)("paginates complete timestamp groups despite %s database ID order", async (idOrder) => {
  rawStorage.idOrder = idOrder;
  const ids = ["a", "B", "é", "Ω", "a|suffix", "Ä", "😀", "\ue000"];
  const shared = liveRecord("archive-and-live", "heart-rate", { measured_at: "2020-01-01T12:00:00.000Z" });
  await addArchive([shared, liveRecord("archive-only", "heart-rate", { measured_at: "2020-01-01T12:00:00.000Z" })]);
  rawStorage.records = [...ids.map((id) => liveRecord(id, "heart-rate", { measured_at: "2020-01-01T12:00:00.000Z" })), shared,
    liveRecord("later", "heart-rate", { measured_at: "2020-01-01T13:00:00.000Z" })];
  const result = await collectDefault("heart-rate");
  const expected = [...ids, "archive-and-live", "archive-only"].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  expect(result.ids).toEqual([...expected, "later"]);
  expect(result.pages).toHaveLength(expected.length + 1);
  expect(rawStorage.requests.every((request) => !request.filters.some((filter) => filter.field === "source_record_id" && filter.operator === "gt"))).toBe(true);
});

it("completes a frontier tie spanning multiple bounded database pages", async () => {
  rawStorage.idOrder = "reverse";
  rawStorage.records = Array.from({ length: 205 }, (_, index) => liveRecord(`sample-${String(index).padStart(3, "0")}`, "heart-rate", { measured_at: "2020-01-01T12:00:00.000Z" }));
  const first = await queryAssistantRawHealth("test-user", { ...query, limit: 2 }, { cursorSecret });
  expect(first.items.map((item) => item.recordId)).toEqual(["sample-000", "sample-001"]);
  const second = await queryAssistantRawHealth("test-user", { ...query, limit: 2, cursor: first.manifest.nextCursor }, { cursorSecret });
  expect(second.items.map((item) => item.recordId)).toEqual(["sample-002", "sample-003"]);
  expect(second.manifest.complete).toBe(false);
  expect(rawStorage.requests.filter((request) => request.table === "health_records").every((request) => request.limit !== null && request.limit <= 200)).toBe(true);
});

it("rejects oversized timestamp groups instead of claiming exhaustive pagination", async () => {
  rawStorage.idOrder = "reverse";
  rawStorage.records = Array.from({ length: 2_001 }, (_, index) => liveRecord(`sample-${index}`, "heart-rate", { measured_at: "2020-01-01T12:00:00.000Z" }));
  await expect(queryAssistantRawHealth("test-user", query, { cursorSecret })).rejects.toThrow(/timestamp group exceeds the safe pagination budget/);
  expect(rawStorage.requests.filter((request) => request.table === "health_records").every((request) => request.limit !== null && request.limit <= 200)).toBe(true);
});

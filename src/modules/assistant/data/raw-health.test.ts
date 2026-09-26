import { describe, expect, it, vi } from "vitest";
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

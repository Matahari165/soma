import { describe, expect, it } from "vitest";

import { decodeHealthArchive, encodeHealthArchive, sha256, utcDayRange } from "./archive-codec";

describe("lossless health record archives", () => {
  it("round-trips every field and verifies both compressed and logical content", async () => {
    const rows = [
      { id: "a", source_record_id: "source-a", measured_at: "2026-02-27T10:00:00.000Z", payload: { heartRate: { beatsPerMinute: 61 } } },
      { id: "b", source_record_id: "source-b", measured_at: "2026-02-27T10:01:00.000Z", payload: { heartRate: { beatsPerMinute: 62 } } },
    ];
    const archive = await encodeHealthArchive({
      userId: "user-1",
      provider: "google_health",
      dataType: "heart-rate",
      rangeStart: "2026-02-27T00:00:00.000Z",
      rangeEnd: "2026-02-28T00:00:00.000Z",
      rows,
    });
    const restored = await decodeHealthArchive(archive.object);

    expect(restored.rows).toEqual(rows);
    expect(restored.header.rowCount).toBe(2);
    expect(restored.contentSha256).toBe(archive.contentSha256);
    expect(restored.objectSha256).toBe(archive.objectSha256);
    expect(sha256(restored.content)).toBe(archive.contentSha256);
  });

  it("uses closed-open UTC days so archives never overlap", () => {
    expect(utcDayRange("2026-08-23T22:30:00.000Z")).toEqual({
      start: "2026-08-23T00:00:00.000Z",
      end: "2026-08-24T00:00:00.000Z",
    });
  });
});

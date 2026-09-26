import { describe, expect, it } from "vitest";

import { assistantAttachmentMetadataSchema, assistantObservationSchema, assistantQueryManifestSchema } from "./contracts";

const observation = {
  metric: "steps", value: 0, unit: "steps", availability: "observed", coverage: 1,
  measuredAt: null, importedAt: null, freshness: "current",
  provenance: { source: "health_source", provider: null, algorithmVersion: null },
} as const;

describe("assistant persistence contracts", () => {
  it("preserves explicit zero and rejects contradictory missing values", () => {
    expect(assistantObservationSchema.parse(observation).value).toBe(0);
    expect(() => assistantObservationSchema.parse({ ...observation, availability: "missing", freshness: "missing" })).toThrow();
    expect(() => assistantObservationSchema.parse({ ...observation, value: null })).toThrow();
  });

  it("requires pagination completeness and cursors to agree", () => {
    const manifest = {
      dataset: "daily_health", requestedPeriod: { from: "2026-09-20", to: "2026-09-21" },
      coveredPeriod: null, timezone: "Europe/Zurich", totalItems: 2, returnedItems: 1,
      totalKnown: true, hasMore: true, nextCursor: "signed-cursor", complete: false, generatedAt: "2026-09-21T10:00:00.000Z",
    };
    expect(assistantQueryManifestSchema.parse(manifest)).toMatchObject({ hasMore: true, complete: false });
    expect(() => assistantQueryManifestSchema.parse({ ...manifest, nextCursor: null })).toThrow();
    expect(() => assistantQueryManifestSchema.parse({ ...manifest, complete: true })).toThrow();
  });

  it("accepts only bounded image metadata with matching extensions", () => {
    const metadata = {
      objectPath: "assistant/user-1/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.png",
      mediaType: "image/png", byteSize: 1024, sha256: "a".repeat(64), purpose: "context",
    };
    expect(assistantAttachmentMetadataSchema.parse(metadata)).toMatchObject({ mediaType: "image/png" });
    expect(() => assistantAttachmentMetadataSchema.parse({ ...metadata, mediaType: "image/jpeg" })).toThrow();
    expect(() => assistantAttachmentMetadataSchema.parse({ ...metadata, byteSize: 15_728_641 })).toThrow();
    expect(() => assistantAttachmentMetadataSchema.parse({ ...metadata, objectPath: "assistant/user-1/../secret.png" })).toThrow();
  });
});

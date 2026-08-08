import { describe, expect, it } from "vitest";

import { coalesceWebhookJobs, mergeWebhookRange } from "./webhook-jobs";

describe("Google Health webhook job coalescing", () => {
  it("combines events for the same user, connection and data type", () => {
    const jobs = coalesceWebhookJobs([
      { eventId: "first", userId: "user", connectionId: "connection", dataType: "steps", rangeStart: "2026-08-08T12:41:00.000Z", rangeEnd: "2026-08-08T12:55:00.000Z" },
      { eventId: "second", userId: "user", connectionId: "connection", dataType: "steps", rangeStart: "2026-08-08T11:00:00.000Z", rangeEnd: "2026-08-08T14:00:00.000Z" },
    ]);

    expect(jobs).toEqual([{
      eventIds: ["first", "second"],
      userId: "user",
      connectionId: "connection",
      dataType: "steps",
      rangeStart: "2026-08-08T11:00:00.000Z",
      rangeEnd: "2026-08-08T14:00:00.000Z",
    }]);
  });

  it("keeps different data types in different jobs", () => {
    const jobs = coalesceWebhookJobs([
      { eventId: "steps", userId: "user", connectionId: "connection", dataType: "steps", rangeStart: "2026-08-08T11:00:00.000Z", rangeEnd: "2026-08-08T12:00:00.000Z" },
      { eventId: "heart", userId: "user", connectionId: "connection", dataType: "heart-rate", rangeStart: "2026-08-08T11:00:00.000Z", rangeEnd: "2026-08-08T12:00:00.000Z" },
    ]);

    expect(jobs.map((job) => job.dataType)).toEqual(["steps", "heart-rate"]);
  });

  it("widens an existing queued range without losing prior coverage", () => {
    expect(mergeWebhookRange(
      { range_start: "2026-08-08T10:00:00.000Z", range_end: "2026-08-08T12:00:00.000Z" },
      { rangeStart: "2026-08-08T11:00:00.000Z", rangeEnd: "2026-08-08T14:00:00.000Z" },
    )).toEqual({
      range_start: "2026-08-08T10:00:00.000Z",
      range_end: "2026-08-08T14:00:00.000Z",
    });
  });
});

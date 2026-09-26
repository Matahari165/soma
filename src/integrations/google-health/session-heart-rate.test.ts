import { describe, expect, it, vi } from "vitest";

import {
  fetchGoogleHealthSessionDailyZones,
  fetchGoogleHealthSessionHeartRate,
  GOOGLE_HEALTH_SESSION_HEART_RATE_MAX_PAGES,
  GOOGLE_HEALTH_SESSION_ZONE_MAX_PAGES,
} from "./session-heart-rate";

describe("bounded Google Health session heart-rate fetch", () => {
  it("requests only the selected session and follows available pages", async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce({ dataPoints: [{ name: "point-1" }], nextPageToken: "page-2" })
      .mockResolvedValueOnce({ dataPoints: [{ name: "point-2" }] });
    const start = new Date("2026-09-24T10:00:00.000Z");
    const end = new Date("2026-09-24T11:00:00.000Z");

    const result = await fetchGoogleHealthSessionHeartRate({ accessToken: "secret", start, end }, readPage);

    expect(result).toEqual({ dataPoints: [{ name: "point-1" }, { name: "point-2" }], pageCount: 2, limited: false });
    expect(readPage).toHaveBeenNthCalledWith(1, { accessToken: "secret", dataType: "heart-rate", start, end });
    expect(readPage).toHaveBeenNthCalledWith(2, { accessToken: "secret", dataType: "heart-rate", start, end, pageToken: "page-2" });
  });

  it("reads beyond the former three-page ceiling", async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce({ dataPoints: [{ name: "page-1" }], nextPageToken: "page-2" })
      .mockResolvedValueOnce({ dataPoints: [{ name: "page-2" }], nextPageToken: "page-3" })
      .mockResolvedValueOnce({ dataPoints: [{ name: "page-3" }], nextPageToken: "page-4" })
      .mockResolvedValueOnce({ dataPoints: [{ name: "page-4" }] });

    const result = await fetchGoogleHealthSessionHeartRate({
      accessToken: "secret",
      start: new Date("2026-09-24T10:00:00.000Z"),
      end: new Date("2026-09-24T11:00:00.000Z"),
    }, readPage);

    expect(readPage).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      dataPoints: [
        { name: "page-1" },
        { name: "page-2" },
        { name: "page-3" },
        { name: "page-4" },
      ],
      pageCount: 4,
      limited: false,
    });
  });

  it("stops at the explicit safety bound and marks the sequence incomplete", async () => {
    const readPage = vi.fn(async ({ pageToken }: { pageToken?: string }) => {
      const nextPage = pageToken ? Number(pageToken) + 1 : 2;
      return { dataPoints: [{ name: `page-${nextPage - 1}` }], nextPageToken: String(nextPage) };
    });

    const result = await fetchGoogleHealthSessionHeartRate({
      accessToken: "secret",
      start: new Date("2026-09-24T10:00:00.000Z"),
      end: new Date("2026-09-24T11:00:00.000Z"),
    }, readPage);

    expect(GOOGLE_HEALTH_SESSION_HEART_RATE_MAX_PAGES).toBe(128);
    expect(readPage).toHaveBeenCalledTimes(GOOGLE_HEALTH_SESSION_HEART_RATE_MAX_PAGES);
    expect(result.pageCount).toBe(GOOGLE_HEALTH_SESSION_HEART_RATE_MAX_PAGES);
    expect(result.limited).toBe(true);
  });

  it("fails safely when the API repeats a pagination token", async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce({ dataPoints: [{ name: "page-1" }], nextPageToken: "page-2" })
      .mockResolvedValueOnce({ dataPoints: [{ name: "page-2" }], nextPageToken: "page-2" });

    await expect(fetchGoogleHealthSessionHeartRate({
      accessToken: "secret",
      start: new Date("2026-09-24T10:00:00.000Z"),
      end: new Date("2026-09-24T11:00:00.000Z"),
    }, readPage)).rejects.toThrow("repeated a page token");
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it("refuses unbounded exercise windows before making an API call", async () => {
    const readPage = vi.fn();

    await expect(fetchGoogleHealthSessionHeartRate({
      accessToken: "secret",
      start: new Date("2026-09-24T00:00:00.000Z"),
      end: new Date("2026-09-25T00:00:01.000Z"),
    }, readPage)).rejects.toThrow("invalid or too large");
    expect(readPage).not.toHaveBeenCalled();
  });

  it("fetches daily zones with a two-page cap and a timezone-safe date margin", async () => {
    const readPage = vi.fn().mockResolvedValue({ dataPoints: [{ name: "zones" }] });
    const start = new Date("2026-09-24T00:15:00.000Z");
    const end = new Date("2026-09-24T01:15:00.000Z");

    const result = await fetchGoogleHealthSessionDailyZones({ accessToken: "secret", start, end }, readPage);

    expect(result).toMatchObject({ dataPoints: [{ name: "zones" }], pageCount: 1, limited: false });
    expect(readPage).toHaveBeenCalledWith({
      accessToken: "secret",
      dataType: "daily-heart-rate-zones",
      start: new Date("2026-09-23T00:15:00.000Z"),
      end: new Date("2026-09-25T01:15:00.000Z"),
    });
    expect(GOOGLE_HEALTH_SESSION_ZONE_MAX_PAGES).toBe(2);
  });
});

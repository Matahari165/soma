import { afterEach, describe, expect, it } from "vitest";

import {
  GOOGLE_HEALTH_DAILY_ROLLUP_TYPES,
  buildGoogleHealthAuthorizationUrl,
  createDailyRollupRange,
  createTimeFilter,
  dailyRollupPageSize,
  getGoogleHealthClientId,
} from "./client";

const originalClientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalClientId === undefined) delete process.env.GOOGLE_HEALTH_CLIENT_ID;
  else process.env.GOOGLE_HEALTH_CLIENT_ID = originalClientId;
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe("Google Health OAuth configuration", () => {
  it("builds an authorization URL from the exact production client and callback", () => {
    process.env.GOOGLE_HEALTH_CLIENT_ID = "288016413243-example.apps.googleusercontent.com";
    process.env.NEXT_PUBLIC_SITE_URL = "https://soma.example.com/";

    const url = buildGoogleHealthAuthorizationUrl("state", "challenge");

    expect(url.searchParams.get("client_id")).toBe("288016413243-example.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe("https://soma.example.com/api/health/google/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("rejects a client ID polluted by copied interface text", () => {
    process.env.GOOGLE_HEALTH_CLIENT_ID = "Copy to clipboard: 288016413243-example.apps.googleusercontent.com";

    expect(() => getGoogleHealthClientId()).toThrow("not a valid Google OAuth client ID");
  });

  it("rejects an insecure production callback", () => {
    process.env.GOOGLE_HEALTH_CLIENT_ID = "288016413243-example.apps.googleusercontent.com";
    process.env.NEXT_PUBLIC_SITE_URL = "http://soma.example.com";

    expect(() => buildGoogleHealthAuthorizationUrl("state", "challenge")).toThrow("must use HTTPS");
  });
});

describe("Google Health query contracts", () => {
  it("uses reconciled daily rollups for additive activity totals", () => {
    expect(GOOGLE_HEALTH_DAILY_ROLLUP_TYPES).toEqual(expect.arrayContaining([
      "steps",
      "active-zone-minutes",
      "active-energy-burned",
      "time-in-heart-rate-zone",
      "active-minutes",
      "distance",
      "floors",
      "sedentary-period",
      "total-calories",
    ]));
    expect(GOOGLE_HEALTH_DAILY_ROLLUP_TYPES).not.toContain("heart-rate");
    expect(GOOGLE_HEALTH_DAILY_ROLLUP_TYPES).not.toContain("sleep");
    expect(GOOGLE_HEALTH_DAILY_ROLLUP_TYPES).not.toContain("exercise");
  });

  it("keeps civil-date and physical-time filters distinct", () => {
    const start = new Date("2026-08-01T00:00:00.000Z");
    const end = new Date("2026-08-08T00:00:00.000Z");

    expect(createTimeFilter("sleep", start, end)).toBe('sleep.interval.civil_end_time >= "2026-08-01" AND sleep.interval.civil_end_time < "2026-08-08"');
    expect(createTimeFilter("daily-resting-heart-rate", start, end)).toContain('daily_resting_heart_rate.date >= "2026-08-01"');
    expect(createTimeFilter("daily-heart-rate-variability", start, end)).toContain('daily_heart_rate_variability.date >= "2026-08-01"');
    expect(createTimeFilter("heart-rate", start, end)).toContain('heart_rate.sample_time.physical_time >= "2026-08-01T00:00:00.000Z"');
  });

  it("expands a short webhook range to a valid civil-day rollup", () => {
    expect(createDailyRollupRange(
      new Date("2026-08-08T12:41:00.000Z"),
      new Date("2026-08-08T12:55:00.000Z"),
    )).toEqual({
      start: { date: { year: 2026, month: 8, day: 8 }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } },
      end: { date: { year: 2026, month: 8, day: 9 }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } },
    });
  });

  it("keeps daily rollup pagination inside Google duration limits", () => {
    expect(dailyRollupPageSize("steps")).toBe(90);
    expect(dailyRollupPageSize("active-minutes")).toBe(14);
    expect(dailyRollupPageSize("total-calories")).toBe(14);
    expect(dailyRollupPageSize("calories-in-heart-rate-zone")).toBe(14);
  });
});

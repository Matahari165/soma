import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GOOGLE_HEALTH_DAILY_ROLLUP_TYPES,
  buildGoogleHealthAuthorizationUrl,
  createDailyRollupRange,
  createTimeFilter,
  googleHealthDataPointPageSize,
  dailyRollupPageSize,
  dailyRollupRangeDays,
  getGrantedGoogleHealthDataTypes,
  getGoogleHealthClientId,
  GOOGLE_HEALTH_SCOPES,
  isGoogleHealthDataType,
  rollUpGoogleHealthSessionHeartRate,
  refreshGoogleHealthToken,
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
  it("requests one heart-rate maximum for the exact session window", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      rollupDataPoints: [{ heartRate: { beatsPerMinuteMax: 178 } }],
    }), { status: 200 }));
    try {
      const result = await rollUpGoogleHealthSessionHeartRate({
        accessToken: "test-token",
        start: new Date("2026-08-01T10:00:00.000Z"),
        end: new Date("2026-08-01T11:06:00.000Z"),
      });
      expect(result.rollupDataPoints?.[0]?.heartRate?.beatsPerMinuteMax).toBe(178);
      expect(request.mock.calls[0]?.[0]).toBe("https://health.googleapis.com/v4/users/me/dataTypes/heart-rate/dataPoints:rollUp");
      const init = request.mock.calls[0]?.[1];
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        range: { startTime: "2026-08-01T10:00:00.000Z", endTime: "2026-08-01T11:06:00.000Z" },
        windowSize: "3960s",
        pageSize: 1,
      });
    } finally {
      request.mockRestore();
    }
  });
  it("uses larger raw pages while respecting Google's session limits", () => {
    expect(googleHealthDataPointPageSize("sleep")).toBe(25);
    expect(googleHealthDataPointPageSize("exercise")).toBe(25);
    expect(googleHealthDataPointPageSize("oxygen-saturation")).toBe(1_000);
    expect(googleHealthDataPointPageSize("heart-rate")).toBe(1_000);
  });

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
    expect(createTimeFilter("exercise", start, end)).toBe('exercise.interval.civil_start_time >= "2026-08-01" AND exercise.interval.civil_start_time < "2026-08-08"');
  });

  it("includes the current civil day when the end time is not midnight", () => {
    const start = new Date("2026-08-05T12:00:00.000Z");
    const end = new Date("2026-08-12T12:00:00.000Z");

    expect(createTimeFilter("sleep", start, end)).toContain('sleep.interval.civil_end_time < "2026-08-13"');
    expect(createTimeFilter("daily-resting-heart-rate", start, end)).toContain('daily_resting_heart_rate.date < "2026-08-13"');
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
    expect(dailyRollupRangeDays("steps")).toBe(90);
    expect(dailyRollupRangeDays("active-minutes")).toBe(14);
    expect(dailyRollupRangeDays("total-calories")).toBe(14);
    expect(dailyRollupRangeDays("calories-in-heart-rate-zone")).toBe(14);
  });

  it("clamps partial-day rollups to Google's maximum civil range", () => {
    expect(createDailyRollupRange(
      new Date("2026-05-22T12:00:00.000Z"),
      new Date("2026-08-20T12:00:00.000Z"),
    )).toEqual({
      start: { date: { year: 2026, month: 5, day: 23 }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } },
      end: { date: { year: 2026, month: 8, day: 21 }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } },
    });

    expect(createDailyRollupRange(
      new Date("2026-08-06T12:00:00.000Z"),
      new Date("2026-08-20T12:00:00.000Z"),
      14,
    )).toEqual({
      start: { date: { year: 2026, month: 8, day: 7 }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } },
      end: { date: { year: 2026, month: 8, day: 21 }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } },
    });
  });
});

describe("Google Health consent", () => {
  it("queues only data types covered by granted scopes", () => {
    expect(getGrantedGoogleHealthDataTypes([GOOGLE_HEALTH_SCOPES[2]])).toEqual(["sleep"]);
  });

  it("keeps activity and physiological scopes separate", () => {
    const activity = getGrantedGoogleHealthDataTypes([GOOGLE_HEALTH_SCOPES[0]]);
    expect(activity).toContain("steps");
    expect(activity).not.toContain("daily-resting-heart-rate");
    const physiology = getGrantedGoogleHealthDataTypes([GOOGLE_HEALTH_SCOPES[1]]);
    expect(physiology).toContain("daily-heart-rate-zones");
  });

  it("rejects unknown webhook data types", () => {
    expect(isGoogleHealthDataType("steps")).toBe(true);
    expect(isGoogleHealthDataType("unknown-signal")).toBe(false);
  });
});

it("forwards cancellation to OAuth refresh while retaining its request timeout", async () => {
  const controller = new AbortController();
  process.env.GOOGLE_HEALTH_CLIENT_ID = "288016413243-example.apps.googleusercontent.com";
  const previousSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  process.env.GOOGLE_HEALTH_CLIENT_SECRET = "synthetic-test-secret";
  const fetchMock = vi.fn(async (_url, init) => {
    expect(init.signal).not.toBe(controller.signal);
    controller.abort(new Error("synthetic cancellation"));
    expect(init.signal.aborted).toBe(true);
    throw init.signal.reason;
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    await expect(refreshGoogleHealthToken("synthetic-refresh", { signal: controller.signal })).rejects.toThrow("synthetic cancellation");
  } finally {
    vi.unstubAllGlobals();
    if (previousSecret === undefined) delete process.env.GOOGLE_HEALTH_CLIENT_SECRET;
    else process.env.GOOGLE_HEALTH_CLIENT_SECRET = previousSecret;
  }
});

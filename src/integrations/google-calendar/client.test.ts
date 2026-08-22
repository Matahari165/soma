import { afterEach, describe, expect, it } from "vitest";

import { buildGoogleCalendarAuthorizationUrl } from "./client";

const original = {
  calendarId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
  healthId: process.env.GOOGLE_HEALTH_CLIENT_ID,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries({ GOOGLE_CALENDAR_CLIENT_ID: original.calendarId, GOOGLE_HEALTH_CLIENT_ID: original.healthId, NEXT_PUBLIC_SITE_URL: original.siteUrl })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Google Calendar OAuth configuration", () => {
  it("reuses the existing Google OAuth client when optional Calendar env values are empty", () => {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "";
    process.env.GOOGLE_HEALTH_CLIENT_ID = "123456-test.apps.googleusercontent.com";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    const url = buildGoogleCalendarAuthorizationUrl("state", "challenge");
    expect(url.searchParams.get("client_id")).toBe(process.env.GOOGLE_HEALTH_CLIENT_ID);
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.events.readonly");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/calendar/google/callback");
  });
});

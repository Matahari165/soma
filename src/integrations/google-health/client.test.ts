import { afterEach, describe, expect, it } from "vitest";

import { buildGoogleHealthAuthorizationUrl, getGoogleHealthClientId } from "./client";

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

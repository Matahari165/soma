import { beforeEach, describe, expect, it, vi } from "vitest";

import { cookies } from "next/headers";

import { GET } from "./route";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const setCookie = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  setCookie.mockReset();
  vi.mocked(cookies).mockResolvedValue({ set: setCookie } as never);
  process.env.NEXT_PUBLIC_SITE_URL = "https://soma.example";
  process.env.GOOGLE_HEALTH_CLIENT_ID = "google-client-id";
});

describe("Google OAuth start route", () => {
  it("redirects directly to Google's official OAuth endpoint", async () => {
    const response = await GET(new Request("https://soma.example/auth/google"));
    const location = new URL(response.headers.get("location") as string);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.pathname).toBe("/o/oauth2/v2/auth");
    expect(location.searchParams.get("client_id")).toBe("google-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe("https://soma.example/auth/callback");
    expect(location.searchParams.get("scope")).toBe("openid email profile");
  });

  it("stores short-lived state and PKCE cookies", async () => {
    const response = await GET(new Request("https://soma.example/auth/google?next=/lab"));
    const location = new URL(response.headers.get("location") as string);
    expect(setCookie).toHaveBeenCalledWith("soma_oauth_state", location.searchParams.get("state"), expect.objectContaining({ httpOnly: true, sameSite: "lax", maxAge: 600 }));
    expect(setCookie).toHaveBeenCalledWith("soma_oauth_verifier", expect.any(String), expect.any(Object));
    expect(setCookie).toHaveBeenCalledWith("soma_oauth_next", "/lab", expect.any(Object));
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("rejects an external post-login destination", async () => {
    await GET(new Request("https://soma.example/auth/google?next=https://evil.example"));
    expect(setCookie).toHaveBeenCalledWith("soma_oauth_next", "/onboarding", expect.any(Object));
  });
});


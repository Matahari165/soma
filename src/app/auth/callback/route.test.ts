import { beforeEach, describe, expect, it, vi } from "vitest";

import { cookies } from "next/headers";

import { createSession, hasCompletedOnboarding, upsertGoogleUser } from "@/lib/cloudflare/session";

import { GET } from "./route";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/cloudflare/session", () => ({
  createSession: vi.fn(),
  hasCompletedOnboarding: vi.fn(),
  upsertGoogleUser: vi.fn(),
}));

const deleteCookie = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  deleteCookie.mockReset();
  process.env.GOOGLE_HEALTH_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_HEALTH_CLIENT_SECRET = "google-client-secret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://soma.example";
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn((name: string) => ({
      soma_oauth_state: { value: "expected-state" },
      soma_oauth_verifier: { value: "verifier" },
      soma_oauth_next: { value: "/lab" },
    })[name]),
    delete: deleteCookie,
  } as never);
  vi.mocked(upsertGoogleUser).mockResolvedValue({ id: "user-1", email: "user@example.com", displayName: "User" });
  vi.mocked(createSession).mockResolvedValue({
    token: "tok-test",
    session: { id: "session-web", platform: "web", deviceName: "Web browser", createdAt: new Date().toISOString(), expiresAt: new Date().toISOString() },
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(Date.now() + 86_400_000) },
  });
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "google-subject", email: "user@example.com", name: "User" }), { status: 200 })));
});

describe("Google OAuth callback", () => {
  it("sends a returning user to the requested application page", async () => {
    vi.mocked(hasCompletedOnboarding).mockResolvedValue(true);

    const response = await GET(new Request("https://preview.soma.example/auth/callback?code=code&state=expected-state"));

    expect(response.headers.get("location")).toBe("https://soma.example/lab");
    const tokenRequest = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(new URLSearchParams(String(tokenRequest.body)).get("redirect_uri")).toBe("https://soma.example/auth/callback");
    expect(createSession).toHaveBeenCalledWith("user-1");
  });

  it("sends a new user to onboarding", async () => {
    vi.mocked(hasCompletedOnboarding).mockResolvedValue(false);

    const response = await GET(new Request("https://soma.example/auth/callback?code=code&state=expected-state"));

    expect(response.headers.get("location")).toBe("https://soma.example/onboarding");
  });

  it("does not send a returning user back to onboarding", async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => ({
        soma_oauth_state: { value: "expected-state" },
        soma_oauth_verifier: { value: "verifier" },
        soma_oauth_next: { value: "/onboarding" },
      })[name]),
      delete: deleteCookie,
    } as never);
    vi.mocked(hasCompletedOnboarding).mockResolvedValue(true);

    const response = await GET(new Request("https://soma.example/auth/callback?code=code&state=expected-state"));

    expect(response.headers.get("location")).toBe("https://soma.example/");
  });

  it("rejects an invalid state without contacting Google", async () => {
    const response = await GET(new Request("https://soma.example/auth/callback?code=code&state=wrong-state"));

    expect(new URL(response.headers.get("location") as string).searchParams.get("error")).toBe("oauth_state");
    expect(deleteCookie).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("clears the web transaction when Google reports an error", async () => {
    const response = await GET(new Request("https://soma.example/auth/callback?error=access_denied&state=expected-state"));

    expect(new URL(response.headers.get("location") as string).searchParams.get("error")).toBe("cancelled");
    expect(deleteCookie).toHaveBeenCalledTimes(3);
    expect(fetch).not.toHaveBeenCalled();
  });
});

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
  deleteCookie.mockReset();
  process.env.GOOGLE_HEALTH_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_HEALTH_CLIENT_SECRET = "google-client-secret";
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn((name: string) => ({
      soma_oauth_state: { value: "expected-state" },
      soma_oauth_verifier: { value: "verifier" },
      soma_oauth_next: { value: "/lab" },
    })[name]),
    delete: deleteCookie,
  } as never);
  vi.mocked(upsertGoogleUser).mockResolvedValue({ id: "user-1", email: "user@example.com", displayName: "User" });
  vi.mocked(createSession).mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "google-subject", email: "user@example.com", name: "User" }), { status: 200 })));
});

describe("Google OAuth callback", () => {
  it("sends a returning user to the requested application page", async () => {
    vi.mocked(hasCompletedOnboarding).mockResolvedValue(true);

    const response = await GET(new Request("https://soma.example/auth/callback?code=code&state=expected-state"));

    expect(response.headers.get("location")).toBe("https://soma.example/lab");
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
});

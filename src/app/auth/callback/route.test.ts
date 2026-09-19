import { beforeEach, describe, expect, it, vi } from "vitest";

import { cookies } from "next/headers";

import { createNativeAuthCode, createSession, hasCompletedOnboarding, upsertGoogleUser } from "@/lib/cloudflare/session";
import { encodeNativeGoogleAuthContext, NATIVE_AUTH_CONTEXT_COOKIE } from "@/lib/google-auth";

import { GET } from "./route";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/cloudflare/session", () => ({
  createSession: vi.fn(),
  createNativeAuthCode: vi.fn(),
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
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
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
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: new Date(Date.now() + 86400000),
    },
  });
  vi.mocked(createNativeAuthCode).mockResolvedValue("n".repeat(64));
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

  it("returns a short-lived one-time code to the iOS app without exposing a session token", async () => {
    const nativeContext = encodeNativeGoogleAuthContext({
      platform: "ios",
      pkceChallenge: "c".repeat(43),
      state: "s".repeat(43),
    });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => ({
        soma_native_oauth_state: { value: "expected-state" },
        soma_native_oauth_verifier: { value: "verifier" },
        [NATIVE_AUTH_CONTEXT_COOKIE]: { value: nativeContext },
      })[name]),
      delete: deleteCookie,
    } as never);
    vi.mocked(hasCompletedOnboarding).mockResolvedValue(true);

    const response = await GET(new Request("https://soma.example/auth/callback?code=code&state=expected-state"));
    const location = new URL(response.headers.get("location") as string);

    expect(location.protocol).toBe("com.soma.native.ios:");
    expect(location.host).toBe("auth");
    expect(location.pathname).toBe("/callback");
    expect(location.searchParams.get("code")).toBe("n".repeat(64));
    expect(location.searchParams.get("state")).toBe("s".repeat(43));
    expect(location.toString()).not.toContain("tok-test");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("keeps a concurrent native transaction intact when the web callback returns first", async () => {
    const nativeContext = encodeNativeGoogleAuthContext({
      platform: "ios",
      pkceChallenge: "c".repeat(43),
      state: "s".repeat(43),
    });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => ({
        soma_oauth_state: { value: "web-state" },
        soma_oauth_verifier: { value: "web-verifier" },
        soma_oauth_next: { value: "/lab" },
        soma_native_oauth_state: { value: "native-state" },
        soma_native_oauth_verifier: { value: "native-verifier" },
        [NATIVE_AUTH_CONTEXT_COOKIE]: { value: nativeContext },
      })[name]),
      delete: deleteCookie,
    } as never);
    vi.mocked(hasCompletedOnboarding).mockResolvedValue(true);

    const response = await GET(new Request("https://soma.example/auth/callback?code=code&state=web-state"));

    expect(response.headers.get("location")).toBe("https://soma.example/lab");
    expect(createSession).toHaveBeenCalledOnce();
    expect(createNativeAuthCode).not.toHaveBeenCalled();
    expect(deleteCookie).toHaveBeenCalledTimes(3);
    expect(deleteCookie).toHaveBeenCalledWith("soma_oauth_state");
    expect(deleteCookie).toHaveBeenCalledWith("soma_oauth_verifier");
    expect(deleteCookie).toHaveBeenCalledWith("soma_oauth_next");
    expect(deleteCookie).not.toHaveBeenCalledWith("soma_native_oauth_state");
    expect(deleteCookie).not.toHaveBeenCalledWith("soma_native_oauth_verifier");
    expect(deleteCookie).not.toHaveBeenCalledWith(NATIVE_AUTH_CONTEXT_COOKIE);
  });

  it("keeps a concurrent web transaction intact when the native callback returns first", async () => {
    const nativeContext = encodeNativeGoogleAuthContext({
      platform: "macos",
      pkceChallenge: "c".repeat(43),
      state: "s".repeat(43),
    });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => ({
        soma_oauth_state: { value: "web-state" },
        soma_oauth_verifier: { value: "web-verifier" },
        soma_oauth_next: { value: "/lab" },
        soma_native_oauth_state: { value: "native-state" },
        soma_native_oauth_verifier: { value: "native-verifier" },
        [NATIVE_AUTH_CONTEXT_COOKIE]: { value: nativeContext },
      })[name]),
      delete: deleteCookie,
    } as never);

    const response = await GET(new Request("https://soma.example/auth/callback?code=code&state=native-state"));
    const location = new URL(response.headers.get("location") as string);

    expect(location.protocol).toBe("com.soma.native.macos:");
    expect(createNativeAuthCode).toHaveBeenCalledOnce();
    expect(createSession).not.toHaveBeenCalled();
    expect(deleteCookie).toHaveBeenCalledTimes(3);
    expect(deleteCookie).toHaveBeenCalledWith("soma_native_oauth_state");
    expect(deleteCookie).toHaveBeenCalledWith("soma_native_oauth_verifier");
    expect(deleteCookie).toHaveBeenCalledWith(NATIVE_AUTH_CONTEXT_COOKIE);
    expect(deleteCookie).not.toHaveBeenCalledWith("soma_oauth_state");
    expect(deleteCookie).not.toHaveBeenCalledWith("soma_oauth_verifier");
    expect(deleteCookie).not.toHaveBeenCalledWith("soma_oauth_next");
  });

  it("returns cancellation to the native app without contacting Google", async () => {
    const nativeContext = encodeNativeGoogleAuthContext({
      platform: "macos",
      pkceChallenge: "c".repeat(43),
      state: "s".repeat(43),
    });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => ({
        soma_native_oauth_state: { value: "expected-state" },
        soma_native_oauth_verifier: { value: "verifier" },
        [NATIVE_AUTH_CONTEXT_COOKIE]: { value: nativeContext },
      })[name]),
      delete: deleteCookie,
    } as never);

    const response = await GET(new Request("https://soma.example/auth/callback?error=access_denied&state=expected-state"));
    const location = new URL(response.headers.get("location") as string);
    expect(location.protocol).toBe("com.soma.native.macos:");
    expect(location.searchParams.get("error")).toBe("cancelled");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a native cancellation callback with the wrong Google state", async () => {
    const nativeContext = encodeNativeGoogleAuthContext({
      platform: "ios",
      pkceChallenge: "c".repeat(43),
      state: "s".repeat(43),
    });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => ({
        soma_native_oauth_state: { value: "expected-state" },
        soma_native_oauth_verifier: { value: "verifier" },
        [NATIVE_AUTH_CONTEXT_COOKIE]: { value: nativeContext },
      })[name]),
      delete: deleteCookie,
    } as never);

    const response = await GET(new Request("https://soma.example/auth/callback?error=access_denied&state=wrong-state"));
    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("oauth_state");
    expect(deleteCookie).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not contaminate either transaction when the returned state matches neither flow", async () => {
    const nativeContext = encodeNativeGoogleAuthContext({
      platform: "ios",
      pkceChallenge: "c".repeat(43),
      state: "s".repeat(43),
    });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => ({
        soma_oauth_state: { value: "web-state" },
        soma_oauth_verifier: { value: "web-verifier" },
        soma_oauth_next: { value: "/lab" },
        soma_native_oauth_state: { value: "native-state" },
        soma_native_oauth_verifier: { value: "native-verifier" },
        [NATIVE_AUTH_CONTEXT_COOKIE]: { value: nativeContext },
      })[name]),
      delete: deleteCookie,
    } as never);

    const response = await GET(new Request("https://soma.example/auth/callback?error=access_denied&state=unknown-state"));

    expect(new URL(response.headers.get("location") as string).searchParams.get("error")).toBe("oauth_state");
    expect(deleteCookie).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an ambiguous callback when web and native states are identical", async () => {
    const nativeContext = encodeNativeGoogleAuthContext({
      platform: "ios",
      pkceChallenge: "c".repeat(43),
      state: "s".repeat(43),
    });
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn((name: string) => ({
        soma_oauth_state: { value: "same-state" },
        soma_oauth_verifier: { value: "web-verifier" },
        soma_native_oauth_state: { value: "same-state" },
        soma_native_oauth_verifier: { value: "native-verifier" },
        [NATIVE_AUTH_CONTEXT_COOKIE]: { value: nativeContext },
      })[name]),
      delete: deleteCookie,
    } as never);

    const response = await GET(new Request("https://soma.example/auth/callback?code=code&state=same-state"));

    expect(new URL(response.headers.get("location") as string).searchParams.get("error")).toBe("oauth_state");
    expect(deleteCookie).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

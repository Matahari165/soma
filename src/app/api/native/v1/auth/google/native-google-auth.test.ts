import { beforeEach, describe, expect, it, vi } from "vitest";

import { cookies } from "next/headers";

import { consumeNativeAuthCode } from "@/lib/cloudflare/db";
import { createSession, hasCompletedOnboarding, sessionUserById } from "@/lib/cloudflare/session";
import { pkceChallenge, stableHash } from "@/lib/crypto";

import { POST as exchange } from "./exchange/route";
import { GET as start } from "./route";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/cloudflare/db", () => ({ consumeNativeAuthCode: vi.fn() }));
vi.mock("@/lib/cloudflare/session", () => ({
  createSession: vi.fn(),
  hasCompletedOnboarding: vi.fn(),
  sessionUserById: vi.fn(),
}));

const setCookie = vi.fn();
const verifier = "v".repeat(48);
const code = "a".repeat(64);
const user = { id: "synthetic-user", email: null, displayName: "Test User" };
const session = { id: "synthetic-session", platform: "ios" as const, deviceName: "Test iPhone", createdAt: "2026-09-19T12:00:00.000Z", expiresAt: "2026-10-19T12:00:00.000Z" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cookies).mockResolvedValue({ set: setCookie } as never);
  process.env.GOOGLE_AUTH_CLIENT_ID = "synthetic-client-id";
  process.env.GOOGLE_AUTH_CLIENT_SECRET = "synthetic-client-secret";
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.NEXT_PUBLIC_SITE_URL = "https://soma.example";
  vi.mocked(sessionUserById).mockResolvedValue(user);
  vi.mocked(createSession).mockResolvedValue({ token: "t".repeat(43), cookieOptions: {} as never, session });
  vi.mocked(hasCompletedOnboarding).mockResolvedValue(true);
});

describe("native Google OAuth", () => {
  it("starts the existing Google provider with server PKCE and stores native context in HttpOnly cookies", async () => {
    const url = new URL("https://soma.example/api/native/v1/auth/google");
    url.searchParams.set("platform", "ios");
    url.searchParams.set("code_challenge", "c".repeat(43));
    url.searchParams.set("state", "s".repeat(43));
    const response = await start(new Request(url));
    const location = new URL(response.headers.get("location") as string);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    expect(location.searchParams.get("redirect_uri")).toBe("https://soma.example/auth/callback");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(setCookie).toHaveBeenCalledWith("soma_native_oauth_state", expect.any(String), expect.objectContaining({ httpOnly: true, maxAge: 600 }));
    expect(setCookie).toHaveBeenCalledWith("soma_native_oauth_verifier", expect.any(String), expect.objectContaining({ httpOnly: true, maxAge: 600 }));
    expect(setCookie).toHaveBeenCalledWith("soma_oauth_native_context", expect.any(String), expect.objectContaining({ httpOnly: true, maxAge: 600 }));
  });

  it("rejects malformed start parameters", async () => {
    const response = await start(new Request("https://soma.example/api/native/v1/auth/google?platform=ios"));
    expect(response.status).toBe(400);
  });

  it("atomically consumes a PKCE-bound code and creates the existing native Bearer session", async () => {
    vi.mocked(consumeNativeAuthCode).mockResolvedValue({
      code_hash: stableHash(code), user_id: user.id, platform: "ios", device_name: "Test iPhone",
      pkce_challenge: pkceChallenge(verifier), created_at: "2026-09-19T12:00:00.000Z", expires_at: "2026-09-19T12:02:00.000Z",
    });
    const response = await exchange(new Request("https://soma.example/api/native/v1/auth/google/exchange", {
      method: "POST",
      body: JSON.stringify({ code, codeVerifier: verifier, deviceName: "Test iPhone" }),
    }));
    expect(response.status).toBe(200);
    expect(consumeNativeAuthCode).toHaveBeenCalledWith(stableHash(code), pkceChallenge(verifier));
    expect(createSession).toHaveBeenCalledWith(user.id, { platform: "ios", deviceName: "Test iPhone", setCookie: false });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({ tokenType: "Bearer", user, session });
  });

  it("rejects expired, replayed, or incorrectly verified codes without creating a session", async () => {
    vi.mocked(consumeNativeAuthCode).mockResolvedValue(null);
    const response = await exchange(new Request("https://soma.example/api/native/v1/auth/google/exchange", {
      method: "POST",
      body: JSON.stringify({ code, codeVerifier: verifier, deviceName: "Test iPhone" }),
    }));
    expect(response.status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });
});

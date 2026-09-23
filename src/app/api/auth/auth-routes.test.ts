import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCredentialsUser, verifyCredentialsLogin } from "@/lib/auth-credentials";
import { createSession, hasCompletedOnboarding } from "@/lib/cloudflare/session";
import { allowAuthAttempt } from "@/lib/auth-rate-limit";

import { POST as registerHandler } from "./register/route";
import { POST as loginHandler } from "./login/route";

vi.mock("@/lib/auth-credentials", () => ({
  createCredentialsUser: vi.fn(),
  verifyCredentialsLogin: vi.fn(),
  validateEmail: vi.fn((email: string) => ({ valid: email.includes("@") })),
  validatePassword: vi.fn((pw: unknown) => typeof pw !== "string" || pw.length < 8
    ? { valid: false, error: "Password must be at least 8 characters long." }
    : pw.length > 128
      ? { valid: false, error: "Password must be at most 128 characters long." }
      : { valid: true }),
}));

vi.mock("@/lib/cloudflare/session", () => ({
  createSession: vi.fn(),
  hasCompletedOnboarding: vi.fn(),
}));

vi.mock("@/lib/auth-rate-limit", () => ({ allowAuthAttempt: vi.fn().mockResolvedValue(true), AUTH_RETRY_AFTER_SECONDS: 900 }));

describe("Auth Credentials API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(allowAuthAttempt).mockResolvedValue(true);
  });

  describe("POST /api/auth/register", () => {
    it("registers a new user with email and password without auto session", async () => {
      vi.mocked(createCredentialsUser).mockResolvedValue({
        id: "user-new",
        email: "alex@soma.fit",
        displayName: "Alex",
      });

      const request = new Request("https://soma.fit/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alex@soma.fit",
          password: "supersecretpass",
          displayName: "Alex",
        }),
      });

      const response = await registerHandler(request);
      expect(response.status).toBe(202);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(json.user).toBeUndefined();
      expect(createSession).not.toHaveBeenCalled();
    });

    it("does not reveal whether the address already exists", async () => {
      vi.mocked(createCredentialsUser).mockRejectedValue(new Error("An account with this email address already exists."));
      const response = await registerHandler(new Request("https://soma.fit/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alex@soma.fit", password: "long-enough-password" }),
      }));
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ ok: true });
    });

    it("rejects invalid emails", async () => {
      const request = new Request("https://soma.fit/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "notanemail",
          password: "supersecretpass",
        }),
      });

      const response = await registerHandler(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toMatch(/valid email/i);
    });

    it("rejects short passwords", async () => {
      const request = new Request("https://soma.fit/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alex@soma.fit",
          password: "short",
        }),
      });

      const response = await registerHandler(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toMatch(/at least 8 characters/i);
    });

    it("rejects overlong passwords with the correct limit", async () => {
      const response = await registerHandler(new Request("https://soma.fit/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alex@soma.fit", password: "x".repeat(129) }),
      }));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/at most 128 characters/i);
      expect(createCredentialsUser).not.toHaveBeenCalled();
    });

    it("does not expose storage errors to the browser", async () => {
      vi.mocked(createCredentialsUser).mockRejectedValue(new Error("private storage detail"));
      const response = await registerHandler(new Request("https://soma.fit/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alex@soma.fit", password: "long-enough-password" }),
      }));

      expect(response.status).toBe(500);
      expect((await response.json()).error).not.toContain("private storage detail");
    });
  });

  describe("POST /api/auth/login", () => {
    it("logs in an existing user with valid credentials", async () => {
      vi.mocked(verifyCredentialsLogin).mockResolvedValue({
        id: "user-existing",
        email: "alex@soma.fit",
        displayName: "Alex",
      });
      vi.mocked(createSession).mockResolvedValue({
        token: "tok-123",
        session: { id: "session-web", platform: "web", deviceName: "Web browser", createdAt: new Date().toISOString(), expiresAt: new Date().toISOString() },
        cookieOptions: {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          expires: new Date(),
        },
      });
      vi.mocked(hasCompletedOnboarding).mockResolvedValue(true);

      const request = new Request("https://soma.fit/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alex@soma.fit",
          password: "supersecretpass",
        }),
      });

      const response = await loginHandler(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(json.hasCompletedOnboarding).toBe(true);
      expect(createSession).toHaveBeenCalledWith("user-existing");
    });

    it("returns 401 on invalid credentials", async () => {
      vi.mocked(verifyCredentialsLogin).mockRejectedValue(new Error("Invalid email or password."));

      const request = new Request("https://soma.fit/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alex@soma.fit",
          password: "wrongpassword",
        }),
      });

      const response = await loginHandler(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe("Invalid email or password.");
    });

    it("limits attempts before password verification", async () => {
      vi.mocked(allowAuthAttempt).mockResolvedValue(false);
      const response = await loginHandler(new Request("https://soma.fit/api/auth/login", {
        method: "POST", body: JSON.stringify({ email: "alex@soma.fit", password: "wrong" }),
      }));
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("900");
      expect(verifyCredentialsLogin).not.toHaveBeenCalled();
    });

    it("does not report storage failures as wrong credentials", async () => {
      vi.mocked(verifyCredentialsLogin).mockRejectedValue(new Error("Credential storage unavailable."));
      const response = await loginHandler(new Request("https://soma.fit/api/auth/login", {
        method: "POST", body: JSON.stringify({ email: "alex@soma.fit", password: "somepassword" }),
      }));
      expect(response.status).toBe(503);
      expect((await response.json()).error).not.toContain("Credential storage");
    });
  });
});

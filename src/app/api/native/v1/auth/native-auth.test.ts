import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyCredentialsLogin } from "@/lib/auth-credentials";
import { createSession, deleteCurrentSession, getBearerSessionUser, hasCompletedOnboarding, listDeviceSessions, revokeDeviceSession } from "@/lib/cloudflare/session";

import { POST as login } from "./login/route";
import { DELETE as deleteSession, GET as getSession } from "./session/route";
import { GET as getSessions } from "./sessions/route";
import { DELETE as revokeSession } from "./sessions/[id]/route";

vi.mock("@/lib/auth-credentials", () => ({ verifyCredentialsLogin: vi.fn() }));
vi.mock("@/lib/cloudflare/session", () => ({
  createSession: vi.fn(),
  deleteCurrentSession: vi.fn(),
  getBearerSessionUser: vi.fn(),
  hasCompletedOnboarding: vi.fn(),
  listDeviceSessions: vi.fn(),
  revokeDeviceSession: vi.fn(),
}));

const user = { id: "user-existing", email: "user@example.test", displayName: "Test User" };
const session = { id: "5f3d636b-50f3-4cbd-a185-58a9aca74e18", platform: "ios" as const, deviceName: "Test iPhone", createdAt: "2026-09-19T12:00:00.000Z", expiresAt: "2026-10-19T12:00:00.000Z" };

describe("native authentication API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a revocable iOS bearer session for an existing account", async () => {
    vi.mocked(verifyCredentialsLogin).mockResolvedValue(user);
    vi.mocked(createSession).mockResolvedValue({ token: "t".repeat(43), cookieOptions: {} as never, session });
    vi.mocked(hasCompletedOnboarding).mockResolvedValue(true);
    const response = await login(new Request("https://soma.example/api/native/v1/auth/login", { method: "POST", body: JSON.stringify({ email: user.email, password: "valid-password", platform: "ios", deviceName: "Test iPhone" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ tokenType: "Bearer", session, user, hasCompletedOnboarding: true });
    expect(createSession).toHaveBeenCalledWith(user.id, { platform: "ios", deviceName: "Test iPhone", setCookie: false });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not reveal credential or storage failures", async () => {
    vi.mocked(verifyCredentialsLogin).mockRejectedValue(new Error("private detail"));
    const response = await login(new Request("https://soma.example/api/native/v1/auth/login", { method: "POST", body: JSON.stringify({ email: user.email, password: "valid-password", platform: "macos", deviceName: "Test Mac" }) }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Invalid email or password.");
  });

  it("reads and deletes the bearer session", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(user);
    expect((await getSession()).status).toBe(200);
    expect((await deleteSession()).status).toBe(200);
    expect(deleteCurrentSession).toHaveBeenCalledOnce();
  });

  it("lists sessions and revokes only a session owned by the current user", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(user);
    vi.mocked(listDeviceSessions).mockResolvedValue([session]);
    vi.mocked(revokeDeviceSession).mockResolvedValue(true);
    expect(await (await getSessions()).json()).toEqual({ sessions: [session] });
    const response = await revokeSession(new Request("https://soma.example", { method: "DELETE" }), { params: Promise.resolve({ id: session.id }) });
    expect(response.status).toBe(200);
    expect(revokeDeviceSession).toHaveBeenCalledWith(user.id, session.id);
  });

  it("rejects unauthenticated session access", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(null);
    expect((await getSession()).status).toBe(401);
    expect((await getSessions()).status).toBe(401);
  });
});

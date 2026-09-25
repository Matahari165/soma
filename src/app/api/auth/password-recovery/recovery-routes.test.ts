import { beforeEach, describe, expect, it, vi } from "vitest";

import { findCredentialsByEmail } from "@/lib/auth-credentials";
import { completePasswordRecovery, sendPasswordRecoveryEmail, verifiedRecoveryIdentity } from "@/lib/auth-recovery";
import { allowRecoveryAttempt } from "@/lib/auth-rate-limit";

import { POST as requestRecovery } from "./request/route";
import { POST as completeRecovery } from "./complete/route";

vi.mock("@/lib/auth-credentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-credentials")>()),
  findCredentialsByEmail: vi.fn(),
}));
vi.mock("@/lib/auth-recovery", () => ({
  sendPasswordRecoveryEmail: vi.fn(),
  verifiedRecoveryIdentity: vi.fn(),
  completePasswordRecovery: vi.fn(),
}));
vi.mock("@/lib/auth-rate-limit", () => ({ allowRecoveryAttempt: vi.fn(), RECOVERY_RETRY_AFTER_SECONDS: 3600 }));

const root = "https://soma.example";
function request(path: string, body: unknown, authorization?: string) {
  return new Request(`${root}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify(body),
  });
}

describe("password recovery routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(allowRecoveryAttempt).mockResolvedValue(true);
  });

  it("returns the same response for an unknown and a known address", async () => {
    vi.mocked(findCredentialsByEmail).mockResolvedValueOnce(null).mockResolvedValueOnce({
      user_id: "synthetic-user", email: "owner@example.invalid", password_hash: "a".repeat(64), salt: "b".repeat(32), created_at: "", updated_at: "",
    });
    const path = "/api/auth/password-recovery/request";
    const unknown = await requestRecovery(request(path, { email: "missing@example.invalid" }));
    const known = await requestRecovery(request(path, { email: " OWNER@EXAMPLE.INVALID " }));
    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    expect(await unknown.json()).toEqual(await known.json());
    expect(sendPasswordRecoveryEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordRecoveryEmail).toHaveBeenCalledWith("owner@example.invalid");
  });

  it("does not reveal an email provider failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(findCredentialsByEmail).mockResolvedValue({
      user_id: "synthetic-user", email: "owner@example.invalid", password_hash: "a".repeat(64), salt: "b".repeat(32), created_at: "", updated_at: "",
    });
    vi.mocked(sendPasswordRecoveryEmail).mockRejectedValue(new Error("private provider detail"));
    const response = await requestRecovery(request("/api/auth/password-recovery/request", { email: "owner@example.invalid" }));
    expect(response.status).toBe(202);
    expect(JSON.stringify(await response.json())).not.toContain("private provider detail");
    expect(console.error).toHaveBeenCalledWith("[auth/recovery] request failed");
    vi.mocked(console.error).mockRestore();
  });

  it("checks a verified token before changing a password and rejects replay", async () => {
    const path = "/api/auth/password-recovery/complete";
    const auth = `Bearer ${"a".repeat(120)}`;
    vi.mocked(verifiedRecoveryIdentity).mockResolvedValueOnce(null).mockResolvedValue("00000000-0000-4000-8000-000000000001");
    vi.mocked(completePasswordRecovery).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const invalid = await completeRecovery(request(path, { password: "new-private-password" }, auth));
    expect(invalid.status).toBe(401);
    expect(completePasswordRecovery).not.toHaveBeenCalled();
    const valid = await completeRecovery(request(path, { password: "new-private-password" }, auth));
    expect(valid.status).toBe(200);
    const replay = await completeRecovery(request(path, { password: "new-private-password" }, auth));
    expect(replay.status).toBe(401);
  });
});

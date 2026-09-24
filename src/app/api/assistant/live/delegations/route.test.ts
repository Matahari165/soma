import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: state.getCurrentUser }));

import { POST } from "./route";

const validBody = JSON.stringify({ sessionToken: "a".repeat(32), delegationId: "delegation-1", transcript: "Bonjour Soma." });

function request(origin: string, host = "localhost:54354") {
  return new Request("http://localhost:3001/api/assistant/live/delegations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, Host: host },
    body: validBody,
  });
}

describe("assistant Live delegation route", () => {
  beforeEach(() => {
    state.getCurrentUser.mockResolvedValue({ id: "user-1" });
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SOMA_LOCAL_PREVIEW", "true");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("OPENAI_LIVE_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("accepts the local proxy Origin and reaches the delegation service", async () => {
    const response = await POST(request("http://localhost:54354"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "assistant_live_not_configured" });
  });

  it("rejects a cross-origin delegation before service execution", async () => {
    const response = await POST(request("https://attacker.example"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "invalid_origin" });
  });
});

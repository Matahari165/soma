import { afterEach, describe, expect, it } from "vitest";

import { POST } from "./route";

describe("Google Health webhook verification", () => {
  afterEach(() => {
    delete process.env.GOOGLE_HEALTH_WEBHOOK_SECRET;
  });

  it("returns 201 for the authorized verification handshake", async () => {
    process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = "Bearer test-secret";
    const response = await POST(new Request("https://soma.example/api/health/webhook", {
      method: "POST",
      headers: {
        authorization: "Bearer test-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ type: "verification" }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ verified: true });
  });

  it("rejects the unauthenticated verification challenge", async () => {
    process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = "Bearer test-secret";
    const response = await POST(new Request("https://soma.example/api/health/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "verification" }),
    }));

    expect(response.status).toBe(401);
  });
});

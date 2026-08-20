import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/google-health/webhook-signature", () => ({ verifyGoogleHealthWebhookSignature: vi.fn().mockResolvedValue(false) }));

import { POST } from "./route";

describe("Google Health webhook verification", () => {
  afterEach(() => {
    delete process.env.GOOGLE_HEALTH_WEBHOOK_SECRET;
    vi.clearAllMocks();
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

  it("rejects unsigned data notifications before queueing them", async () => {
    process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = "Bearer test-secret";
    const response = await POST(new Request("https://soma.example/api/health/webhook", {
      method: "POST",
      headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({ data: { healthUserId: "health-user", dataType: "steps", operation: "UPSERT" } }),
    }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Invalid webhook signature." });
  });

  it("rejects unknown data types at the boundary", async () => {
    process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = "Bearer test-secret";
    const response = await POST(new Request("https://soma.example/api/health/webhook", {
      method: "POST",
      headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({ data: { healthUserId: "health-user", dataType: "made-up", operation: "UPSERT" } }),
    }));
    expect(response.status).toBe(400);
  });

  it("rejects a data notification without an allowlisted data type", async () => {
    process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = "Bearer test-secret";
    const response = await POST(new Request("https://soma.example/api/health/webhook", {
      method: "POST",
      headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({ data: { healthUserId: "health-user", operation: "UPSERT" } }),
    }));
    expect(response.status).toBe(400);
  });
});

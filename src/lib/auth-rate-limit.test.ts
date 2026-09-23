import { beforeEach, describe, expect, it, vi } from "vitest";

import { consumeAuthAttempt } from "@/lib/cloudflare/db";
import { allowAuthAttempt } from "./auth-rate-limit";

vi.mock("@/lib/cloudflare/db", () => ({ consumeAuthAttempt: vi.fn() }));

describe("auth attempt limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    vi.mocked(consumeAuthAttempt).mockResolvedValue(true);
  });

  it("uses the same keyed hash for normalized email addresses", async () => {
    const request = new Request("https://soma.fit/api/auth/login");
    await allowAuthAttempt(request, " Alex@Soma.fit ");
    await allowAuthAttempt(request, "alex@soma.fit");
    const keys = vi.mocked(consumeAuthAttempt).mock.calls.map((call) => call[0]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toContain("alex");
  });

  it("applies the shared IP limit when Vercel provides a verified address", async () => {
    const request = new Request("https://soma.fit/api/auth/login", {
      headers: { "x-vercel-forwarded-for": "192.0.2.10" },
    });
    vi.mocked(consumeAuthAttempt).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await allowAuthAttempt(request, "alex@soma.fit")).toBe(false);
    expect(vi.mocked(consumeAuthAttempt).mock.calls[1][0]).toMatch(/^ip:[a-f0-9]{64}$/);
  });
});

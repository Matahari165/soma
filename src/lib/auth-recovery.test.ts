import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseRequest } from "@/lib/cloudflare/db-supabase";
import { completePasswordRecovery, sendPasswordRecoveryEmail, verifiedRecoveryIdentity } from "./auth-recovery";

vi.mock("@/lib/cloudflare/db-supabase", () => ({ createSupabaseRequest: vi.fn() }));

describe("Supabase email recovery", () => {
  const previous = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    site: process.env.NEXT_PUBLIC_SITE_URL,
  };

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://supabase.example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-server-key";
    process.env.NEXT_PUBLIC_SITE_URL = "https://soma.example";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const [name, value] of [
      ["SUPABASE_URL", previous.url],
      ["SUPABASE_SERVICE_ROLE_KEY", previous.key],
      ["NEXT_PUBLIC_SITE_URL", previous.site],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("sends a link to the fixed Soma recovery page", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await sendPasswordRecoveryEmail("owner@example.invalid");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://supabase.example/auth/v1/otp?redirect_to=https%3A%2F%2Fsoma.example%2Flogin%3Freset%3D1");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "owner@example.invalid", create_user: true });
  });

  it("requires Supabase to confirm the bearer token and email", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "synthetic-auth-id", email_confirmed_at: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "synthetic-auth-id", email_confirmed_at: "2026-09-25T00:00:00Z" }), { status: 200 }));
    expect(await verifiedRecoveryIdentity("synthetic-token")).toBeNull();
    expect(await verifiedRecoveryIdentity("synthetic-token")).toBe("synthetic-auth-id");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer synthetic-token" });
  });

  it("passes only a digest of the bearer token to the atomic database operation", async () => {
    const rpc = vi.fn().mockResolvedValue(true);
    vi.mocked(createSupabaseRequest).mockReturnValue(rpc);
    const token = "synthetic-access-token";
    expect(await completePasswordRecovery("00000000-0000-4000-8000-000000000001", token, "private-password-value")).toBe(true);
    const [path, init] = rpc.mock.calls[0];
    expect(path).toBe("rpc/complete_soma_password_recovery");
    const payload = JSON.parse(String(init.body));
    expect(payload.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.p_password_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.p_salt).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(payload)).not.toContain(token);
    expect(JSON.stringify(payload)).not.toContain("private-password-value");
  });
});

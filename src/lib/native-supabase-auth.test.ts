import { afterEach, describe, expect, it, vi } from "vitest";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { parseVerifiedGoogleIdentity, resolveSomaUserForGoogleIdentity } from "@/lib/native-supabase-auth";

afterEach(() => vi.unstubAllGlobals());

describe("native Supabase Google identity", () => {
  it("uses the verified Google subject and keeps profile metadata optional", () => {
    expect(parseVerifiedGoogleIdentity({
      id: "00000000-0000-4000-8000-000000000001",
      email: "fallback@example.test",
      identities: [{
        id: "google-fallback",
        provider: "google",
        identity_data: { sub: "google-subject", email: "verified@example.test", full_name: "Test User" },
      }],
    })).toEqual({
      authUserId: "00000000-0000-4000-8000-000000000001",
      googleSubject: "google-subject",
      email: "verified@example.test",
      name: "Test User",
      picture: undefined,
    });
  });

  it("rejects a Supabase user without a Google identity", () => {
    expect(parseVerifiedGoogleIdentity({
      id: "00000000-0000-4000-8000-000000000001",
      email: "credentials@example.test",
      identities: [{ provider: "email", identity_data: { sub: "email-user" } }],
    })).toBeNull();
  });

  it("does not mistake an internal identity row ID for a Google subject", () => {
    expect(parseVerifiedGoogleIdentity({
      id: "00000000-0000-4000-8000-000000000001",
      identities: [{ provider: "google", id: "internal-row-id" }],
    })).toBeNull();
  });

  it("reads identity mappings from the protected physical table", async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(new URL(String(input)).pathname).toBe("/rest/v1/soma_auth_identities");
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    });
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await createCloudflareAdminClient().from("soma_auth_identities")
        .select("soma_user_id").eq("provider", "google").eq("provider_subject", "subject").maybeSingle();
      expect(result.error).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  it("links a verified identity through the atomic database function", async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new URL(String(input)).pathname).toBe("/rest/v1/rpc/link_native_google_identity");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        p_auth_user_id: "00000000-0000-4000-8000-000000000001",
        p_google_subject: "google-subject",
      });
      return new Response(JSON.stringify("soma-user-id"), { status: 200, headers: { "content-type": "application/json" } });
    });
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await resolveSomaUserForGoogleIdentity({
        authUserId: "00000000-0000-4000-8000-000000000001",
        googleSubject: "google-subject",
      })).toBe("soma-user-id");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });
});

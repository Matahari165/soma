import { afterEach, describe, expect, it, vi } from "vitest";
import { loadHeartRateReferenceForUser, saveHeartRateReferenceForUser } from "./heart-rate-reference";

vi.mock("@/lib/env", () => ({ isLocalPreviewMode: () => false }));

describe("heart-rate reference through the real Supabase JSON adapter", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("persists and clears the reference while preserving the owner profile", async () => {
    vi.stubEnv("SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-test-key");
    let stored = { table_name: "profiles", row_key: "synthetic-row", user_id: "synthetic-user", json_data: { user_id: "synthetic-user", date_of_birth: "1986-02-01", timezone: "Europe/Paris", height_cm: 180 } as Record<string, unknown> };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/rest/v1/soma_rows");
      if (url.searchParams.get("table_name") !== "eq.profiles") return new Response(JSON.stringify([]), { status: 200 });
      expect(url.searchParams.get("user_id")).toBe("eq.synthetic-user");
      if (init?.method === "PATCH") stored = JSON.parse(String(init.body));
      return new Response(JSON.stringify([stored]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect((await saveHeartRateReferenceForUser("synthetic-user", 190)).maximumHeartRate).toEqual({ bpm: 190, source: "personal" });
    expect((await loadHeartRateReferenceForUser("synthetic-user")).personalBpm).toBe(190);
    expect(stored.json_data).toMatchObject({ timezone: "Europe/Paris", height_cm: 180, maximum_heart_rate_bpm: 190 });
    await saveHeartRateReferenceForUser("synthetic-user", null);
    expect(stored.json_data.maximum_heart_rate_bpm).toBeNull();
    expect((await loadHeartRateReferenceForUser("synthetic-user", "2026-09-26")).maximumHeartRate).toEqual({ bpm: 180, source: "age_estimate" });
  });
});

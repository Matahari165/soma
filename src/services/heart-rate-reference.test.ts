import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  profile: { date_of_birth: "1986-02-01", maximum_heart_rate_bpm: 200 as number | null },
  owners: [] as string[], writes: [] as Array<Record<string, unknown>>, missing: false,
}));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: () => false }));
vi.mock("@/lib/cloudflare/db", () => ({ createCloudflareAdminClient: () => ({ from: () => {
  const query = {
    select: () => query, eq: (_column: string, value: string) => { state.owners.push(value); return query; },
    update: (value: Record<string, unknown>) => { state.writes.push(value); return query; },
    maybeSingle: async () => ({ data: state.profile, error: null }),
    single: async () => ({ data: state.missing ? null : { user_id: "synthetic-user" }, error: null }),
  };
  return query;
} }) }));
import { loadHeartRateReferenceForUser, saveHeartRateReferenceForUser } from "./heart-rate-reference";

describe("personal heart-rate reference storage", () => {
  beforeEach(() => { state.owners = []; state.writes = []; state.missing = false; state.profile.maximum_heart_rate_bpm = 200; });
  it("reads only the owner profile and resolves a personal reference", async () => {
    const result = await loadHeartRateReferenceForUser("synthetic-user", "2026-09-26");
    expect(state.owners).toEqual(["synthetic-user"]);
    expect(result.maximumHeartRate).toEqual({ bpm: 200, source: "personal" });
  });
  it("uses an estimate when the personal value is absent", async () => {
    state.profile.maximum_heart_rate_bpm = null;
    expect((await loadHeartRateReferenceForUser("synthetic-user", "2026-09-26")).maximumHeartRate).toEqual({ bpm: 180, source: "age_estimate" });
  });
  it("changes only the reference column on the owner profile", async () => {
    await saveHeartRateReferenceForUser("synthetic-user", 190);
    expect(state.writes).toEqual([{ maximum_heart_rate_bpm: 190 }]);
    expect(state.owners).toEqual(["synthetic-user", "synthetic-user"]);
  });
  it("does not report success if no profile row was updated", async () => {
    state.missing = true;
    await expect(saveHeartRateReferenceForUser("synthetic-user", 190)).rejects.toThrow("could not be saved");
  });
});

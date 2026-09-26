import { afterEach, describe, expect, it, vi } from "vitest";
import { healthDataCoverageAggregate, healthSyncDiagnostics, latestHealthRecordsByType, sessionUserForHash } from "./db";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function setupFetch(response: unknown) {
  vi.stubEnv("SUPABASE_URL", "https://test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-key");
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => { void url; return new Response(JSON.stringify(response), { status: 200 }); });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
describe("Live session join", () => {
  it("authenticates through one live joined query with expiry filtering", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-01-01T00:00:00Z"));
    const user = { id: "synthetic", email: null, display_name: "Fixture" };
    const fetchMock = setupFetch([{ expires_at: "2026-01-02T00:00:00Z", user }]);
    expect(await sessionUserForHash("fixture-hash", "2026-01-01T00:00:00Z", 4000)).toEqual(user);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("select")).toContain("soma_users!inner");
    expect(url.searchParams.get("expires_at")).toBe("gt.2026-01-01T00:00:00Z");
  });
  it("rejects a session that expires while the joined request is in flight", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-01-02T00:00:00Z"));
    setupFetch([{ expires_at: "2026-01-01T00:00:01Z", user: { id: "synthetic" } }]);
    expect(await sessionUserForHash("fixture-hash", "2026-01-01T00:00:00Z", 4000)).toBeNull();
  });
  it.each([{ response: [] }, { response: [{ expires_at: "invalid", user: { id: "synthetic" } }] }, { response: [{ expires_at: "2025-01-01T00:00:00Z", user: { id: "synthetic" } }] }])("rejects missing, malformed and expired sessions", async ({ response }) => {
    setupFetch(response);
    expect(await sessionUserForHash("fixture-hash", "2026-01-01T00:00:00Z", 4000)).toBeNull();
  });
});
describe("Health aggregate RPCs", () => {
  it("loads latest types and diagnostics without fetching record history", async () => {
    const fetchMock = setupFetch([]);
    await latestHealthRecordsByType("synthetic", ["sleep"]);
    await healthSyncDiagnostics("synthetic", ["sleep"]);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://test/rest/v1/rpc/soma_latest_health_records", "https://test/rest/v1/rpc/soma_health_sync_diagnostics",
    ]);
  });
  it("uses compatibility coverage only when the aggregate is not installed", async () => {
    setupFetch(null);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Could not find the function public.soma_health_data_coverage in the schema cache" }), { status: 404 })));
    expect(await healthDataCoverageAggregate("synthetic", ["sleep"])).toBeNull();
  });
  it("does not hide aggregate database failures behind a costly history scan", async () => {
    setupFetch(null);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "canceling statement due to statement timeout" }), { status: 500 })));
    await expect(healthDataCoverageAggregate("synthetic", ["sleep"])).rejects.toThrow("statement timeout");
  });
});

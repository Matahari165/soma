import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: { id: "test-user" } as { id: string } | null, load: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/services/health-analytics", () => ({ allImportedExercises: state.load }));
import { GET } from "./route";

describe("activity history endpoint", () => {
  beforeEach(() => { state.user = { id: "test-user" }; state.load.mockReset().mockResolvedValue([]); });
  it("requires authentication before reading health data", async () => {
    state.user = null;
    expect((await GET(new Request("http://localhost/api/health/activity-history?from=2026-01-01&to=2026-01-01"))).status).toBe(401);
    expect(state.load).not.toHaveBeenCalled();
  });
  it.each([
    "from=2026-02-30&to=2026-03-01",
    "from=2026-09-01&to=2026-01-01",
    "from=2026-01-01&to=2026-09-01",
    "from=2026-01-01",
  ])("rejects invalid or unbounded ranges: %s", async (query) => {
    expect((await GET(new Request(`http://localhost/api/health/activity-history?${query}`))).status).toBe(400);
    expect(state.load).not.toHaveBeenCalled();
  });
  it("uses the authenticated owner and keeps six-month results private", async () => {
    const response = await GET(new Request("http://localhost/api/health/activity-history?from=2026-03-30&to=2026-09-25&user_id=other-user"));
    expect(response.status).toBe(200);
    expect(state.load).toHaveBeenCalledWith("test-user", { from: "2026-03-30", to: "2026-09-25" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("returns an error rather than an empty history if storage fails", async () => {
    state.load.mockRejectedValue(new Error("storage unavailable"));
    expect((await GET(new Request("http://localhost/api/health/activity-history?from=2026-09-01&to=2026-09-25"))).status).toBe(503);
  });
});

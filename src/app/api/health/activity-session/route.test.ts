import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "test-user" } as { id: string } | null,
  filters: [] as Array<[string, string]>,
  telemetry: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => state.user }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: () => false }));
vi.mock("@/services/activity-session-telemetry", () => ({ getActivitySessionTelemetry: state.telemetry }));
vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: (column: string, value: string) => { state.filters.push([column, value]); return query; },
        maybeSingle: async () => ({ data: { start_time: "2026-09-24T06:00:00.000Z", end_time: "2026-09-24T07:00:00.000Z", civil_date: "2026-09-24" }, error: null }),
      };
      return query;
    },
  }),
}));

import { GET } from "./route";

describe("workout telemetry access", () => {
  beforeEach(() => {
    state.user = { id: "test-user" };
    state.filters.length = 0;
    state.telemetry.mockReset();
    state.telemetry.mockResolvedValue({ maxHeartRateBpm: null, heartRateSampleCount: 0 });
  });

  it("requires authentication before reading workout records", async () => {
    state.user = null;
    const response = await GET(new Request("https://soma.example/api/health/activity-session?record=workout"));
    expect(response.status).toBe(401);
    expect(state.filters).toEqual([]);
    expect(state.telemetry).not.toHaveBeenCalled();
  });

  it("looks up only this user's Google Health workout before loading readings", async () => {
    const response = await GET(new Request("https://soma.example/api/health/activity-session?record=users%2Fme%2Fworkout"));
    expect(response.status).toBe(200);
    expect(state.filters).toEqual([
      ["user_id", "test-user"],
      ["provider", "google_health"],
      ["data_type", "exercise"],
      ["source_record_id", "users/me/workout"],
    ]);
    expect(state.telemetry).toHaveBeenCalledWith("test-user", {
      startTime: "2026-09-24T06:00:00.000Z",
      endTime: "2026-09-24T07:00:00.000Z",
      date: "2026-09-24",
    });
  });
});

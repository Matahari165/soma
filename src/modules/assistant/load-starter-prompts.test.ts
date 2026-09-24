import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  confirmed: null as null | { goalSet: { id: string }; goals: unknown[] },
  metrics: [] as Array<Record<string, unknown>>,
  meals: [] as Array<Record<string, unknown>>,
  errorTable: "" as string,
  calls: [] as Array<{ table: string; filters: Array<[string, unknown]>; limit: number }>,
}));

vi.mock("./repository", () => ({ loadConfirmedGoalContext: vi.fn(async () => state.confirmed) }));
vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: () => ({
    from: (table: string) => {
      const call = { table, filters: [] as Array<[string, unknown]>, limit: 0 };
      state.calls.push(call);
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { call.filters.push([field, value]); return query; },
        gte: (field: string, value: unknown) => { call.filters.push([field, value]); return query; },
        order: () => query,
        limit: async (value: number) => {
          call.limit = value;
          return { data: table === "meals" ? state.meals : state.metrics, error: state.errorTable === table ? { message: "failed" } : null };
        },
      };
      return query;
    },
  }),
}));

import { loadAssistantStarterPrompts } from "./load-starter-prompts";

describe("assistant starter data", () => {
  beforeEach(() => {
    state.confirmed = null;
    state.metrics = [];
    state.meals = [];
    state.errorTable = "";
    state.calls = [];
  });

  it("keeps onboarding visible only until goals have been confirmed", async () => {
    expect(await loadAssistantStarterPrompts("user-1", new Date("2026-09-24T12:00:00Z"))).toEqual({ calibrated: false, prompts: [] });
    expect(state.calls).toHaveLength(0);
  });

  it("uses bounded, user-scoped records and never treats missing values as observations", async () => {
    state.confirmed = { goalSet: { id: "set-1" }, goals: [] };
    state.metrics = [{ metric_date: "2026-09-23", running_distance_km: null, running_duration_minutes: null, exercise_minutes: 0, zone_minutes: null, sleep_minutes: 0, hrv_ms: null, resting_heart_rate: null }];
    const result = await loadAssistantStarterPrompts("user-1", new Date("2026-09-24T12:00:00Z"));
    expect(result.calibrated).toBe(true);
    expect(result.prompts).toHaveLength(3);
    expect(result.prompts.some((prompt) => prompt.id === "running" || prompt.id === "effort")).toBe(false);
    expect(result.prompts.some((prompt) => prompt.id === "sleep")).toBe(true);
    expect(state.calls.map((call) => call.limit)).toEqual([45, 45]);
    expect(state.calls.every((call) => call.filters.some(([field, value]) => field === "user_id" && value === "user-1"))).toBe(true);
    expect(state.calls.find((call) => call.table === "meals")?.filters).toContainEqual(["status", "confirmed"]);
  });

  it("fails closed when record lookup fails", async () => {
    state.confirmed = { goalSet: { id: "set-1" }, goals: [] };
    state.errorTable = "meals";
    await expect(loadAssistantStarterPrompts("user-1")).rejects.toThrow("Assistant starter data could not be loaded.");
  });

  it("does not suggest nutrition from skipped meal slots", async () => {
    state.confirmed = { goalSet: { id: "set-1" }, goals: [] };
    state.meals = [{ meal_date: "2026-09-23", entry_state: "skipped" }];
    const result = await loadAssistantStarterPrompts("user-1", new Date("2026-09-24T12:00:00Z"));
    expect(result.prompts.some((prompt) => prompt.id === "nutrition")).toBe(false);
  });
});

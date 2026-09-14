import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createAdmin: vi.fn(),
  deleteR2: vi.fn(),
  responses: [] as unknown[],
  tables: [] as string[],
}));

vi.mock("@/lib/cloudflare/db", () => ({ createCloudflareAdminClient: state.createAdmin }));
vi.mock("@/lib/r2", () => ({ deleteR2MealPhotoObject: state.deleteR2 }));

import { requeueStaleMealAnalyses, selectLatestMealAnalysis, type AnalysisRow } from "./meals";

function analysis(overrides: Partial<AnalysisRow>): AnalysisRow {
  return {
    id: "analysis-id",
    user_id: "user-id",
    meal_id: "meal-id",
    status: "completed",
    provider: "xai",
    model: "grok",
    result: { summary: "ok" } as AnalysisRow["result"],
    error: null,
    source_photo_ids: [],
    created_at: "2026-08-31T10:00:00.000Z",
    completed_at: "2026-08-31T10:00:01.000Z",
    ...overrides,
  };
}

describe("meal analysis selection", () => {
  it("falls back to the latest completed result after a failed retry", () => {
    const completed = analysis({ id: "completed", created_at: "2026-08-31T10:00:00.000Z" });
    const failed = analysis({ id: "failed", status: "failed", result: null, error: "provider unavailable", created_at: "2026-08-31T11:00:00.000Z" });
    expect(selectLatestMealAnalysis([completed, failed], true)?.id).toBe("completed");
    expect(selectLatestMealAnalysis([completed, failed], false)?.id).toBe("failed");
  });

  it("requeues abandoned workers without turning a read into a terminal failure", async () => {
    state.responses.push({ data: [{ id: "stale-analysis" }], error: null });
    state.createAdmin.mockImplementation(() => {
      const query: Record<string, unknown> = {
        update: () => query,
        eq: () => query,
        or: () => query,
        select: () => query,
        is: () => query,
        lt: () => query,
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(state.responses.shift() ?? { data: null, error: null }).then(resolve, reject),
      };
      return { from: () => query };
    });

    await expect(requeueStaleMealAnalyses()).resolves.toBe(1);
  });
});

describe("meal photo deletion", () => {
  beforeEach(() => {
    state.responses = [];
    state.tables = [];
    state.deleteR2.mockReset();
    state.createAdmin.mockImplementation(() => ({
      from(table: string) {
        state.tables.push(table);
        const response = state.responses.shift() ?? { data: null, error: null };
        const query: Record<string, unknown> = {
          select: () => query,
          eq: () => query,
          order: () => query,
          maybeSingle: () => query,
          delete: () => query,
          upsert: () => query,
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(response).then(resolve, reject),
        };
        return query;
      },
    }));
  });

  it("restores metadata when R2 deletion fails so the operation can be retried", async () => {
    const photo = { id: "photo-1", user_id: "user-1", meal_id: "meal-1", object_path: "meal-photos/user/meal/photo.jpg", mime_type: "image/jpeg", bytes: 10, origin: "homemade", created_at: "2026-08-31T10:00:00.000Z" };
    state.responses.push({ data: photo, error: null }, { data: [], error: null }, { data: photo, error: null });
    state.deleteR2.mockRejectedValue(new Error("R2 unavailable"));
    const { deletePhoto } = await import("./meals");
    await expect(deletePhoto("user-1", "meal-1", "photo-1")).rejects.toThrow("retry");
    expect(state.tables).toEqual(["meal_photos", "meal_photos", "meal_photos"]);
  });

  it("preserves a stored null feeling instead of falling back to the meal row", async () => {
    state.responses.push(
      { data: { id: "meal-1", user_id: "user-1", meal_date: "2026-08-31", meal_type: "lunch", status: "confirmed", mouth_warmth_intensity: 4, stomach_overfull_intensity: 2, created_at: "2026-08-31T10:00:00.000Z", updated_at: "2026-08-31T10:00:00.000Z" }, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ id: "feeling-1", user_id: "user-1", meal_id: "meal-1", mouth_warmth_intensity: null, stomach_overfull_intensity: 2, created_at: "2026-08-31T10:00:00.000Z", updated_at: "2026-08-31T10:00:00.000Z" }], error: null },
    );
    const { findMeal } = await import("./meals");
    await expect(findMeal("user-1", "meal-1")).resolves.toMatchObject({ mouthWarmthIntensity: null, stomachOverfullIntensity: 2 });
  });
});

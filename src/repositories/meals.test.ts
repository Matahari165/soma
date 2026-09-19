import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createAdmin: vi.fn(),
  deleteR2: vi.fn(),
  responses: [] as unknown[],
  tables: [] as string[],
  selectors: [] as Array<{ table: string; columns: string }>,
  filters: [] as Array<{ table: string; field: string; values: unknown }>,
}));

vi.mock("@/lib/cloudflare/db", () => ({ createCloudflareAdminClient: state.createAdmin }));
vi.mock("@/lib/r2", () => ({ deleteR2MealPhotoObject: state.deleteR2 }));

import { listMeals, requeueStaleMealAnalyses, selectLatestMealAnalysis, type AnalysisRow } from "./meals";

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
    state.selectors = [];
    state.filters = [];
    state.deleteR2.mockReset();
    state.createAdmin.mockImplementation(() => ({
      from(table: string) {
        state.tables.push(table);
        const response = state.responses.shift() ?? { data: null, error: null };
        const query: Record<string, unknown> = {
          select: (columns: string) => {
            state.selectors.push({ table, columns });
            return query;
          },
          eq: () => query,
          gte: () => query,
          lte: () => query,
          in: (field: string, values: unknown[]) => {
            state.filters.push({ table, field, values });
            return query;
          },
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

  it("limits list children to the returned meal ids and selects only list columns", async () => {
    state.responses.push(
      { data: [{ id: "meal-current", user_id: "user-1", meal_date: "2026-09-15", meal_type: "lunch", status: "confirmed", entry_state: "skipped", created_at: "2026-09-15T12:00:00.000Z", updated_at: "2026-09-15T12:00:00.000Z" }], error: null },
      { data: [{ id: "photo-current", user_id: "user-1", meal_id: "meal-current", origin: "homemade", object_path: "private/photo", mime_type: "image/jpeg", bytes: 10, created_at: "2026-09-15T12:01:00.000Z" }], error: null },
      { data: [], error: null },
      { data: [], error: null },
    );

    const meals = await listMeals("user-1", { from: "2026-09-01", to: "2026-09-15" });

    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject({ id: "meal-current", status: "confirmed", entryState: "skipped", photos: [{ id: "photo-current" }] });
    expect(state.tables).toEqual(["meals", "meal_photos", "meal_analyses", "meal_feelings"]);
    expect(state.filters).toEqual([
      { table: "meal_photos", field: "meal_id", values: ["meal-current"] },
      { table: "meal_analyses", field: "meal_id", values: ["meal-current"] },
      { table: "meal_feelings", field: "meal_id", values: ["meal-current"] },
    ]);
    expect(state.selectors).toEqual([
      expect.objectContaining({ table: "meals", columns: "id,user_id,meal_date,meal_type,note,status,entry_state,mouth_warmth_intensity,stomach_overfull_intensity,created_at,updated_at" }),
      expect.objectContaining({ table: "meal_photos", columns: "id,user_id,meal_id,origin,object_path,mime_type,bytes,created_at,filename,comment,storage_status,purged_at" }),
      expect.objectContaining({ table: "meal_analyses", columns: "id,user_id,meal_id,status,provider,model,result,error,error_code,analysis_request_id,source_revision,source_fingerprint,source_photo_ids,created_at,completed_at,pipeline" }),
      expect.objectContaining({ table: "meal_feelings", columns: "id,user_id,meal_id,mouth_warmth_intensity,stomach_overfull_intensity,created_at,updated_at" }),
    ]);
  });

  it("does not read child tables when the date range has no meals", async () => {
    state.responses.push({ data: [], error: null });

    await expect(listMeals("user-1", { from: "2026-09-02", to: "2026-09-02" })).resolves.toEqual([]);

    expect(state.tables).toEqual(["meals"]);
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
    await expect(findMeal("user-1", "meal-1")).resolves.toMatchObject({ entryState: "recorded", mouthWarmthIntensity: null, stomachOverfullIntensity: 2 });
  });
});

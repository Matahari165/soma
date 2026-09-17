import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  after: vi.fn(),
  getCurrentUser: vi.fn(),
  isLocalPreviewMode: vi.fn(),
  parseMealMultipart: vi.fn(),
  findMeal: vi.fn(),
  updateMealRecord: vi.fn(),
  enqueueMealAnalysis: vi.fn(),
  processNextMealAnalysis: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: state.after };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: state.getCurrentUser }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: state.isLocalPreviewMode }));
vi.mock("@/services/meal-api", () => ({ mealToLegacyApi: (meal: unknown) => meal }));
vi.mock("@/services/meal-multipart", () => ({
  MealMultipartError: class MealMultipartError extends Error {},
  parseMealMultipart: state.parseMealMultipart,
}));
vi.mock("@/services/meal-preview", () => ({
  addPreviewMealPhotos: vi.fn(),
  analyzePreviewMeal: vi.fn(),
  createPreviewMeal: vi.fn(),
  findPreviewMeal: vi.fn(),
  updatePreviewMeal: vi.fn(),
}));
vi.mock("@/services/meals", () => ({
  addMealPhotos: vi.fn(),
  createMeal: vi.fn(),
  enqueueMealAnalysis: state.enqueueMealAnalysis,
  findMeal: state.findMeal,
  processNextMealAnalysis: state.processNextMealAnalysis,
  updateMealPhotoOrigins: vi.fn(),
  updateMealRecord: state.updateMealRecord,
  MealServiceError: class MealServiceError extends Error {
    constructor(readonly code: string, message: string, readonly diagnosticCode?: string) { super(message); }
  },
}));

import { POST } from "./route";

const meal = {
  id: "meal-new",
  userId: "user-1",
  mealDate: "2026-09-17",
  mealType: "lunch",
  note: "Repas test",
  status: "draft",
  mouthWarmthIntensity: null,
  stomachOverfullIntensity: null,
  createdAt: "2026-09-17T09:00:00.000Z",
  updatedAt: "2026-09-17T09:00:00.000Z",
  photos: [],
  analysis: null,
};

describe("legacy meal analysis production dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const form = new FormData();
    form.set("mealId", meal.id);
    form.set("date", meal.mealDate);
    form.set("slot", meal.mealType);
    form.set("note", meal.note);
    form.set("origins", "[]");
    form.set("photoUrls", "[]");
    state.getCurrentUser.mockResolvedValue({ id: "user-1" });
    state.isLocalPreviewMode.mockReturnValue(false);
    state.parseMealMultipart.mockResolvedValue(form);
    state.findMeal.mockResolvedValue(meal);
    state.updateMealRecord.mockResolvedValue(meal);
    state.enqueueMealAnalysis.mockResolvedValue({ analysis: { id: "analysis-new", status: "queued" }, queued: true, fresh: true });
    state.processNextMealAnalysis.mockResolvedValue({ processed: true });
  });

  it("dispatches the exact job returned by enqueue", async () => {
    const response = await POST(new Request("https://soma.example/api/meals/analyze", {
      method: "POST",
      headers: { "x-analysis-request-id": "analysis-request-legacy" },
    }));

    expect(response.status).toBe(202);
    expect(state.after).toHaveBeenCalledTimes(1);
    const callback = state.after.mock.calls[0]?.[0] as (() => Promise<void>) | undefined;
    expect(callback).toBeTypeOf("function");
    await callback?.();
    expect(state.processNextMealAnalysis).toHaveBeenCalledWith({ userId: "user-1", analysisId: "analysis-new" });
  });
});

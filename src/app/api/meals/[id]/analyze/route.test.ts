import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isLocalPreviewMode: vi.fn(),
  enqueueMealAnalysis: vi.fn(),
  findMeal: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: state.getCurrentUser }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: state.isLocalPreviewMode }));
vi.mock("@/services/meals", () => ({
  enqueueMealAnalysis: state.enqueueMealAnalysis,
  findMeal: state.findMeal,
  MealServiceError: class MealServiceError extends Error {},
}));

import { GET, POST } from "./route";

const meal = {
  id: "12345678-1234-1234-1234-123456789012",
  userId: "user-1",
  mealDate: "2026-09-14",
  mealType: "lunch" as const,
  note: "Riz",
  status: "draft" as const,
  mouthWarmthIntensity: null,
  stomachOverfullIntensity: null,
  createdAt: "2026-09-14T10:00:00.000Z",
  updatedAt: "2026-09-14T10:00:00.000Z",
  photos: [],
  analysis: {
    id: "analysis-1",
    mealId: "12345678-1234-1234-1234-123456789012",
    status: "queued" as const,
    provider: "xai",
    model: "grok-4.6",
    result: null,
    error: null,
    sourcePhotoIds: [],
    createdAt: "2026-09-14T10:01:00.000Z",
    completedAt: null,
  },
};

describe("meal analysis durable HTTP contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.getCurrentUser.mockResolvedValue({ id: "user-1" });
    state.isLocalPreviewMode.mockReturnValue(false);
    state.enqueueMealAnalysis.mockResolvedValue({ analysis: meal.analysis, fresh: true, queued: true });
    state.findMeal.mockResolvedValue(meal);
  });

  it("returns accepted without waiting for XAI", async () => {
    const response = await POST(
      new Request("https://soma.example/api/meals/12345678-1234-1234-1234-123456789012/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", "x-analysis-request-id": "analysis-request-5" },
        body: JSON.stringify({ force: false, idempotencyKey: "analysis-request-5" }),
      }),
      { params: Promise.resolve({ id: meal.id }) },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ queued: true, analysis: { status: "queued" }, meal: { analysis: { status: "queued" } } });
    expect(state.enqueueMealAnalysis).toHaveBeenCalledWith("user-1", meal.id, expect.objectContaining({ analysisRequestId: "analysis-request-5" }));
  });

  it("exposes the durable status for a returning client", async () => {
    const response = await GET(new Request("https://soma.example/api/meals/12345678-1234-1234-1234-123456789012/analyze"), { params: Promise.resolve({ id: meal.id }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ analysis: { status: "queued" }, meal: { analysis: { status: "queued" } } });
  });
});

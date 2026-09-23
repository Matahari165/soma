import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MealVisionError, type MealVisionProvider } from "@/integrations/xai/meal-vision";

const state = vi.hoisted(() => ({
  findMeal: vi.fn(),
  findLatestMealAnalysis: vi.fn(),
  findMealAnalysisByRequestId: vi.fn(),
  findActiveMealAnalysis: vi.fn(),
  findQueuedMealAnalysis: vi.fn(),
  insertMealAnalysis: vi.fn(),
  listQueuedMealAnalyses: vi.fn(),
  updateMealAnalysis: vi.fn(),
  updateMeal: vi.fn(),
  listFailedMealAnalyses: vi.fn(),
  listMealPhotoRowsForReconciliation: vi.fn(),
  findRelevantMealRecipeReferences: vi.fn(),
  analyzeMealInputWithFallback: vi.fn(),
  getDurableMealAnalysisRetryProvider: vi.fn<() => MealVisionProvider | null>(() => null),
  claimCloudflareLock: vi.fn(),
  claimCloudflareLockWithToken: vi.fn(),
  refreshCloudflareLockWithToken: vi.fn(),
  releaseCloudflareLock: vi.fn(),
  releaseCloudflareLockWithToken: vi.fn(),
  getR2MealPhotoObject: vi.fn(),
}));

vi.mock("@/repositories/meals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/repositories/meals")>()),
  findMeal: state.findMeal,
  findLatestMealAnalysis: state.findLatestMealAnalysis,
  findMealAnalysisByRequestId: state.findMealAnalysisByRequestId,
  findActiveMealAnalysis: state.findActiveMealAnalysis,
  findQueuedMealAnalysis: state.findQueuedMealAnalysis,
  insertMealAnalysis: state.insertMealAnalysis,
  listQueuedMealAnalyses: state.listQueuedMealAnalyses,
  updateMealAnalysis: state.updateMealAnalysis,
  updateMeal: state.updateMeal,
  listFailedMealAnalyses: state.listFailedMealAnalyses,
  listMealPhotoRowsForReconciliation: state.listMealPhotoRowsForReconciliation,
}));
vi.mock("@/lib/cloudflare/db", () => ({
  claimCloudflareLock: state.claimCloudflareLock,
  claimCloudflareLockWithToken: state.claimCloudflareLockWithToken,
  refreshCloudflareLockWithToken: state.refreshCloudflareLockWithToken,
  releaseCloudflareLock: state.releaseCloudflareLock,
  releaseCloudflareLockWithToken: state.releaseCloudflareLockWithToken,
}));
vi.mock("@/lib/r2", () => ({ deleteR2MealPhotoObject: vi.fn(), getR2MealPhotoObject: state.getR2MealPhotoObject, mealPhotoObjectPath: vi.fn(), putR2MealPhotoObject: vi.fn() }));
vi.mock("@/services/meal-recipes", () => ({ findRelevantMealRecipeReferences: state.findRelevantMealRecipeReferences }));
vi.mock("@/integrations/meal-analysis/provider-chain", () => ({
  analyzeMealInputWithFallback: state.analyzeMealInputWithFallback,
  getDurableMealAnalysisRetryProvider: state.getDurableMealAnalysisRetryProvider,
  getConfiguredMealAnalysisProvider: vi.fn(() => ({ name: "xai", model: "grok-4.6" })),
}));

import { enqueueMealAnalysis, loadMealPhotoForAnalysis, processNextMealAnalysis } from "./meals";

const mealId = "12345678-1234-1234-1234-123456789012";
const meal = {
  id: mealId,
  userId: "user-1",
  mealDate: "2026-09-14",
  mealType: "lunch" as const,
  note: "Riz et légumes",
  status: "draft" as const,
  mouthWarmthIntensity: null,
  stomachOverfullIntensity: null,
  createdAt: "2026-09-14T10:00:00.000Z",
  updatedAt: "2026-09-14T10:00:00.000Z",
  photos: [],
  analysis: null,
};
const queuedAnalysis = {
  id: "analysis-queued",
  mealId,
  status: "queued" as const,
  provider: "xai",
  model: "grok-4.6",
  result: null,
  error: null,
  errorCode: null,
  sourcePhotoIds: [],
  createdAt: "2026-09-14T10:01:00.000Z",
  completedAt: null,
};
const canonicalResult = {
  summary: "Riz et légumes.",
  dishType: null,
  calorieAnalysis: null,
  foods: [{ name: "Riz", preparation: null, portion: "1 bol", estimatedGrams: null, calories: { low: 300, likely: 400, high: 500 }, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "low" as const }],
  totals: { calories: { low: 300, likely: 400, high: 500 }, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
  confidence: "low" as const,
  uncertainties: ["Estimation à partir de la description."],
};

function rowToAnalysis(values: Record<string, unknown>) {
  return {
    ...queuedAnalysis,
    status: values.status as "queued" | "running" | "completed" | "failed",
    result: (values.result as typeof canonicalResult | null) ?? null,
    error: (values.error as string | null) ?? null,
    errorCode: (values.error_code as string | null) ?? null,
  };
}

describe("durable meal analysis jobs", () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.clearAllMocks();
    state.findMeal.mockResolvedValue(meal);
    state.findLatestMealAnalysis.mockResolvedValue(null);
    state.findMealAnalysisByRequestId.mockResolvedValue(null);
    state.findActiveMealAnalysis.mockResolvedValue(null);
    state.findQueuedMealAnalysis.mockResolvedValue(null);
    state.findRelevantMealRecipeReferences.mockResolvedValue([]);
    state.insertMealAnalysis.mockResolvedValue(queuedAnalysis);
    state.claimCloudflareLock.mockResolvedValue(true);
    state.claimCloudflareLockWithToken.mockResolvedValue("lease-token");
    state.refreshCloudflareLockWithToken.mockResolvedValue(true);
    state.releaseCloudflareLockWithToken.mockResolvedValue(undefined);
    state.updateMealAnalysis.mockImplementation(async (_userId: string, _id: string, values: Record<string, unknown>) => rowToAnalysis(values));
    state.updateMeal.mockResolvedValue(null);
    state.listFailedMealAnalyses.mockResolvedValue([]);
    state.listMealPhotoRowsForReconciliation.mockResolvedValue([]);
  });

  it("accepts a request durably without contacting the provider", async () => {
    const result = await enqueueMealAnalysis("user-1", mealId, { analysisRequestId: "analysis-request-1", provider: { name: "xai", model: "grok-4.6" } });

    expect(result).toMatchObject({ queued: true, analysis: { status: "queued" } });
    expect(state.insertMealAnalysis).toHaveBeenCalledWith(expect.objectContaining({ status: "queued", analysis_request_id: "analysis-request-1", attempts: 0, heartbeat_at: null, lease_token: null }));
    expect(state.analyzeMealInputWithFallback).not.toHaveBeenCalled();
  });

  it("replays the same idempotency key instead of inserting a second job", async () => {
    const requestId = "analysis-request-2";
    await enqueueMealAnalysis("user-1", mealId, { analysisRequestId: requestId, provider: { name: "xai", model: "grok-4.6" } });
    state.findMealAnalysisByRequestId.mockResolvedValue(queuedAnalysis);

    const repeated = await enqueueMealAnalysis("user-1", mealId, { analysisRequestId: requestId, force: true, provider: { name: "xai", model: "grok-4.6" } });

    expect(repeated).toMatchObject({ fresh: false, queued: true, analysis: { id: queuedAnalysis.id } });
    expect(state.insertMealAnalysis).toHaveBeenCalledTimes(1);
  });

  it("resumes a requeued job with a new attempt and commits success", async () => {
    state.listQueuedMealAnalyses.mockResolvedValue([{
      id: queuedAnalysis.id,
      user_id: "user-1",
      meal_id: mealId,
      status: "queued",
      provider: "xai",
      model: "grok-4.6",
      source_photo_ids: [],
      source_note: "Riz et légumes",
      source_meal_date: meal.mealDate,
      source_meal_type: meal.mealType,
      source_correction: null,
      attempts: 1,
      analysis_request_id: "analysis-request-3",
      created_at: "2026-09-14T10:01:00.000Z",
    }]);
    state.analyzeMealInputWithFallback.mockResolvedValue({ provider: "xai", model: "grok-4.6", result: canonicalResult });

    const result = await processNextMealAnalysis();

    expect(result).toMatchObject({ processed: true, analysis: { status: "completed" } });
    expect(state.updateMealAnalysis).toHaveBeenNthCalledWith(1, "user-1", queuedAnalysis.id, expect.objectContaining({ status: "running", attempts: 2, lease_token: "lease-token" }), "queued");
    expect(state.updateMealAnalysis).toHaveBeenLastCalledWith("user-1", queuedAnalysis.id, expect.objectContaining({ status: "completed", result: canonicalResult, lease_token: null }), "running", "lease-token");
    expect(state.analyzeMealInputWithFallback).toHaveBeenCalledWith(expect.objectContaining({ mealType: "lunch", mealDate: "2026-09-14", note: "Riz et légumes", images: [] }), { requestId: "analysis-request-3", allowFallback: false });
  });

  it("uses the configured alternate provider on a response-schema retry", async () => {
    const candidate = {
      id: queuedAnalysis.id,
      user_id: "user-1",
      meal_id: mealId,
      status: "queued",
      provider: "xai",
      model: "grok-4.6",
      source_photo_ids: [],
      source_note: "Riz et légumes",
      source_meal_date: meal.mealDate,
      source_meal_type: meal.mealType,
      source_correction: null,
      attempts: 0,
      analysis_request_id: "analysis-request-schema-retry",
      created_at: "2026-09-14T10:01:00.000Z",
    };
    const alternateProvider = { name: "openai", model: "gpt-5.6-sol", analyze: vi.fn() } as unknown as MealVisionProvider;
    state.listQueuedMealAnalyses.mockResolvedValueOnce([candidate]);
    state.analyzeMealInputWithFallback.mockRejectedValueOnce(new MealVisionError("response_schema_error", "schema mismatch", { retryable: true }));

    const firstAttempt = await processNextMealAnalysis();

    expect(firstAttempt).toMatchObject({ processed: true, analysis: { status: "failed" } });
    expect(state.analyzeMealInputWithFallback).toHaveBeenCalledTimes(1);
    expect(state.getDurableMealAnalysisRetryProvider).toHaveBeenLastCalledWith(0);

    state.getDurableMealAnalysisRetryProvider.mockReturnValue(alternateProvider);
    state.listFailedMealAnalyses.mockResolvedValueOnce([{
      ...candidate,
      status: "failed",
      attempts: 1,
      error_code: "response_schema_error",
      retry_after_at: new Date(Date.now() - 1_000).toISOString(),
      completed_at: new Date().toISOString(),
    }]);
    state.listQueuedMealAnalyses.mockResolvedValueOnce([{
      ...candidate,
      attempts: 1,
      error_code: "response_schema_error",
    }]);
    state.analyzeMealInputWithFallback.mockResolvedValueOnce({ provider: "openai", model: "gpt-5.6-sol", result: canonicalResult });

    const secondAttempt = await processNextMealAnalysis();

    expect(secondAttempt).toMatchObject({ processed: true, analysis: { status: "completed" } });
    expect(state.getDurableMealAnalysisRetryProvider).toHaveBeenLastCalledWith(1);
    expect(state.analyzeMealInputWithFallback).toHaveBeenCalledTimes(2);
    expect(state.analyzeMealInputWithFallback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ retryHint: expect.stringContaining("semantic validation") }),
      expect.objectContaining({ provider: alternateProvider, allowFallback: false, requestId: "analysis-request-schema-retry" }),
    );
  });

  it("processes the freshly enqueued job instead of an older FIFO job", async () => {
    const targeted = {
      id: "analysis-new",
      user_id: "user-1",
      meal_id: mealId,
      status: "queued",
      provider: "xai",
      model: "grok-4.6",
      source_photo_ids: [],
      source_note: "Riz et légumes",
      source_meal_date: meal.mealDate,
      source_meal_type: meal.mealType,
      source_correction: null,
      attempts: 0,
      analysis_request_id: "analysis-request-targeted",
      created_at: "2026-09-17T10:00:00.000Z",
    };
    state.findQueuedMealAnalysis.mockResolvedValue(targeted);
    state.listQueuedMealAnalyses.mockResolvedValue([{ ...targeted, id: "analysis-old", created_at: "2026-09-17T09:00:00.000Z" }]);
    state.analyzeMealInputWithFallback.mockResolvedValue({ provider: "xai", model: "grok-4.6", result: canonicalResult });

    const result = await processNextMealAnalysis({ userId: "user-1", analysisId: targeted.id });

    expect(result).toMatchObject({ processed: true, analysis: { status: "completed" } });
    expect(state.findQueuedMealAnalysis).toHaveBeenCalledWith("user-1", targeted.id);
    expect(state.listQueuedMealAnalyses).not.toHaveBeenCalled();
    expect(state.updateMealAnalysis).toHaveBeenNthCalledWith(1, "user-1", targeted.id, expect.objectContaining({ status: "running" }), "queued");
  });

  it("does not fall back to another queued job when the targeted job is unavailable", async () => {
    state.findQueuedMealAnalysis.mockResolvedValue(null);

    await expect(processNextMealAnalysis({ userId: "user-1", analysisId: "analysis-finished" })).resolves.toEqual({ processed: false, analysis: null });

    expect(state.listQueuedMealAnalyses).not.toHaveBeenCalled();
    expect(state.analyzeMealInputWithFallback).not.toHaveBeenCalled();
  });

  it("persists a provider failure as a terminal failed state", async () => {
    state.listQueuedMealAnalyses.mockResolvedValue([{
      id: queuedAnalysis.id,
      user_id: "user-1",
      meal_id: mealId,
      status: "queued",
      provider: "xai",
      model: "grok-4.6",
      source_photo_ids: [],
      source_note: "Riz et légumes",
      source_meal_date: meal.mealDate,
      source_meal_type: meal.mealType,
      source_correction: null,
      attempts: 0,
      analysis_request_id: "analysis-request-4",
      created_at: "2026-09-14T10:01:00.000Z",
    }]);
    state.analyzeMealInputWithFallback.mockRejectedValue(new Error("provider unavailable"));

    const result = await processNextMealAnalysis();

    expect(result).toMatchObject({ processed: true, analysis: { status: "failed", error: "L’analyse du repas a échoué. Réessaie." } });
    expect(state.updateMealAnalysis).toHaveBeenLastCalledWith("user-1", queuedAnalysis.id, expect.objectContaining({ status: "failed", error_code: "unknown_analysis_error", lease_token: null }), "running", "lease-token");
  });

  it("does not advertise another automatic retry after the final durable attempt", async () => {
    state.listQueuedMealAnalyses.mockResolvedValue([{
      id: queuedAnalysis.id,
      user_id: "user-1",
      meal_id: mealId,
      status: "queued",
      provider: "xai",
      model: "grok-4.6",
      source_photo_ids: [],
      source_note: "Riz et légumes",
      source_meal_date: meal.mealDate,
      source_meal_type: meal.mealType,
      source_correction: null,
      attempts: 2,
      analysis_request_id: "analysis-request-final-attempt",
      created_at: "2026-09-14T10:01:00.000Z",
    }]);
    state.analyzeMealInputWithFallback.mockRejectedValue(new MealVisionError("provider_timeout", "timeout", { retryable: true }));

    await processNextMealAnalysis();

    expect(state.updateMealAnalysis).toHaveBeenLastCalledWith("user-1", queuedAnalysis.id, expect.objectContaining({
      status: "failed",
      error_code: "provider_timeout",
      retry_after_at: null,
    }), "running", "lease-token");
  });

  it("aborts a photo download that never returns", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    state.getR2MealPhotoObject.mockImplementation((_path: string, candidateSignal?: AbortSignal) => {
      signal = candidateSignal;
      return new Promise(() => undefined);
    });

    const loading = loadMealPhotoForAnalysis("meals/photo.jpg", 25);
    const rejected = expect(loading).rejects.toMatchObject({ code: "unavailable", diagnosticCode: "storage_error" });
    await vi.advanceTimersByTimeAsync(25);

    await rejected;
    expect(signal?.aborted).toBe(true);
  });
});

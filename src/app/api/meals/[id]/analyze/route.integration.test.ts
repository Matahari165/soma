import { beforeEach, describe, expect, it, vi } from "vitest";

import { MealVisionError } from "@/integrations/xai/meal-vision";

const state = vi.hoisted(() => {
  const mealId = "12345678-1234-1234-1234-123456789012";
  const photoIds = [
    "22345678-1234-1234-1234-123456789012",
    "32345678-1234-1234-1234-123456789012",
  ] as const;
  const rows: Array<Record<string, unknown>> = [];
  const callbacks: Array<() => Promise<void>> = [];
  const providerInputs: Array<Record<string, unknown>> = [];
  const photoObjects = new Map<string, Uint8Array>([
    ["meals/123/photo-one.jpg", new Uint8Array([1, 2, 3])],
    ["meals/123/photo-two.jpg", new Uint8Array([4, 5, 6])],
  ]);

  const meal = {
    id: mealId,
    userId: "user-1",
    mealDate: "2026-09-14",
    mealType: "lunch" as const,
    note: "Deux photos du déjeuner",
    status: "draft" as const,
    entryState: "recorded" as const,
    mouthWarmthIntensity: null,
    stomachOverfullIntensity: null,
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
    photos: [
      {
        id: photoIds[0],
        mealId,
        origin: "homemade" as const,
        objectPath: "meals/123/photo-one.jpg",
        mimeType: "image/jpeg" as const,
        bytes: 3,
        filename: "photo-one.jpg",
        comment: "Vue du plat",
        createdAt: "2026-09-14T10:00:01.000Z",
        storageStatus: "available" as const,
        purgedAt: null,
      },
      {
        id: photoIds[1],
        mealId,
        origin: "homemade" as const,
        objectPath: "meals/123/photo-two.jpg",
        mimeType: "image/jpeg" as const,
        bytes: 3,
        filename: "photo-two.jpg",
        comment: "Vue de l'accompagnement",
        createdAt: "2026-09-14T10:00:02.000Z",
        storageStatus: "available" as const,
        purgedAt: null,
      },
    ],
    analysis: null,
    lastSuccessfulAnalysis: null,
  };

  let failNextProviderCall = false;
  let lockCounter = 0;

  function reset() {
    rows.splice(0);
    callbacks.splice(0);
    providerInputs.splice(0);
    failNextProviderCall = false;
    lockCounter = 0;
  }

  function rowToRecord(row: Record<string, unknown>) {
    return {
      id: String(row.id),
      mealId: String(row.meal_id),
      status: row.status,
      provider: String(row.provider),
      model: String(row.model),
      analysisRequestId: (row.analysis_request_id as string | null) ?? null,
      sourceRevision: (row.source_revision as string | null) ?? null,
      result: (row.result as Record<string, unknown> | null) ?? null,
      error: (row.error as string | null) ?? null,
      errorCode: (row.error_code as string | null) ?? null,
      sourceFingerprint: (row.source_fingerprint as string | null) ?? null,
      sourcePhotoIds: Array.isArray(row.source_photo_ids) ? row.source_photo_ids : [],
      createdAt: String(row.created_at),
      completedAt: (row.completed_at as string | null) ?? null,
    };
  }

  function readMeal() {
    const latest = rows.at(-1);
    const successful = [...rows].reverse().find((row) => row.status === "completed" && row.result);
    return {
      ...meal,
      analysis: latest ? rowToRecord(latest) : null,
      lastSuccessfulAnalysis: successful ? rowToRecord(successful) : null,
    };
  }

  function canonicalResult(summary = "Déjeuner analysé à partir de deux photos.") {
    const range = (low: number, likely: number, high: number) => ({ low, likely, high });
    return {
      summary,
      dishType: "assiette composée",
      calorieAnalysis: null,
      foods: [
        {
          id: "food-rice",
          name: "Riz",
          preparation: null,
          portion: "un bol",
          estimatedGrams: null,
          calories: range(250, 300, 350),
          proteinGrams: null,
          carbohydrateGrams: null,
          fatGrams: null,
          fiberGrams: null,
          confidence: "medium" as const,
          evidence: "visible" as const,
          evidenceSource: "photo" as const,
          evidencePhotoIds: [photoIds[0]],
        },
        {
          id: "food-salad",
          name: "Salade",
          preparation: null,
          portion: "une portion",
          estimatedGrams: null,
          calories: range(50, 80, 120),
          proteinGrams: null,
          carbohydrateGrams: null,
          fatGrams: null,
          fiberGrams: null,
          confidence: "medium" as const,
          evidence: "visible" as const,
          evidenceSource: "photo" as const,
          evidencePhotoIds: [photoIds[1]],
        },
      ],
      totals: {
        calories: range(300, 380, 470),
        proteinGrams: null,
        carbohydrateGrams: null,
        fatGrams: null,
        fiberGrams: null,
      },
      confidence: "medium" as const,
      uncertainties: ["Les quantités exactes restent estimées."],
    };
  }

  return {
    mealId,
    photoIds,
    rows,
    callbacks,
    providerInputs,
    meal,
    photoObjects,
    reset,
    canonicalResult,
    rowToRecord,
    readMeal,
    get failNextProviderCall() {
      return failNextProviderCall;
    },
    set failNextProviderCall(value: boolean) {
      failNextProviderCall = value;
    },
    getCurrentUser: vi.fn(),
    isLocalPreviewMode: vi.fn(),
    after: vi.fn((callback: () => Promise<void>) => {
      callbacks.push(callback);
    }),
    findMeal: vi.fn(async (userId: string, id: string) => (userId === "user-1" && id === mealId ? readMeal() : null)),
    findLatestMealAnalysis: vi.fn(async (userId: string, id: string) => {
      if (userId !== "user-1" || id !== mealId) return null;
      const row = rows.at(-1);
      return row ? rowToRecord(row) : null;
    }),
    findMealAnalysisByRequestId: vi.fn(async (userId: string, id: string, requestId: string) => {
      const row = rows.find((candidate) => userId === "user-1" && id === mealId && candidate.analysis_request_id === requestId);
      return row ? rowToRecord(row) : null;
    }),
    findActiveMealAnalysis: vi.fn(async (userId: string, id: string) => {
      const row = rows.find((candidate) => userId === "user-1" && id === mealId && (candidate.status === "queued" || candidate.status === "running"));
      return row ? rowToRecord(row) : null;
    }),
    findQueuedMealAnalysis: vi.fn(async (userId: string, analysisId: string) => {
      const row = rows.find((candidate) => userId === "user-1" && candidate.id === analysisId && candidate.status === "queued");
      return row ? { ...row } : null;
    }),
    listQueuedMealAnalyses: vi.fn(async () => rows.filter((row) => row.status === "queued").map((row) => ({ ...row }))),
    listFailedMealAnalyses: vi.fn(async () => rows.filter((row) => row.status === "failed").map((row) => ({ ...row }))),
    insertMealAnalysis: vi.fn(async (row: Record<string, unknown>) => {
      const persisted = { ...row, updated_at: row.updated_at ?? row.created_at };
      rows.push(persisted);
      return rowToRecord(persisted);
    }),
    updateMealAnalysis: vi.fn(async (userId: string, id: string, values: Record<string, unknown>, expectedStatus?: string, expectedLeaseToken?: string | null) => {
      const row = rows.find((candidate) => userId === "user-1" && candidate.id === id);
      if (!row || (expectedStatus && row.status !== expectedStatus) || (expectedLeaseToken && row.lease_token !== expectedLeaseToken)) {
        throw new Error("The meal analysis could not be updated.");
      }
      Object.assign(row, values, { updated_at: new Date().toISOString() });
      return rowToRecord(row);
    }),
    updateMeal: vi.fn(async () => null),
    touchMealAnalysis: vi.fn(async () => true),
    claimCloudflareLockWithToken: vi.fn(async () => `lease-${++lockCounter}`),
    refreshCloudflareLockWithToken: vi.fn(async () => true),
    releaseCloudflareLockWithToken: vi.fn(async () => undefined),
    claimCloudflareLock: vi.fn(async () => true),
    releaseCloudflareLock: vi.fn(async () => undefined),
    getR2MealPhotoObject: vi.fn(async (objectPath: string) => {
      const bytes = photoObjects.get(objectPath);
      return bytes ? { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } : null;
    }),
    findRelevantMealRecipeReferences: vi.fn(async () => []),
    analyzeMealInputWithFallback: vi.fn(async (input: Record<string, unknown>) => {
      providerInputs.push(input);
      if (failNextProviderCall) {
        failNextProviderCall = false;
        throw new MealVisionError("provider_timeout", "simulated provider timeout", { retryable: true });
      }
      return { provider: "xai", model: "grok-4.6", result: canonicalResult(providerInputs.length > 1 ? "Correction appliquée." : undefined) };
    }),
    getConfiguredMealAnalysisProvider: vi.fn(() => ({ name: "xai", model: "grok-4.6" })),
  };
});

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: state.after };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: state.getCurrentUser }));
vi.mock("@/lib/env", () => ({ isLocalPreviewMode: state.isLocalPreviewMode }));
vi.mock("@/repositories/meals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/repositories/meals")>()),
  findMeal: state.findMeal,
  findLatestMealAnalysis: state.findLatestMealAnalysis,
  findMealAnalysisByRequestId: state.findMealAnalysisByRequestId,
  findActiveMealAnalysis: state.findActiveMealAnalysis,
  findQueuedMealAnalysis: state.findQueuedMealAnalysis,
  listQueuedMealAnalyses: state.listQueuedMealAnalyses,
  listFailedMealAnalyses: state.listFailedMealAnalyses,
  insertMealAnalysis: state.insertMealAnalysis,
  updateMealAnalysis: state.updateMealAnalysis,
  updateMeal: state.updateMeal,
  touchMealAnalysis: state.touchMealAnalysis,
}));
vi.mock("@/lib/cloudflare/db", () => ({
  claimCloudflareLock: state.claimCloudflareLock,
  claimCloudflareLockWithToken: state.claimCloudflareLockWithToken,
  refreshCloudflareLockWithToken: state.refreshCloudflareLockWithToken,
  releaseCloudflareLock: state.releaseCloudflareLock,
  releaseCloudflareLockWithToken: state.releaseCloudflareLockWithToken,
}));
vi.mock("@/lib/r2", () => ({
  deleteR2MealPhotoObject: vi.fn(),
  getR2MealPhotoObject: state.getR2MealPhotoObject,
  mealPhotoObjectPath: vi.fn(),
  putR2MealPhotoObject: vi.fn(),
}));
vi.mock("@/services/meal-recipes", () => ({ findRelevantMealRecipeReferences: state.findRelevantMealRecipeReferences }));
vi.mock("@/integrations/meal-analysis/provider-chain", () => ({
  analyzeMealInputWithFallback: state.analyzeMealInputWithFallback,
  analyzeMealInputStreamWithFallback: vi.fn(),
  getConfiguredMealAnalysisProvider: state.getConfiguredMealAnalysisProvider,
}));

import { GET, POST } from "./route";
import { processNextMealAnalysis } from "@/services/meals";

const params = { params: Promise.resolve({ id: state.mealId }) };

describe("durable meal analysis route and worker integration", () => {
  beforeEach(() => {
    state.reset();
    state.getCurrentUser.mockResolvedValue({ id: "user-1" });
    state.isLocalPreviewMode.mockReturnValue(false);
    vi.clearAllMocks();
    state.getCurrentUser.mockResolvedValue({ id: "user-1" });
    state.isLocalPreviewMode.mockReturnValue(false);
  });

  it("carries a two-photo job from 202 through worker completion, correction, and polling", async () => {
    const firstResponse = await POST(
      new Request("https://soma.example/api/meals/12345678-1234-1234-1234-123456789012/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", "x-analysis-request-id": "meal-request-1" },
        body: JSON.stringify({ idempotencyKey: "meal-request-1" }),
      }),
      params,
    );

    expect(firstResponse.status).toBe(202);
    expect((await firstResponse.json()).analysis.status).toBe("queued");
    expect(state.analyzeMealInputWithFallback).not.toHaveBeenCalled();
    expect(state.callbacks).toHaveLength(1);

    const pendingPoll = await GET(
      new Request("https://soma.example/api/meals/12345678-1234-1234-1234-123456789012/analyze", { headers: { "x-analysis-request-id": "meal-request-1" } }),
      params,
    );
    expect(pendingPoll.status).toBe(200);
    expect((await pendingPoll.json()).analysis.status).toBe("queued");

    await state.callbacks[0]?.();

    expect(state.rows[0]?.status).toBe("completed");
    expect(state.providerInputs[0]?.images).toEqual([
      expect.objectContaining({ id: state.photoIds[0], mimeType: "image/jpeg" }),
      expect.objectContaining({ id: state.photoIds[1], mimeType: "image/jpeg" }),
    ]);
    expect((state.providerInputs[0]?.images as Array<{ data: ArrayBuffer }>).map((image) => image.data.byteLength)).toEqual([3, 3]);
    expect((state.rows[0]?.source_photo_ids as string[])).toEqual([...state.photoIds]);

    const firstPoll = await GET(
      new Request("https://soma.example/api/meals/12345678-1234-1234-1234-123456789012/analyze", { headers: { "x-analysis-request-id": "meal-request-1" } }),
      params,
    );
    const firstPollBody = await firstPoll.json();
    expect(firstPoll.status).toBe(200);
    expect(firstPollBody.analysis.status).toBe("completed");
    expect(firstPollBody.analysis.result.foods.map((food: { evidencePhotoIds: string[] }) => food.evidencePhotoIds[0])).toEqual([...state.photoIds]);

    const correctionResponse = await POST(
      new Request("https://soma.example/api/meals/12345678-1234-1234-1234-123456789012/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", "x-analysis-request-id": "meal-request-2" },
        body: JSON.stringify({ idempotencyKey: "meal-request-2", correction: "La salade était sans sauce." }),
      }),
      params,
    );

    expect(correctionResponse.status).toBe(202);
    await state.callbacks[1]?.();

    expect(state.rows).toHaveLength(2);
    expect(state.providerInputs[1]?.correction).toBe("La salade était sans sauce.");
    expect(state.providerInputs[1]?.previousAnalysis).toMatchObject({ summary: "Déjeuner analysé à partir de deux photos." });
    expect(state.rows[1]?.status).toBe("completed");

    const correctionPoll = await GET(
      new Request("https://soma.example/api/meals/12345678-1234-1234-1234-123456789012/analyze", { headers: { "x-analysis-request-id": "meal-request-2" } }),
      params,
    );
    expect(correctionPoll.status).toBe(200);
    expect((await correctionPoll.json()).analysis.result.summary).toBe("Correction appliquée.");
  });

  it("surfaces a retryable worker error, then requeues the durable job after backoff", async () => {
    state.failNextProviderCall = true;
    const response = await POST(
      new Request("https://soma.example/api/meals/12345678-1234-1234-1234-123456789012/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", "x-analysis-request-id": "retry-request-1" },
        body: JSON.stringify({ idempotencyKey: "retry-request-1" }),
      }),
      params,
    );
    expect(response.status).toBe(202);

    await state.callbacks[0]?.();

    expect(state.rows[0]?.status).toBe("failed");
    expect(state.rows[0]?.error_code).toBe("provider_timeout");
    expect(typeof state.rows[0]?.retry_after_at).toBe("string");

    const failedPoll = await GET(
      new Request("https://soma.example/api/meals/12345678-1234-1234-1234-123456789012/analyze", { headers: { "x-analysis-request-id": "retry-request-1" } }),
      params,
    );
    expect(failedPoll.status).toBe(200);
    expect((await failedPoll.json()).analysis).toMatchObject({ status: "failed", errorCode: "provider_timeout" });

    state.rows[0]!.retry_after_at = new Date(Date.now() - 1_000).toISOString();
    const retried = await processNextMealAnalysis();

    expect(retried).toMatchObject({ processed: true, analysis: { status: "completed" } });
    expect(state.providerInputs).toHaveLength(2);
    expect(state.rows[0]?.attempts).toBe(2);
    expect(state.rows[0]?.status).toBe("completed");

    const completedPoll = await GET(
      new Request("https://soma.example/api/meals/12345678-1234-1234-1234-123456789012/analyze", { headers: { "x-analysis-request-id": "retry-request-1" } }),
      params,
    );
    expect((await completedPoll.json()).analysis.status).toBe("completed");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const processNextMealAnalysis = vi.hoisted(() => vi.fn());
const requeueRetryableMealAnalyses = vi.hoisted(() => vi.fn());
const purgeExpiredFailedAnalysisPhotos = vi.hoisted(() => vi.fn());
const reconcileMealPhotoPurges = vi.hoisted(() => vi.fn());
const reconcileAbandonedMealPhotoUploads = vi.hoisted(() => vi.fn());
vi.mock("@/services/meals", () => ({ processNextMealAnalysis, requeueRetryableMealAnalyses, purgeExpiredFailedAnalysisPhotos, reconcileMealPhotoPurges, reconcileAbandonedMealPhotoUploads }));

import { GET } from "./route";

describe("meal analysis worker route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-test-secret";
    processNextMealAnalysis.mockResolvedValue({ processed: true, analysis: { status: "completed" } });
    requeueRetryableMealAnalyses.mockResolvedValue(0);
    purgeExpiredFailedAnalysisPhotos.mockResolvedValue(0);
    reconcileMealPhotoPurges.mockResolvedValue({ attempted: 0, purged: 0 });
    reconcileAbandonedMealPhotoUploads.mockResolvedValue({ attempted: 0, cleared: 0 });
  });

  it("requires the machine cron secret", async () => {
    const response = await GET(new Request("https://soma.example/api/cron/meal-analysis"));

    expect(response.status).toBe(401);
    expect(processNextMealAnalysis).not.toHaveBeenCalled();
  });

  it("processes one persisted job and exposes only its status", async () => {
    const response = await GET(new Request("https://soma.example/api/cron/meal-analysis", { headers: { authorization: "Bearer cron-test-secret" } }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: true, status: "completed" });
    expect(processNextMealAnalysis).toHaveBeenCalledOnce();
    expect(processNextMealAnalysis).toHaveBeenCalledWith(undefined, { retriesAlreadyScanned: true });
  });

  it("returns a retryable server error when the worker cannot run", async () => {
    processNextMealAnalysis.mockRejectedValue(new Error("storage unavailable"));

    const response = await GET(new Request("https://soma.example/api/cron/meal-analysis", { headers: { authorization: "Bearer cron-test-secret" } }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Meal analysis worker unavailable." });
  });
});

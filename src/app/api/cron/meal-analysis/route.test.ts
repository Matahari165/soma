import { beforeEach, describe, expect, it, vi } from "vitest";

const processNextMealAnalysis = vi.hoisted(() => vi.fn());
vi.mock("@/services/meals", () => ({ processNextMealAnalysis }));

import { GET } from "./route";

describe("meal analysis worker route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-test-secret";
    processNextMealAnalysis.mockResolvedValue({ processed: true, analysis: { status: "completed" } });
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
  });

  it("returns a retryable server error when the worker cannot run", async () => {
    processNextMealAnalysis.mockRejectedValue(new Error("storage unavailable"));

    const response = await GET(new Request("https://soma.example/api/cron/meal-analysis", { headers: { authorization: "Bearer cron-test-secret" } }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Meal analysis worker unavailable." });
  });
});

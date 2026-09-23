import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeMealInputWithFallback, getConfiguredMealAnalysisProvider, getMealAnalysisPipelineConfiguration } from "./provider-chain";

function structuredAnalysis(summary = "Repas test") {
  return {
    summary,
    foods: [{ name: "Riz", preparation: null, portion: null, estimatedGrams: null, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "low" }],
    totals: { calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
    confidence: "low",
    uncertainties: ["Test"],
  };
}

describe("meal analysis provider routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.XAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.MEAL_ANALYSIS_PRIMARY_PROVIDER;
    delete process.env.MEAL_ANALYSIS_ENABLE_FALLBACK;
    delete process.env.XAI_MEAL_VISION_MODEL;
    delete process.env.OPENAI_MEAL_ANALYSIS_MODEL;
  });

  it("never calls Grok after a transient Luna failure, even with stale provider settings", async () => {
    process.env.XAI_API_KEY = "xai-test";
    process.env.OPENAI_API_KEY = "openai-test";
    process.env.MEAL_ANALYSIS_PRIMARY_PROVIDER = "xai";
    process.env.MEAL_ANALYSIS_ENABLE_FALLBACK = "true";
    process.env.OPENAI_MEAL_ANALYSIS_MODEL = "old-model";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("temporary", { status: 503 }));

    await expect(analyzeMealInputWithFallback({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: "Riz",
      images: [{ id: "photo-1", mimeType: "image/jpeg", origin: "homemade", data: new Uint8Array([1]).buffer }],
    }, { requestId: "analysis-test-1" })).rejects.toMatchObject({ code: "provider_unavailable", retryable: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
    expect(getConfiguredMealAnalysisProvider()).toMatchObject({ name: "openai", model: "gpt-6-luna" });
    expect(getMealAnalysisPipelineConfiguration()).toMatchObject({ primary: { provider: "openai", model: "gpt-6-luna" }, fallback: null });
  });

  it("keeps a non-retryable Luna request error visible", async () => {
    process.env.XAI_API_KEY = "xai-test";
    process.env.OPENAI_API_KEY = "openai-test";
    process.env.MEAL_ANALYSIS_PRIMARY_PROVIDER = "xai";
    process.env.MEAL_ANALYSIS_ENABLE_FALLBACK = "true";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("invalid payload", { status: 400 }));

    await expect(analyzeMealInputWithFallback({
      mealType: "snack",
      mealDate: "2026-08-31",
      note: "Riz",
      images: [{ id: "photo-1", mimeType: "image/jpeg", origin: "unknown", data: new Uint8Array([1]).buffer }],
    }, { verify: false })).rejects.toMatchObject({ code: "provider_request", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
  });

  it("uses GPT-6 Luna by default without calling Grok even when an xAI key is present", async () => {
    process.env.XAI_API_KEY = "xai-test";
    process.env.OPENAI_API_KEY = "openai-test";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis("Luna")) }), { status: 200 }));

    const result = await analyzeMealInputWithFallback({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: "Riz",
      images: [],
    }, { requestId: "analysis-test-2" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
    expect(result).toMatchObject({ provider: "openai", model: "gpt-6-luna", result: { summary: "Luna" } });
    expect(result.provenance).toMatchObject({
      primary: { provider: "openai", model: "gpt-6-luna" },
      final: { provider: "openai", model: "gpt-6-luna" },
      validation: { requested: false, attempted: false, succeeded: false, provider: null, model: null },
      fallback: { configured: false, attempted: false, used: false },
    });
    expect(getConfiguredMealAnalysisProvider()).toMatchObject({ name: "openai", model: "gpt-6-luna" });
    expect(getMealAnalysisPipelineConfiguration()).toMatchObject({ primary: { provider: "openai", model: "gpt-6-luna" }, fallback: null });
    expect(result.provenance.promptVersion).toMatch(/^meal-analysis-prompt-v/);
    expect(result.provenance.schemaVersion).toMatch(/^meal-analysis-schema-v/);
  });
});

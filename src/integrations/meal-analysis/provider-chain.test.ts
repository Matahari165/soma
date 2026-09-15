import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeMealInputWithFallback } from "./provider-chain";

function structuredAnalysis(summary = "Repas test") {
  return {
    summary,
    foods: [{ name: "Riz", preparation: null, portion: null, estimatedGrams: null, calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "low" }],
    totals: { calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
    confidence: "low",
    uncertainties: ["Test"],
  };
}

describe("meal analysis provider fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.XAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.MEAL_ANALYSIS_PRIMARY_PROVIDER;
    delete process.env.MEAL_ANALYSIS_ENABLE_FALLBACK;
    delete process.env.XAI_MEAL_VISION_MODEL;
    delete process.env.OPENAI_MEAL_ANALYSIS_MODEL;
  });

  it("retries Grok once, then uses ChatGPT 5.6 Sol for a retryable failure", async () => {
    process.env.XAI_API_KEY = "xai-test";
    process.env.OPENAI_API_KEY = "openai-test";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis()) }), { status: 200 }));

    const result = await analyzeMealInputWithFallback({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: "Riz",
      images: [{ id: "photo-1", mimeType: "image/jpeg", origin: "homemade", data: new Uint8Array([1]).buffer }],
    }, { requestId: "analysis-test-1" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.x.ai/v1/responses");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://api.openai.com/v1/responses");
    expect(result).toMatchObject({ provider: "openai", model: "gpt-5.6-sol", result: { summary: "Repas test" } });
    expect(result.provenance).toMatchObject({ fallback: { configured: true, attempted: true, used: true }, validation: { requested: false, attempted: false, succeeded: false } });
  });

  it("does not hide a non-retryable Grok request error behind OpenAI", async () => {
    process.env.XAI_API_KEY = "xai-test";
    process.env.OPENAI_API_KEY = "openai-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("invalid payload", { status: 400 }));

    await expect(analyzeMealInputWithFallback({
      mealType: "snack",
      mealDate: "2026-08-31",
      note: "Riz",
      images: [{ id: "photo-1", mimeType: "image/jpeg", origin: "unknown", data: new Uint8Array([1]).buffer }],
    }, { verify: false })).rejects.toMatchObject({ code: "provider_request", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps Grok primary and lets a successful GPT validation become final", async () => {
    process.env.XAI_API_KEY = "xai-test";
    process.env.OPENAI_API_KEY = "openai-test";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis("Grok")) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis("GPT")) }), { status: 200 }));

    const result = await analyzeMealInputWithFallback({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: "Riz",
      images: [],
    }, { requestId: "analysis-test-2" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.x.ai/v1/responses");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.openai.com/v1/responses");
    expect(result).toMatchObject({ provider: "openai", model: "gpt-5.6-sol", result: { summary: "GPT" } });
    expect(result.provenance).toMatchObject({
      primary: { provider: "xai", model: "grok-4.6" },
      final: { provider: "openai", model: "gpt-5.6-sol" },
      validation: { attempted: true, succeeded: true, provider: "openai", model: "gpt-5.6-sol" },
      fallback: { configured: true, attempted: false, used: false },
    });
    expect(result.provenance.promptVersion).toMatch(/^meal-analysis-prompt-v/);
    expect(result.provenance.schemaVersion).toMatch(/^meal-analysis-schema-v/);
  });

  it("keeps Grok when the GPT validation request fails", async () => {
    process.env.XAI_API_KEY = "xai-test";
    process.env.OPENAI_API_KEY = "openai-test";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis("Grok")) }), { status: 200 }))
      .mockResolvedValueOnce(new Response("validator unavailable", { status: 503 }));

    const result = await analyzeMealInputWithFallback({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: "Riz",
      images: [],
    }, { requestId: "analysis-test-3" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ provider: "xai", model: "grok-4.6", result: { summary: "Grok" } });
    expect(result.provenance.validation).toMatchObject({ attempted: true, succeeded: false, provider: "openai", model: "gpt-5.6-sol" });
  });
});

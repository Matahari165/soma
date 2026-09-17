import { afterEach, describe, expect, it, vi } from "vitest";

import { MEAL_ACTIVE_QUALITY_PROPERTIES, MEAL_IGNORED_QUALITY_PROPERTIES, isPositiveMealVarietyFood, mealPositiveVarietyKey } from "@/domain/meal-taxonomy";
import { createOpenAiMealVisionProvider } from "@/integrations/openai/meal-vision";
import { analyzeMealInput, createXaiMealVisionProvider, makePrompt, makeTextPrompt, mealAnalysisJsonSchema, MEAL_ANALYSIS_PROMPT_VERSION, MEAL_ANALYSIS_SCHEMA_VERSION } from "./meal-vision";

function structuredAnalysis(evidenceSource: "photo" | "note" = "note") {
  const range = { low: 400, likely: 500, high: 650 };
  const evidencePhotoIds = evidenceSource === "photo" ? ["photo-1"] : [];
  return {
    summary: "A bowl with grains, vegetables, and a protein source.",
    foods: [{ id: "food-1", name: "Rice", preparation: "cooked", portion: "one bowl", estimatedGrams: 250, kind: "ingredient", parentId: null, course: "main", countedInTotals: true, foodGroups: ["refined_grain"], varietyKey: "riz", alcoholic: false, novaGroup: 1, sugarExposure: { concentrated: false, liquid: false }, qualityProperties: ["minimally_processed"], observation: { portion: "observed", novaGroup: "observed", sugarExposure: "none_observed", qualityProperties: "observed", confidence: { portion: "medium", novaGroup: "low", sugarExposure: "medium", qualityProperties: "medium" } }, evidence: "visible", evidenceSource, evidencePhotoIds, quantity: { value: 250, unit: "g", basis: "visible portion", grams: 250 }, calories: range, proteinGrams: { low: 0, likely: 7, high: 40 }, carbohydrateGrams: { low: 0, likely: 75, high: 120 }, fatGrams: { low: 0, likely: 3, high: 40 }, fiberGrams: { low: 0, likely: 4, high: 20 }, sugarGrams: { low: 0, likely: 0, high: 10 }, addedSugarGrams: { low: 0, likely: 0, high: 4 }, confidence: "medium" }],
    totals: { calories: range, proteinGrams: { low: 20, likely: 28, high: 36 }, carbohydrateGrams: { low: 65, likely: 80, high: 100 }, fatGrams: { low: 12, likely: 18, high: 25 }, fiberGrams: { low: 4, likely: 7, high: 10 }, sugarGrams: { low: 0, likely: 2, high: 8 }, addedSugarGrams: { low: 0, likely: 0, high: 2 } },
    confidence: "medium",
    uncertainties: ["The amount of oil is not visible."],
    uncertaintySignals: [{ code: "sauce_or_oil_unknown", field: "sauceOrOil", foodId: "food-1", severity: "medium", detail: "La quantité d'huile n'est pas visible." }],
  };
}

describe("xAI meal vision contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete process.env.XAI_API_KEY;
    delete process.env.XAI_MEAL_VISION_MODEL;
    delete process.env.XAI_MEAL_VALIDATOR_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MEAL_VALIDATOR_MODEL;
    delete process.env.OPENAI_MEAL_VALIDATOR_REASONING_EFFORT;
  });

  it("requires structured observation and uncertainty fields in new provider output", () => {
    const schema = mealAnalysisJsonSchema() as {
      required: string[];
      properties: { foods: { items: { required: string[]; properties: { qualityProperties: { anyOf: Array<{ items?: { enum?: string[] } }> }; novaGroup: { anyOf: Array<Record<string, unknown>> }; sugarExposure: unknown } } }; totals: { required: string[] }; uncertaintySignals: unknown };
    };
    expect(schema.required).toContain("uncertaintySignals");
    expect(schema.properties.foods.items.required).toContain("id");
    expect(schema.properties.foods.items.required).toContain("observation");
    expect(schema.properties.foods.items.required).toContain("qualityProperties");
    expect(schema.properties.foods.items.required).toContain("sugarGrams");
    expect(schema.properties.foods.items.required).toContain("addedSugarGrams");
    expect(schema.properties.totals.required).toContain("sugarGrams");
    expect(schema.properties.totals.required).toContain("addedSugarGrams");
    expect(schema.properties.foods.items.properties.qualityProperties.anyOf[1]?.items?.enum).toEqual([...MEAL_ACTIVE_QUALITY_PROPERTIES]);
    expect(schema.properties.foods.items.properties.novaGroup.anyOf[0]).toMatchObject({ type: "integer", minimum: 1, maximum: 4 });
    expect(schema.properties.foods.items.properties.sugarExposure).toBeDefined();
    expect(MEAL_ANALYSIS_PROMPT_VERSION).toMatch(/^meal-analysis-prompt-v/);
    expect(MEAL_ANALYSIS_SCHEMA_VERSION).toMatch(/^meal-analysis-schema-v/);
  });

  it("keeps only the positive variety taxonomy and active quality roles", () => {
    expect(isPositiveMealVarietyFood({ name: "Pomme", varietyKey: "pomme", foodGroups: ["fruit"] })).toBe(true);
    expect(mealPositiveVarietyKey({ name: "Pomme", varietyKey: "Pomme", foodGroups: ["fruit"] })).toBe("pomme");
    for (const group of ["sweet", "beverage", "sauce", "other"] as const) {
      expect(isPositiveMealVarietyFood({ name: "Élément", foodGroups: [group] })).toBe(false);
    }
    expect(isPositiveMealVarietyFood({ name: "Jus d'orange", foodGroups: ["fruit"] })).toBe(false);
    expect(isPositiveMealVarietyFood({ name: "Légumes avec sauce", foodGroups: ["vegetable", "sauce"] })).toBe(false);
    expect(isPositiveMealVarietyFood({ name: "Aliment sans classement", foodGroups: [] })).toBe(false);
    expect(MEAL_IGNORED_QUALITY_PROPERTIES).toEqual(["whole_food", "minimally_processed", "fermented"]);
  });

  it("makes unknown versus none_observed explicit in text and image prompts", () => {
    const textPrompt = makeTextPrompt({ mealType: "lunch", mealDate: "2026-09-12", note: "Un plat préparé sans marque", });
    const imagePrompt = makePrompt({ mealType: "lunch", mealDate: "2026-09-12", note: null, images: [] });
    for (const prompt of [textPrompt, imagePrompt]) {
      expect(prompt).toContain("none_observed");
      expect(prompt).toContain("unknown");
      expect(prompt).toContain("uncertaintySignals");
      expect(prompt).toContain("qualityProperties");
      expect(prompt).toContain("novaGroup");
      expect(prompt).toContain("sugarExposure");
      expect(prompt).toContain("sugarGrams");
      expect(prompt).toContain("addedSugarGrams");
      expect(prompt).toContain("bonbons");
      expect(prompt).toContain("whole_food");
    }
    expect(imagePrompt).toContain("éléments différents");
    expect(imagePrompt).toContain("angles différents");
    expect(imagePrompt).toContain("evidencePhotoIds");
    expect(imagePrompt).toContain("null signifie indisponible");
  });

  it("rejects a photo evidence id that was not supplied with the request", async () => {
    process.env.XAI_API_KEY = "test-key";
    const invalid = structuredAnalysis("photo");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(invalid) }), { status: 200 }));

    await expect(createXaiMealVisionProvider({ maxAttempts: 1 }).analyze({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: null,
      images: [{ id: "photo-other", mimeType: "image/jpeg", origin: "homemade", data: new Uint8Array([1]).buffer }],
    })).rejects.toMatchObject({ code: "response_schema_error" });
  });

  it("propagates the same sugar, NOVA and variety contract through OpenAI", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis()) }), { status: 200 }));

    await createOpenAiMealVisionProvider({ maxAttempts: 1 }).analyzeText!({ mealType: "lunch", mealDate: "2026-08-31", note: "Riz, légumes et poulet" });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { instructions: string; input: Array<{ content: Array<{ text?: string }> }> };
    expect(body.instructions).toContain("sugarGrams");
    expect(body.instructions).toContain("addedSugarGrams");
    expect(body.instructions).toContain("NOVA");
    expect(body.instructions).toContain("bonbons");
    expect(body.instructions).toContain("whole_food");
    expect(body.input[0]?.content[0]?.text).toContain("Riz, légumes et poulet");
  });

  it("sends the note and all photos in one structured vision request", async () => {
    process.env.XAI_API_KEY = "test-key";
    process.env.XAI_MEAL_VISION_MODEL = "grok-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));
    const result = await createXaiMealVisionProvider().analyze({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: "Bol de riz avec légumes",
      images: [
        { id: "photo-1", mimeType: "image/jpeg", origin: "homemade", data: Uint8Array.from([1, 2, 3]).buffer },
        { id: "photo-2", mimeType: "image/jpeg", origin: "homemade", data: Uint8Array.from([4, 5, 6]).buffer },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { model: string; store: boolean; input: Array<{ content: Array<{ type: string; text?: string; image_url?: string; detail?: string }> }>; text: { format: { type: string; name: string; strict: boolean } } };
    expect(body).toMatchObject({ model: "grok-test", store: false, text: { format: { type: "json_schema", name: "soma_meal_analysis", strict: true } } });
    expect(body.input[0]?.content.filter((item) => item.type === "input_image")).toHaveLength(2);
    expect(body.input[0]?.content[0]?.text).toContain("Bol de riz avec légumes");
    expect(body.input[0]?.content[1]?.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.input[0]?.content[1]?.detail).toBe("high");
    expect(result.totals.calories?.likely).toBe(500);
  });

  it("extracts JSON wrapped in provider prose and normalizes numeric strings", async () => {
    process.env.XAI_API_KEY = "test-key";
    const wrapped = JSON.stringify(structuredAnalysis())
      .replace('"estimatedGrams":250', '"estimatedGrams":"250"')
      .replace('"low":400,"likely":500,"high":650', '"low":"400","likely":"500","high":"650"');
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: `Voici le résultat :\n\n\`\`\`json\n${wrapped}\n\`\`\`\nFin.` }), { status: 200 }));

    const result = await createXaiMealVisionProvider().analyze({ mealType: "lunch", mealDate: "2026-08-31", note: "Un bol", images: [{ id: "photo-1", mimeType: "image/jpeg", origin: "homemade", data: new Uint8Array([1]).buffer }] });

    expect(result.foods[0]?.estimatedGrams).toBe(250);
    expect(result.totals.calories?.likely).toBe(500);
  });

  it("accepts a legacy response without sugar fields and keeps them unavailable", async () => {
    process.env.XAI_API_KEY = "test-key";
    const legacy = structuredAnalysis();
    const legacyFood = { ...legacy.foods[0] } as Record<string, unknown>;
    const legacyTotals = { ...legacy.totals } as Record<string, unknown>;
    delete legacyFood.sugarGrams;
    delete legacyFood.addedSugarGrams;
    delete legacyTotals.sugarGrams;
    delete legacyTotals.addedSugarGrams;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({ ...legacy, foods: [legacyFood], totals: legacyTotals }) }), { status: 200 }));

    const result = await createXaiMealVisionProvider({ maxAttempts: 1 }).analyzeText!({ mealType: "lunch", mealDate: "2026-08-31", note: "Riz sans quantité de sucre connue" });

    expect(result.foods[0]).toMatchObject({ sugarGrams: null, addedSugarGrams: null });
    expect(result.totals).toMatchObject({ sugarGrams: null, addedSugarGrams: null });
  });

  it("conservatively removes values that contradict an unknown observation", async () => {
    process.env.XAI_API_KEY = "test-key";
    const contradictory = structuredAnalysis();
    const foods = contradictory.foods as unknown as Array<Record<string, unknown>>;
    const firstFood = foods[0] ?? {};
    foods[0] = {
      ...firstFood,
      portion: "une poignée",
      estimatedGrams: 40,
      quantity: { value: 1, unit: "poignée", basis: null, grams: 40 },
      novaGroup: 2,
      sugarExposure: { concentrated: null, liquid: false },
      qualityProperties: ["fiber_source"],
      observation: {
        ...(firstFood.observation as Record<string, unknown>),
        portion: "unknown",
        novaGroup: "unknown",
        sugarExposure: "unknown",
        qualityProperties: "unknown",
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(contradictory) }), { status: 200 }));

    const result = await createXaiMealVisionProvider({ maxAttempts: 1 }).analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "Une poignée" });

    expect(result.foods[0]).toMatchObject({
      portion: null,
      estimatedGrams: null,
      quantity: { value: null, grams: null },
      novaGroup: null,
      sugarExposure: null,
    });
    expect(result.foods[0]).not.toHaveProperty("qualityProperties");
  });

  it("drops an observed quality status without a concrete property", async () => {
    process.env.XAI_API_KEY = "test-key";
    const contradictory = structuredAnalysis();
    const foods = contradictory.foods as unknown as Array<Record<string, unknown>>;
    const firstFood = foods[0] ?? {};
    foods[0] = {
      ...firstFood,
      qualityProperties: [],
      observation: { ...(firstFood.observation as Record<string, unknown>), qualityProperties: "observed" },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(contradictory) }), { status: 200 }));

    const result = await createXaiMealVisionProvider({ maxAttempts: 1 }).analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "Une collation" });

    expect(result.foods[0]?.observation?.qualityProperties).toBe("unknown");
    expect(result.foods[0]).not.toHaveProperty("qualityProperties");
  });

  it("prevents a counted parent dish from double-counting its components", async () => {
    process.env.XAI_API_KEY = "test-key";
    const contradictory = structuredAnalysis();
    const parentId = contradictory.foods[0]?.id ?? "food-1";
    const parent = { ...contradictory.foods[0], id: parentId, kind: "dish", parentId: null, countedInTotals: true };
    const child = { ...contradictory.foods[0], id: "component-1", kind: "component", parentId } as Record<string, unknown>;
    delete child.countedInTotals;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({ ...contradictory, foods: [parent, child] }) }), { status: 200 }));

    const result = await createXaiMealVisionProvider({ maxAttempts: 1 }).analyzeText!({ mealType: "lunch", mealDate: "2026-08-31", note: "Un plat composé" });

    expect(result.foods.find((food) => food.id === parentId)?.countedInTotals).toBe(true);
    expect(result.foods.find((food) => food.id === "component-1")?.countedInTotals).toBe(false);
    expect(result.totals).toEqual(contradictory.totals);
  });

  it("rejects an invalid provider response instead of persisting guesses", async () => {
    process.env.XAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ summary: "bad", foods: [], totals: {}, confidence: "medium", uncertainties: [] }) }] }] }), { status: 200 }));
    await expect(createXaiMealVisionProvider({ maxAttempts: 1 }).analyze({ mealType: "dinner", mealDate: "2026-08-31", note: null, images: [{ id: "photo-1", mimeType: "image/png", origin: "prepared", data: new Uint8Array([1]).buffer }] })).rejects.toThrow("invalid structured meal analysis");
  });

  it("sends a text-only request without images for a free description", async () => {
    process.env.XAI_API_KEY = "test-key";
    const range = { low: 150, likely: 190, high: 230 };
    const textOnly = {
      summary: "2 bananes, sans photo.",
      dishType: null,
      calorieAnalysis: "Environ 190 kcal (likely), un en-cas modéré.",
      foods: [{ id: "food-1", name: "Banane", preparation: null, portion: null, estimatedGrams: null, kind: "ingredient", parentId: null, course: null, countedInTotals: true, foodGroups: ["fruit"], varietyKey: "banane", alcoholic: false, novaGroup: 1, sugarExposure: { concentrated: false, liquid: false }, qualityProperties: ["whole_food", "fiber_source"], observation: { portion: "unknown", novaGroup: "observed", sugarExposure: "none_observed", qualityProperties: "observed", confidence: { portion: "low", novaGroup: "low", sugarExposure: "medium", qualityProperties: "low" } }, evidence: "visible", evidenceSource: "note", evidencePhotoIds: [], quantity: null, calories: range, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, sugarGrams: { low: 20, likely: 24, high: 28 }, addedSugarGrams: { low: 0, likely: 0, high: 0 }, confidence: "low" }],
      totals: { calories: range, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, sugarGrams: { low: 20, likely: 24, high: 28 }, addedSugarGrams: { low: 0, likely: 0, high: 0 } },
      confidence: "low",
      uncertainties: ["Estimation à partir de la seule description, sans photo."],
      uncertaintySignals: [{ code: "portion_unknown", field: "portion", foodId: "food-1", severity: "high", detail: "La quantité n'est pas indiquée." }],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(textOnly) }] }] }), { status: 200 }));
    const result = await createXaiMealVisionProvider().analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "2 bananes" });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { max_output_tokens: number; input: Array<{ content: Array<{ type: string; text?: string }> }>; text: { format: { type: string; name: string; strict: boolean } } };
    expect(body).toMatchObject({ max_output_tokens: 3000, text: { format: { type: "json_schema", name: "soma_meal_analysis", strict: true } } });
    expect(body.input[0]?.content.some((item) => item.type === "input_image")).toBe(false);
    expect(body.input[0]?.content[0]?.text).toContain("2 bananes");
    expect(result).toMatchObject({ confidence: "low", totals: { calories: range } });
  });

  it("passes a cancellable signal to each provider request", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis()) }), { status: 200 }));

    await createXaiMealVisionProvider().analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "Trois croissants et une banane" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toHaveProperty("signal");
  });

  it("stops a provider that never completes", async () => {
    process.env.XAI_API_KEY = "test-key";
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }));

    const pending = expect(createXaiMealVisionProvider({ maxAttempts: 1, timeoutMs: 1_000 }).analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "Une banane" })).rejects.toMatchObject({ code: "provider_timeout" });
    await vi.advanceTimersByTimeAsync(1_000);
    await pending;
    vi.useRealTimers();
  });

  it("uses personal recipes only as variable context", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));

    await createXaiMealVisionProvider().analyzeText!({
      mealType: "dinner",
      mealDate: "2026-08-31",
      note: "Pâtes avec poulet",
      recipeReferences: [{ name: "Pâtes du soir", dishType: "Pâtes", ingredients: [{ name: "Pâtes", usualAmount: "portion variable", alternatives: [] }], aliases: [], commonVariations: [] }],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { input: Array<{ content: Array<{ text?: string }> }> };
    expect(body.input[0]?.content[0]?.text).toContain("Pâtes du soir");
    expect(body.input[0]?.content[0]?.text).toContain("indicatifs");
    expect(body.input[0]?.content[0]?.text).toContain("La photo et la description actuelles priment");
  });

  it("classifies provider failures without exposing the provider payload", async () => {
    process.env.XAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("private provider payload", { status: 429 }));
    await expect(createXaiMealVisionProvider().analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "2 bananes" }))
      .rejects.toMatchObject({ code: "provider_rate_limited", message: "Grok est momentanément sollicité. Réessaie dans quelques instants." });
  });

  it("keeps the normal output budget for a transient provider retry", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis()) }), { status: 200 }));

    await createXaiMealVisionProvider().analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "2 bananes" });

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { max_output_tokens: number };
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { max_output_tokens: number };
    expect(firstBody.max_output_tokens).toBe(3_000);
    expect(retryBody.max_output_tokens).toBe(3_000);
  });

  it("retries an empty Grok response once", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis()) }), { status: 200 }));

    await createXaiMealVisionProvider().analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "2 bananes" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a truncated four-photo response with a larger budget and accepts text content variants", async () => {
    process.env.XAI_API_KEY = "test-key";
    const images = Array.from({ length: 4 }, (_, index) => ({ id: `photo-${index + 1}`, mimeType: "image/jpeg", origin: "homemade" as const, data: new Uint8Array([index + 1]).buffer }));
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));

    const result = await createXaiMealVisionProvider().analyze({ mealType: "dinner", mealDate: "2026-08-31", note: "Repas avec quatre photos", images });

    expect(result.totals.calories?.likely).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { max_output_tokens: number; input: Array<{ content: Array<{ type: string }> }> };
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { max_output_tokens: number; input: Array<{ content: Array<{ type: string }> }> };
    expect(firstBody.max_output_tokens).toBe(6_000);
    expect(retryBody.max_output_tokens).toBe(12_000);
    expect(retryBody.input[0]?.content.filter((item) => item.type === "input_image")).toHaveLength(4);
  });

  it("uses the primary model and validator for a natural-language correction by default", async () => {
    process.env.XAI_API_KEY = "test-key";
    process.env.XAI_MEAL_VISION_MODEL = "grok-primary";
    process.env.XAI_MEAL_VALIDATOR_MODEL = "grok-validator";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));
    const result = await analyzeMealInput({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: "Bol de riz avec légumes",
      correction: "La portion de riz était plus petite que prévu.",
      images: [{ id: "photo-1", mimeType: "image/jpeg", origin: "homemade", data: new Uint8Array([1]).buffer }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const primaryBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { model: string; input: Array<{ content: Array<{ text?: string; detail?: string }> }> };
    const validatorBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { model: string; input: Array<{ content: Array<{ text?: string; detail?: string }> }> };
    expect(primaryBody.model).toBe("grok-primary");
    expect(primaryBody.input[0]?.content[0]?.text).toContain("Bol de riz");
    expect(primaryBody.input[0]?.content[0]?.text).toContain("La portion de riz était plus petite que prévu.");
    expect(primaryBody.input[0]?.content[1]?.detail).toBe("high");
    expect(validatorBody.model).toBe("grok-validator");
    expect(validatorBody.input[0]?.content[0]?.text).toContain("La portion de riz était plus petite que prévu.");
    expect(validatorBody.input[0]?.content[1]?.detail).toBe("high");
    expect(result.result.summary).toBe(structuredAnalysis().summary);
  });

  it("uses GPT-5.6 Sol with low reasoning as the configured validator", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.OPENAI_API_KEY = "openai-test-key";
    process.env.OPENAI_MEAL_VALIDATOR_REASONING_EFFORT = "low";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));

    await analyzeMealInput({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: "Bol de riz avec légumes",
      images: Array.from({ length: 4 }, (_, index) => ({ id: `photo-${index + 1}`, mimeType: "image/jpeg", origin: "homemade" as const, data: new Uint8Array([index + 1]).buffer })),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.x.ai/v1/responses");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.openai.com/v1/responses");
    const validatorBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { model: string; reasoning: { effort: string }; input: Array<{ content: Array<{ detail?: string }> }> };
    expect(validatorBody).toMatchObject({ model: "gpt-5.6-sol", reasoning: { effort: "low" } });
    expect(validatorBody.input[0]?.content[1]?.detail).toBe("high");
    expect(validatorBody.input[0]?.content.filter((item) => item.detail === "high")).toHaveLength(4);
  });

  it("keeps four photos in one high-detail primary request", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));
    const images = Array.from({ length: 4 }, (_, index) => ({ id: `photo-${index + 1}`, mimeType: "image/jpeg", origin: "homemade" as const, data: new Uint8Array([index + 1]).buffer }));

    await createXaiMealVisionProvider().analyze({ mealType: "dinner", mealDate: "2026-08-31", note: "Repas avec quatre angles", images });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { input: Array<{ content: Array<{ type: string; detail?: string }> }> };
    const imageParts = body.input[0]?.content.filter((item) => item.type === "input_image") ?? [];
    expect(imageParts).toHaveLength(4);
    expect(imageParts.every((item) => item.detail === "high")).toBe(true);
  });

  it("supports every vision count from one through six in one request per meal", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));
    const provider = createXaiMealVisionProvider();

    for (let count = 1; count <= 6; count += 1) {
      await provider.analyze({
        mealType: "lunch",
        mealDate: "2026-08-31",
        note: count % 2 === 0 ? "Photo avec une note" : null,
        images: Array.from({ length: count }, (_, index) => ({ id: `photo-${count}-${index}`, mimeType: "image/jpeg", origin: "unknown" as const, data: new Uint8Array([index + 1]).buffer })),
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(6);
    fetchMock.mock.calls.forEach((call, index) => {
      const body = JSON.parse(String(call[1]?.body)) as { input: Array<{ content: Array<{ type: string }> }> };
      expect(body.input[0]?.content.filter((item) => item.type === "input_image")).toHaveLength(index + 1);
    });
  });

  it("reports a missing Grok key as configuration instead of transient unavailability", async () => {
    await expect(createXaiMealVisionProvider().analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "2 bananes" }))
      .rejects.toMatchObject({ code: "provider_auth", message: "La configuration de l’analyse Grok est invalide." });
  });

  it("does not add a second Grok request when no validator is configured", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis()) }), { status: 200 }));

    await analyzeMealInput({ mealType: "dinner", mealDate: "2026-08-31", note: null, images: [{ id: "photo-1", mimeType: "image/png", origin: "prepared", data: new Uint8Array([1]).buffer }] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the primary result when the default verification fails", async () => {
    process.env.XAI_API_KEY = "test-key";
    process.env.XAI_MEAL_VALIDATOR_MODEL = "grok-validator";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("validator unavailable", { status: 503 }));

    const result = await analyzeMealInput({ mealType: "dinner", mealDate: "2026-08-31", note: null, images: [{ id: "photo-1", mimeType: "image/png", origin: "prepared", data: new Uint8Array([1]).buffer }] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.result.summary).toBe(structuredAnalysis().summary);
  });

  it("keeps providers without verify compatible", async () => {
    const primary = structuredAnalysis();
    const provider = {
      name: "test",
      model: "test-model",
      analyze: vi.fn().mockResolvedValue(primary),
    };

    const result = await analyzeMealInput({ mealType: "breakfast", mealDate: "2026-08-31", note: null, images: [{ id: "photo-1", mimeType: "image/png", origin: "unknown", data: new Uint8Array([1]).buffer }] }, provider);

    expect(provider.analyze).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      result: primary,
      provider: "test",
      model: "test-model",
      validation: {
        requested: true,
        configured: false,
        attempted: false,
        succeeded: false,
        provider: null,
        model: null,
      },
    });
  });

  it("passes a natural-language correction through the text-only verification path", async () => {
    const primary = structuredAnalysis();
    const correction = "Il y avait aussi un filet d'huile d'olive.";
    const provider = {
      name: "test",
      model: "test-model",
      analyze: vi.fn(),
      analyzeText: vi.fn().mockResolvedValue(primary),
      verify: vi.fn().mockResolvedValue(primary),
    };

    await analyzeMealInput({ mealType: "snack", mealDate: "2026-08-31", note: "Yaourt", correction, images: [] }, provider);

    expect(provider.analyzeText).toHaveBeenCalledWith({ mealType: "snack", mealDate: "2026-08-31", note: "Yaourt", correction });
    expect(provider.verify).toHaveBeenCalledWith(expect.objectContaining({ primaryAnalysis: primary, correction }));
  });
});

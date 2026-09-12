import "server-only";

import {
  imageDataUri,
  makeTextPrompt,
  makePrompt,
  requestStructuredMealAnalysis,
  type MealVisionInput,
  type MealVisionProvider,
  type MealVisionTextInput,
} from "@/integrations/xai/meal-vision";

/**
 * OpenAI adapter for the same Responses + strict JSON contract as the xAI
 * adapter. Keeping it independent makes a real provider fallback possible and
 * prevents the rest of Soma from knowing provider-specific HTTP details.
 */
export function createOpenAiMealVisionProvider(options: { maxAttempts?: number } = {}): MealVisionProvider {
  const model = process.env.OPENAI_MEAL_ANALYSIS_MODEL || process.env.OPENAI_MEAL_VALIDATOR_MODEL || "gpt-5.6-sol";
  const endpoint = process.env.OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses";
  const reasoningEffort = process.env.OPENAI_MEAL_ANALYSIS_REASONING_EFFORT || process.env.OPENAI_MEAL_VALIDATOR_REASONING_EFFORT || "low";
  return {
    name: "openai",
    model,
    async analyze(input: MealVisionInput) {
      return requestStructuredMealAnalysis({
        provider: "openai",
        endpoint,
        apiKeyEnv: "OPENAI_API_KEY",
        model,
        instructions: "You are a careful food-photo analyst. Return stable food ids, per-axis observation statuses and per-axis confidence. Never invent hidden ingredients, exact weights, or nutrition precision that the photos cannot support. Use ranges with low <= likely <= high, nulls when not estimable, and structured uncertainty signals for important unknowns. Labels in French. Return only the requested JSON object.",
        promptText: makePrompt(input),
        imageContents: input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "high" })),
        maxOutputTokens: 4_000,
        reasoningEffort,
        requestId: input.requestId,
        maxAttempts: options.maxAttempts,
      });
    },
    async analyzeText(input: MealVisionTextInput) {
      return requestStructuredMealAnalysis({
        provider: "openai",
        endpoint,
        apiKeyEnv: "OPENAI_API_KEY",
        model,
        instructions: "You are a careful food-description analyst. List only foods named in the user description and return stable food ids, per-axis observation statuses and per-axis confidence. Never invent exact grams or nutrition precision the description cannot support; use wide ranges with low <= likely <= high and nulls when not estimable. Default confidence to low unless the description is very precise. Always include 'Estimation à partir de la seule description, sans photo.' in uncertainties and machine-readable uncertaintySignals for important unknowns. Labels in French. Return only the requested JSON object.",
        promptText: makeTextPrompt(input),
        imageContents: [],
        maxOutputTokens: 1_500,
        reasoningEffort,
        requestId: input.requestId,
        maxAttempts: options.maxAttempts,
      });
    },
  };
}

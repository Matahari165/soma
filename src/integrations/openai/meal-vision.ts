import "server-only";

import {
  imageDataUri,
  makeTextPrompt,
  makePrompt,
  MEAL_PHOTO_PROVIDER_INSTRUCTIONS,
  MEAL_TEXT_PROVIDER_INSTRUCTIONS,
  requestStructuredMealAnalysis,
  type MealVisionInput,
  type MealVisionProvider,
  type MealVisionTextInput,
} from "@/integrations/xai/meal-vision";

/**
 * OpenAI adapter for Soma's Responses + strict JSON contract. The meal
 * pipeline pins this provider to GPT-6 Luna independently of the assistant.
 */
export const OPENAI_MEAL_ANALYSIS_MODEL = "gpt-6-luna";

export function createOpenAiMealVisionProvider(options: { maxAttempts?: number; timeoutMs?: number } = {}): MealVisionProvider {
  const model = OPENAI_MEAL_ANALYSIS_MODEL;
  const endpoint = process.env.OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses";
  const reasoningEffort = process.env.OPENAI_MEAL_ANALYSIS_REASONING_EFFORT || "low";
  return {
    name: "openai",
    model,
    async analyze(input: MealVisionInput) {
      return requestStructuredMealAnalysis({
        provider: "openai",
        endpoint,
        apiKeyEnv: "OPENAI_API_KEY",
        model,
        instructions: MEAL_PHOTO_PROVIDER_INSTRUCTIONS,
        promptText: makePrompt(input),
        imageContents: input.images.map((image) => ({ type: "input_image", image_url: imageDataUri(image), detail: "auto" })),
        maxOutputTokens: 6_000,
        sourcePhotoIds: input.images.map((image) => image.id),
        reasoningEffort,
        requestId: input.requestId,
        maxAttempts: options.maxAttempts,
        schemaRepairAttempts: 1,
        timeoutMs: options.timeoutMs,
      });
    },
    async analyzeText(input: MealVisionTextInput) {
      return requestStructuredMealAnalysis({
        provider: "openai",
        endpoint,
        apiKeyEnv: "OPENAI_API_KEY",
        model,
        instructions: MEAL_TEXT_PROVIDER_INSTRUCTIONS,
        promptText: makeTextPrompt(input),
        imageContents: [],
        maxOutputTokens: 3_000,
        sourcePhotoIds: [],
        reasoningEffort,
        requestId: input.requestId,
        maxAttempts: options.maxAttempts,
        schemaRepairAttempts: 1,
        timeoutMs: options.timeoutMs,
      });
    },
  };
}

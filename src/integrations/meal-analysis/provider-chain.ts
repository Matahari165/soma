import "server-only";

import {
  analyzeMealInput,
  createXaiMealVisionProvider,
  MealVisionError,
  type MealVisionInput,
  type MealVisionProvider,
} from "@/integrations/xai/meal-vision";
import { createOpenAiMealVisionProvider } from "@/integrations/openai/meal-vision";

function configuredProviderName() {
  return process.env.MEAL_ANALYSIS_PRIMARY_PROVIDER === "openai" ? "openai" : "xai";
}

export function getConfiguredMealAnalysisProvider(): MealVisionProvider {
  return configuredProviderName() === "openai" ? createOpenAiMealVisionProvider() : createXaiMealVisionProvider();
}

function fallbackProvider(primary: MealVisionProvider) {
  if (process.env.MEAL_ANALYSIS_ENABLE_FALLBACK === "false") return null;
  // The primary adapter already used its two-attempt retry budget. A single
  // fallback attempt keeps the worst-case wall time below the 50s route budget
  // while still allowing recovery from a transient primary outage.
  if (primary.name === "xai" && process.env.OPENAI_API_KEY) return createOpenAiMealVisionProvider({ maxAttempts: 1 });
  if (primary.name === "openai" && process.env.XAI_API_KEY) return createXaiMealVisionProvider({ maxAttempts: 1 });
  return null;
}

/**
 * Runs one configured provider and only falls back after a retryable provider
 * failure. Invalid input, authentication, schema and storage bugs must remain
 * visible instead of being hidden behind a different model.
 */
export async function analyzeMealInputWithFallback(
  input: MealVisionInput,
  options: { provider?: MealVisionProvider; requestId?: string; verify?: boolean } = {},
) {
  const primary = options.provider ?? getConfiguredMealAnalysisProvider();
  const secondary = options.provider ? null : fallbackProvider(primary);
  try {
    return await analyzeMealInput(input, primary, { verify: options.verify, requestId: options.requestId });
  } catch (error) {
    if (!secondary || !(error instanceof MealVisionError) || !error.retryable) throw error;
    console.warn("[meal-analysis] primary provider failed; fallback started", {
      requestId: options.requestId,
      primaryProvider: primary.name,
      primaryModel: primary.model,
      fallbackProvider: secondary.name,
      fallbackModel: secondary.model,
      stage: "fallback",
      code: error.code,
      status: error.status,
    });
    try {
      const result = await analyzeMealInput(input, secondary, { verify: false, requestId: options.requestId });
      console.info("[meal-analysis] fallback provider succeeded", {
        requestId: options.requestId,
        provider: secondary.name,
        model: secondary.model,
        stage: "fallback_success",
      });
      return result;
    } catch (fallbackError) {
      console.error("[meal-analysis] fallback provider failed", {
        requestId: options.requestId,
        provider: secondary.name,
        model: secondary.model,
        stage: "fallback_failure",
        code: fallbackError instanceof MealVisionError ? fallbackError.code : "unknown",
        status: fallbackError instanceof MealVisionError ? fallbackError.status : undefined,
      });
      throw fallbackError;
    }
  }
}

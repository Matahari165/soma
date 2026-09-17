import "server-only";

import {
  analyzeMealInput,
  createXaiMealVisionProvider,
  MEAL_ANALYSIS_PROMPT_VERSION,
  MEAL_ANALYSIS_SCHEMA_VERSION,
  MealVisionError,
  type MealVisionInput,
  type MealVisionProvider,
} from "@/integrations/xai/meal-vision";
import { createOpenAiMealVisionProvider } from "@/integrations/openai/meal-vision";
import type { MealAnalysisPipelineProvenance } from "@/domain/meals";

function configuredProviderName() {
  return process.env.MEAL_ANALYSIS_PRIMARY_PROVIDER === "openai" ? "openai" : "xai";
}

export type MealAnalysisPipelineConfiguration = {
  primary: { provider: string; model: string; endpoint: string; reasoningEffort: string | null };
  validator: { provider: string; model: string; endpoint: string; reasoningEffort: string | null } | null;
  fallback: { provider: string; model: string; endpoint: string; reasoningEffort: string | null } | null;
};

function providerConfiguration(provider: "xai" | "openai", model: string) {
  return provider === "xai"
    ? { provider, model, endpoint: process.env.XAI_RESPONSES_URL || "https://api.x.ai/v1/responses", reasoningEffort: null }
    : { provider, model, endpoint: process.env.OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses", reasoningEffort: process.env.OPENAI_MEAL_ANALYSIS_REASONING_EFFORT || process.env.OPENAI_MEAL_VALIDATOR_REASONING_EFFORT || "low" };
}

/** Configuration sans secrets des providers qui peuvent influencer l'analyse. */
export function getMealAnalysisPipelineConfiguration(): MealAnalysisPipelineConfiguration {
  const primaryProvider = configuredProviderName();
  const primaryModel = primaryProvider === "xai"
    ? process.env.XAI_MEAL_VISION_MODEL || "grok-4.3"
    : process.env.OPENAI_MEAL_ANALYSIS_MODEL || process.env.OPENAI_MEAL_VALIDATOR_MODEL || "gpt-5.6-sol";
  const primary = providerConfiguration(primaryProvider, primaryModel);
  const validator = primaryProvider !== "xai" ? null : process.env.OPENAI_API_KEY
    ? { ...providerConfiguration("openai", process.env.OPENAI_MEAL_VALIDATOR_MODEL || "gpt-5.6-sol"), reasoningEffort: process.env.OPENAI_MEAL_VALIDATOR_REASONING_EFFORT || "low" }
    : process.env.XAI_MEAL_VALIDATOR_MODEL
      ? providerConfiguration("xai", process.env.XAI_MEAL_VALIDATOR_MODEL)
      : null;
  const fallbackEnabled = process.env.MEAL_ANALYSIS_ENABLE_FALLBACK !== "false";
  const fallback = !fallbackEnabled ? null : primaryProvider === "xai" && process.env.OPENAI_API_KEY
    ? providerConfiguration("openai", process.env.OPENAI_MEAL_ANALYSIS_MODEL || process.env.OPENAI_MEAL_VALIDATOR_MODEL || "gpt-5.6-sol")
    : primaryProvider === "openai" && process.env.XAI_API_KEY
      ? providerConfiguration("xai", process.env.XAI_MEAL_VISION_MODEL || "grok-4.3")
      : null;
  return { primary, validator, fallback };
}

export function getConfiguredMealAnalysisProvider(): MealVisionProvider {
  // Durable jobs own retries. Keeping one HTTP attempt per invocation avoids
  // spending the whole serverless window retrying the same provider in memory.
  return configuredProviderName() === "openai"
    ? createOpenAiMealVisionProvider({ maxAttempts: 1 })
    : createXaiMealVisionProvider({ maxAttempts: 1 });
}

function fallbackProvider(primary: MealVisionProvider) {
  if (process.env.MEAL_ANALYSIS_ENABLE_FALLBACK === "false") return null;
  // A single fallback attempt recovers from a transient primary outage while
  // the persisted job remains responsible for any later retry.
  if (primary.name === "xai" && process.env.OPENAI_API_KEY) return createOpenAiMealVisionProvider({ maxAttempts: 1, timeoutMs: 60_000 });
  if (primary.name === "openai" && process.env.XAI_API_KEY) return createXaiMealVisionProvider({ maxAttempts: 1, timeoutMs: 60_000 });
  return null;
}

function pipelineProvenance(input: {
  primary: { provider: string; model: string };
  final: { provider: string; model: string };
  validation: MealAnalysisPipelineProvenance["validation"];
  fallback: MealAnalysisPipelineProvenance["fallback"];
}): MealAnalysisPipelineProvenance {
  return {
    promptVersion: MEAL_ANALYSIS_PROMPT_VERSION,
    schemaVersion: MEAL_ANALYSIS_SCHEMA_VERSION,
    ...input,
    validator: input.validation,
  };
}

/**
 * Runs one configured provider and only falls back after a retryable provider
 * failure. Invalid input, authentication, schema and storage bugs must remain
 * visible instead of being hidden behind a different model.
 */
export async function analyzeMealInputWithFallback(
  input: MealVisionInput,
  options: { provider?: MealVisionProvider; requestId?: string; verify?: boolean; allowFallback?: boolean } = {},
) {
  const primary = options.provider ?? getConfiguredMealAnalysisProvider();
  const secondary = options.provider || options.allowFallback === false ? null : fallbackProvider(primary);
  const primaryConfiguration = { provider: primary.name, model: primary.model };
  try {
    const analysed = await analyzeMealInput(input, primary, { verify: options.verify, requestId: options.requestId });
    return {
      ...analysed,
      provenance: pipelineProvenance({
        primary: primaryConfiguration,
        final: { provider: analysed.provider, model: analysed.model },
        validation: analysed.validation,
        fallback: { configured: Boolean(secondary), attempted: false, used: false, provider: secondary?.name ?? null, model: secondary?.model ?? null },
      }),
    };
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
      return {
        ...result,
        provenance: pipelineProvenance({
          primary: primaryConfiguration,
          final: { provider: secondary.name, model: secondary.model },
          validation: result.validation,
          fallback: { configured: true, attempted: true, used: true, provider: secondary.name, model: secondary.model },
        }),
      };
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

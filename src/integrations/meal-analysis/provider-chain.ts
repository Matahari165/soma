import "server-only";

import {
  analyzeMealInput,
  MEAL_ANALYSIS_PROMPT_VERSION,
  MEAL_ANALYSIS_SCHEMA_VERSION,
  type MealVisionInput,
  type MealVisionProvider,
} from "@/integrations/xai/meal-vision";
import { createOpenAiMealVisionProvider, OPENAI_MEAL_ANALYSIS_MODEL } from "@/integrations/openai/meal-vision";
import type { MealAnalysisPipelineProvenance } from "@/domain/meals";

export type MealAnalysisPipelineConfiguration = {
  primary: { provider: string; model: string; endpoint: string; reasoningEffort: string | null };
  validator: { provider: string; model: string; endpoint: string; reasoningEffort: string | null } | null;
  fallback: { provider: string; model: string; endpoint: string; reasoningEffort: string | null } | null;
};

/** Configuration sans secrets des providers qui peuvent influencer l'analyse. */
export function getMealAnalysisPipelineConfiguration(): MealAnalysisPipelineConfiguration {
  return {
    primary: {
      provider: "openai",
      model: OPENAI_MEAL_ANALYSIS_MODEL,
      endpoint: process.env.OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses",
      reasoningEffort: process.env.OPENAI_MEAL_ANALYSIS_REASONING_EFFORT || "low",
    },
    validator: null,
    fallback: null,
  };
}

export function getConfiguredMealAnalysisProvider(): MealVisionProvider {
  // Durable jobs own retries. Keeping one HTTP attempt per invocation avoids
  // spending the whole serverless window retrying the same provider in memory.
  return createOpenAiMealVisionProvider({ maxAttempts: 1 });
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

/** One Luna call per attempt; the durable job owns retries. */
export async function analyzeMealInputWithFallback(
  input: MealVisionInput,
  options: { provider?: MealVisionProvider; requestId?: string; verify?: boolean } = {},
) {
  const primary = options.provider ?? getConfiguredMealAnalysisProvider();
  const primaryConfiguration = { provider: primary.name, model: primary.model };
  const analysed = await analyzeMealInput(input, primary, { requestId: options.requestId });
  return {
    ...analysed,
    provenance: pipelineProvenance({
      primary: primaryConfiguration,
      final: { provider: analysed.provider, model: analysed.model },
      validation: analysed.validation,
      fallback: { configured: false, attempted: false, used: false, provider: null, model: null },
    }),
  };
}

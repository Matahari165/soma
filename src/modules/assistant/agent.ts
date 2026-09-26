import "server-only";

import { openai, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { isStepCount, ToolLoopAgent, type ModelMessage } from "ai";

import type { AssistantQuality } from "./contracts";
import { assistantInstructionsForTurn, createAssistantTemporalContext, type AssistantTemporalContext } from "./prompt";
import { createGetUserContextTool } from "./tools/get-user-context";
import { createGetPlanDetailsTool } from "./tools/get-plan-details";
import { createGetStrongestEffectsTool } from "./tools/get-strongest-effects";
import { createGetWorkoutHistoryTool } from "./tools/get-workout-history";
import { createGetLatestRunTool } from "./tools/get-latest-run";
import { createManageUserContextTool } from "./tools/manage-user-context";
import { createManageMealTool } from "./tools/manage-meal";
import { createManageNutritionTargetsTool } from "./tools/manage-nutrition-targets";
import { createQuerySomaDataTool } from "./tools/query-soma-data";

export const SOMA_ASSISTANT_PROVIDER = "openai";
export const SOMA_ASSISTANT_MODEL = "gpt-6-luna";

const qualitySettings: Record<AssistantQuality, {
  maxOutputTokens: number;
  maxSteps: number;
  reasoningEffort: OpenAILanguageModelResponsesOptions["reasoningEffort"];
}> = {
  fast: { maxOutputTokens: 1_200, maxSteps: 6, reasoningEffort: "medium" },
  balanced: { maxOutputTokens: 2_400, maxSteps: 10, reasoningEffort: "high" },
  deep: { maxOutputTokens: 4_000, maxSteps: 14, reasoningEffort: "xhigh" },
};

export type SomaAssistantAgent = {
  generate(input: { messages: ModelMessage[]; timeout?: number }): Promise<{
    text: string;
    finishReason: string;
    totalUsage: unknown;
    steps?: ReadonlyArray<{ readonly toolResults: ReadonlyArray<{ readonly toolName: string; readonly input: unknown; readonly output: unknown }> }>;
  }>;
};

export function createSomaAssistantAgent(input: {
  userId: string;
  runId: string;
  quality: AssistantQuality;
  triggeringMessageId: string;
  triggeringUserText: string;
  conversationId: string;
  temporalContext?: AssistantTemporalContext;
}): SomaAssistantAgent {
  const settings = qualitySettings[input.quality];
  const temporalContext = input.temporalContext ?? createAssistantTemporalContext({ now: new Date(), profileTimezone: null });
  return new ToolLoopAgent({
    model: openai.responses(SOMA_ASSISTANT_MODEL),
    instructions: assistantInstructionsForTurn(temporalContext),
    tools: {
      getUserContext: createGetUserContextTool(input),
      getPlanDetails: createGetPlanDetailsTool(input),
      getStrongestEffects: createGetStrongestEffectsTool(input),
      getWorkoutHistory: createGetWorkoutHistoryTool(input),
      getLatestRun: createGetLatestRunTool(input),
      querySomaData: createQuerySomaDataTool(input),
      manageUserContext: createManageUserContextTool(input),
      manageMeal: createManageMealTool(input),
      manageNutritionTargets: createManageNutritionTargetsTool(input),
    },
    stopWhen: isStepCount(settings.maxSteps),
    maxOutputTokens: settings.maxOutputTokens,
    providerOptions: {
      openai: {
        reasoningEffort: settings.reasoningEffort,
        store: false,
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });
}

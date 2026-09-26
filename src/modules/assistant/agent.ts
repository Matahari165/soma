import "server-only";

import { openai, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { isStepCount, ToolLoopAgent, type ModelMessage, type ToolSet } from "ai";

import type { AssistantQuality } from "./contracts";
import { SOMA_ASSISTANT_INSTRUCTIONS } from "./prompt";
import { createGetUserContextTool } from "./tools/get-user-context";
import { createGetPlanDetailsTool } from "./tools/get-plan-details";
import { createGetStrongestEffectsTool } from "./tools/get-strongest-effects";
import { createGetWorkoutHistoryTool } from "./tools/get-workout-history";
import { createGetLatestRunTool } from "./tools/get-latest-run";
import { createManageUserContextTool } from "./tools/manage-user-context";
import { createManageMealTool } from "./tools/manage-meal";
import { createManageNutritionTargetsTool } from "./tools/manage-nutrition-targets";
import { createQuerySomaDataTool } from "./tools/query-soma-data";

import { createGetDataCatalogTool } from "./tools/get-data-catalog";
import { createQueryLabAnalysesTool } from "./tools/query-lab-analyses";
import { createGetActivityTelemetryTool } from "./tools/get-activity-telemetry";
import { createQueryRawHealthTool } from "./tools/query-raw-health";
import { createSummarizeSomaDataTool } from "./tools/summarize-soma-data";
import { createSearchConversationTool } from "./tools/search-conversation";
import { createReopenConversationImageTool } from "./tools/reopen-conversation-image";

export const SOMA_ASSISTANT_PROVIDER = "openai";
export const SOMA_ASSISTANT_MODEL = "gpt-6-luna";

const qualitySettings: Record<AssistantQuality, {
  maxOutputTokens: number;
  maxSteps: number;
  reasoningEffort: OpenAILanguageModelResponsesOptions["reasoningEffort"];
}> = {
  fast: { maxOutputTokens: 1_200, maxSteps: 6, reasoningEffort: "medium" },
  balanced: { maxOutputTokens: 2_400, maxSteps: 10, reasoningEffort: "medium" },
  deep: { maxOutputTokens: 4_000, maxSteps: 14, reasoningEffort: "high" },
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
}): SomaAssistantAgent {
  const settings = qualitySettings[input.quality];
  const tools: ToolSet = {
    getUserContext: createGetUserContextTool(input),
    getPlanDetails: createGetPlanDetailsTool(input),
    getStrongestEffects: createGetStrongestEffectsTool(input),
    getWorkoutHistory: createGetWorkoutHistoryTool(input),
    getLatestRun: createGetLatestRunTool(input),
    querySomaData: createQuerySomaDataTool(input),
    getDataCatalog: createGetDataCatalogTool(),
    queryLabAnalyses: createQueryLabAnalysesTool(input),
    getActivityTelemetry: createGetActivityTelemetryTool(input),
    queryRawHealth: createQueryRawHealthTool(input),
    summarizeSomaData: createSummarizeSomaDataTool(input),
    searchConversation: createSearchConversationTool(input),
    reopenConversationImage: createReopenConversationImageTool(input),
    manageUserContext: createManageUserContextTool(input),
    manageMeal: createManageMealTool(input),
    manageNutritionTargets: createManageNutritionTargetsTool(input),
  };
  return new ToolLoopAgent({
    model: openai.responses(SOMA_ASSISTANT_MODEL),
    instructions: `${SOMA_ASSISTANT_INSTRUCTIONS}\n\nHORLOGE SERVEUR : ${new Date().toISOString()} (UTC). Utilise le fuseau renvoyé par les outils Soma pour interpréter « aujourd'hui » et « hier ».`,
    tools,
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

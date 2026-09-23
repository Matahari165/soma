import "server-only";

import { openai, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import { isStepCount, ToolLoopAgent, type ModelMessage } from "ai";

import type { AssistantQuality } from "./contracts";
import { SOMA_ASSISTANT_INSTRUCTIONS } from "./prompt";
import { createGetUserContextTool } from "./tools/get-user-context";
import { createGetPlanDetailsTool } from "./tools/get-plan-details";
import { createManageUserContextTool } from "./tools/manage-user-context";
import { createManageMealTool } from "./tools/manage-meal";
import { createQuerySomaDataTool } from "./tools/query-soma-data";

export const SOMA_ASSISTANT_PROVIDER = "openai";
export const SOMA_ASSISTANT_MODEL = "gpt-6-luna";

const qualitySettings: Record<AssistantQuality, {
  maxOutputTokens: number;
  maxSteps: number;
  reasoningEffort: OpenAILanguageModelResponsesOptions["reasoningEffort"];
}> = {
  fast: { maxOutputTokens: 1_200, maxSteps: 6, reasoningEffort: "low" },
  balanced: { maxOutputTokens: 2_400, maxSteps: 6, reasoningEffort: "medium" },
  deep: { maxOutputTokens: 4_000, maxSteps: 8, reasoningEffort: "high" },
};

export type SomaAssistantAgent = {
  generate(input: { messages: ModelMessage[]; timeout?: number }): Promise<{
    text: string;
    finishReason: string;
    totalUsage: unknown;
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
  return new ToolLoopAgent({
    model: openai.responses(SOMA_ASSISTANT_MODEL),
    instructions: SOMA_ASSISTANT_INSTRUCTIONS,
    tools: {
      getUserContext: createGetUserContextTool(input),
      getPlanDetails: createGetPlanDetailsTool(input),
      querySomaData: createQuerySomaDataTool(input),
      manageUserContext: createManageUserContextTool(input),
      manageMeal: createManageMealTool(input),
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

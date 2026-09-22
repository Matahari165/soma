import "server-only";

import { xai, type XaiLanguageModelResponsesOptions } from "@ai-sdk/xai";
import { isStepCount, ToolLoopAgent, type ModelMessage } from "ai";

import type { AssistantQuality } from "./contracts";
import { SOMA_ASSISTANT_INSTRUCTIONS } from "./prompt";
import { createGetUserContextTool } from "./tools/get-user-context";
import { createManageUserContextTool } from "./tools/manage-user-context";
import { createManageMealTool } from "./tools/manage-meal";
import { createQuerySomaDataTool } from "./tools/query-soma-data";

export const SOMA_ASSISTANT_MODEL = "grok-4.7";

const qualitySettings: Record<AssistantQuality, {
  maxOutputTokens: number;
  maxSteps: number;
  reasoningEffort: XaiLanguageModelResponsesOptions["reasoningEffort"];
}> = {
  fast: { maxOutputTokens: 1_200, maxSteps: 4, reasoningEffort: "low" },
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
    model: xai.responses(SOMA_ASSISTANT_MODEL),
    instructions: SOMA_ASSISTANT_INSTRUCTIONS,
    tools: {
      getUserContext: createGetUserContextTool(input),
      querySomaData: createQuerySomaDataTool(input),
      manageUserContext: createManageUserContextTool(input),
      manageMeal: createManageMealTool(input),
    },
    stopWhen: isStepCount(settings.maxSteps),
    maxOutputTokens: settings.maxOutputTokens,
    providerOptions: {
      xai: {
        reasoningEffort: settings.reasoningEffort,
        store: false,
      } satisfies XaiLanguageModelResponsesOptions,
    },
  });
}

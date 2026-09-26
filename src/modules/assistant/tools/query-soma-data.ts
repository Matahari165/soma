import "server-only";

import { tool } from "ai";

import { assistantSemanticQuerySchema } from "../contracts";
import { queryAssistantData } from "../data/semantic-query";
import { executeAuditedAssistantTool } from "./audited-tool";

export function createQuerySomaDataTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Interroge les données Soma canoniques (santé, scores, nutrition, activités, sessions de sommeil ou repas) sur une période explicite, sans transformer une absence en zéro.",
    inputSchema: assistantSemanticQuerySchema,
    execute: async (input, options) => executeAuditedAssistantTool({
      context,
      toolName: "querySomaData",
      toolCallId: options.toolCallId,
      arguments: input,
      execute: () => queryAssistantData(context.userId, input),
    }),
  });
}

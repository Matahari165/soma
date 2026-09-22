import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { executeAuditedAssistantTool } from "./audited-tool";
import { loadAssistantUserContext } from "./user-context";

export function createGetUserContextTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Charge le profil Soma, les objectifs confirmés et les mémoires confirmées de l'utilisateur authentifié.",
    inputSchema: z.object({}),
    execute: async (_input, options) => executeAuditedAssistantTool({
      context,
      toolName: "getUserContext",
      toolCallId: options.toolCallId,
      arguments: {},
      execute: () => loadAssistantUserContext(context.userId),
    }),
  });
}

import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { executeAuditedAssistantTool } from "./audited-tool";
import { loadAssistantUserContext } from "./user-context";

export function createGetUserContextTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Charge le profil Soma, les objectifs confirmés, les souvenirs valides et un résumé des plans actifs confirmés de l'utilisateur authentifié. Pour le détail d'un plan, appelle getPlanDetails.",
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

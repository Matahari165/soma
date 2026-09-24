import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { loadRecentWorkoutHistory } from "../data/workout-history";
import { executeAuditedAssistantTool } from "./audited-tool";

export function createGetWorkoutHistoryTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Lit les dernières séances de musculation terminées et les séries consignées dans Soma. Charge weightKg en kg : null signifie non renseignée, pas zéro. loggedReps n'est pas une preuve de répétitions réellement effectuées : l'ancienne interface copiait automatiquement la cible. Utilise cet outil pour la dernière séance ou les charges soulevées ; les activités santé importées ne contiennent pas ces séries.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(5).default(1) }),
    execute: async (input, options) => executeAuditedAssistantTool({
      context,
      toolName: "getWorkoutHistory",
      toolCallId: options.toolCallId,
      arguments: input,
      execute: () => loadRecentWorkoutHistory(context.userId, input.limit),
    }),
  });
}

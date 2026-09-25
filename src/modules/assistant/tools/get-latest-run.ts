import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { loadLatestRun } from "../data/latest-run";
import { executeAuditedAssistantTool } from "./audited-tool";

export function createGetLatestRunTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Récupère côté serveur la course enregistrée la plus récente, sans que le modèle ait à choisir une période. Compare les activités importées aux métriques quotidiennes et donne la fraîcheur de la synchronisation. Utilise cet outil pour toute question sur la dernière course.",
    inputSchema: z.object({}),
    execute: async (_input, options) => executeAuditedAssistantTool({
      context,
      toolName: "getLatestRun",
      toolCallId: options.toolCallId,
      arguments: {},
      execute: () => loadLatestRun(context.userId),
    }),
  });
}

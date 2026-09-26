import "server-only";
import { tool } from "ai";
import { assistantDataSummarySchema, summarizeAssistantData } from "../data/data-summary-job";
import { executeAuditedAssistantTool } from "./audited-tool";

export function createSummarizeSomaDataTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Parcourt les pages côté serveur pour résumer tout un historique ciblé (métriques ou activités) sans envoyer toutes les lignes au modèle. Calcule comptes, moyennes, sommes descriptives et tendances ; includeHeartRateZones=true calcule aussi les zones Soma pour chaque séance filtrée, sans charger les autres activités ; sauvegarde chaque page. Si status=running, reprendre avec jobId et la même query. Ne conclus jamais à l'exhaustivité si manifest.complete=false.",
    inputSchema: assistantDataSummarySchema,
    execute: (input, options) => executeAuditedAssistantTool({ context,
      toolName: "summarizeSomaData", toolCallId: options.toolCallId, arguments: input,
      execute: () => summarizeAssistantData(context.userId, input),
    }),
  });
}

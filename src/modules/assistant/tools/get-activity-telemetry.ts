import "server-only";
import { tool } from "ai";
import { assistantActivityTelemetrySchema, loadAssistantActivityTelemetry } from "../data/activity-telemetry";
import { executeAuditedAssistantTool } from "./audited-tool";

export function createGetActivityTelemetryTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Analyse une séance précise appartenant à l'utilisateur : zones Soma Z1–Z5, FC max personnelle/estimée, pauses, couverture et lacunes. Récupère automatiquement les mesures Google Health manquantes si possible. Sans includeSamples, ne renvoie pas la courbe. Les zones sont calculées sur toutes les mesures disponibles avant réduction de la courbe.",
    inputSchema: assistantActivityTelemetrySchema,
    execute: (input, options) => executeAuditedAssistantTool({
      context, toolName: "getActivityTelemetry", toolCallId: options.toolCallId,
      arguments: input, execute: () => loadAssistantActivityTelemetry(context.userId, input),
    }),
  });
}

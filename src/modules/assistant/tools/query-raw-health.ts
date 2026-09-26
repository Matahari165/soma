import "server-only";
import { tool } from "ai";
import { assistantRawHealthSchema, queryAssistantRawHealth } from "../data/raw-health";
import { executeAuditedAssistantTool } from "./audited-tool";

export function createQueryRawHealthTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Lit uniquement les mesures brutes Google Health du type et des bornes horaires demandés, par partitions quotidiennes. Inclut les archives vérifiées. Pour expliquer les zones d'une séance, préfère getActivityTelemetry : il utilise les données complètes avant réduction graphique. Pour un détail, suis nextCursor ; une partition vide n'indique pas que toute la période est vide.",
    inputSchema: assistantRawHealthSchema,
    execute: (input, options) => executeAuditedAssistantTool({ context,
      toolName: "queryRawHealth", toolCallId: options.toolCallId, arguments: input,
      execute: () => queryAssistantRawHealth(context.userId, input),
    }),
  });
}

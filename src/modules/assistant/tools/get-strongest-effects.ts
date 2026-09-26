import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { selectSummaryRelations, type AnalysisPeriod } from "@/domain/lab/matrix";
import { getPersonalLabSnapshot } from "@/services/personal-lab";

import { executeAuditedAssistantTool } from "./audited-tool";

const inputSchema = z.object({
  period: z.union([z.literal(15), z.literal(30), z.literal(90), z.literal("all")]).default(90),
  requireTemporalStability: z.boolean().default(false),
});

export async function loadAssistantStrongestEffects(userId: string, period: AnalysisPeriod, requireTemporalStability: boolean) {
  const snapshot = await getPersonalLabSnapshot({ id: userId, email: null, displayName: "" }, { periods: [period] });
  const relations = selectSummaryRelations(snapshot.matrix.rows.flatMap((row) => row.relations), { requireTemporalStability });
  return {
    period,
    generatedAt: new Date().toISOString(),
    coverage: snapshot.coverage,
    relationCount: relations.length,
    relations: relations.map((relation) => ({
      predictor: relation.predictorLabel,
      outcome: relation.outcomeLabel,
      outcomeUnit: relation.outcomeUnit,
      comparison: relation.comparisonLabel,
      effect: relation.effect,
      effectConfidenceLow: relation.effectConfidenceLow,
      effectConfidenceHigh: relation.effectConfidenceHigh,
      lagDays: relation.lagDays,
      sampleDays: relation.sampleSize,
      evidence: relation.evidence,
      stable: relation.stable,
      coverageBySource: relation.coverageBySource,
    })),
    caveat: "Ces relations sont des associations personnelles, pas une preuve de causalité.",
  };
}

export function createGetStrongestEffectsTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Lit les associations Strongest Effects déjà calculées par Soma sur 15, 30, 90 jours ou tout l'historique. Renvoie au plus quatre relations et leur couverture ; ne conclue jamais à une causalité.",
    inputSchema,
    execute: async (input, options) => executeAuditedAssistantTool({
      context,
      toolName: "getStrongestEffects",
      toolCallId: options.toolCallId,
      arguments: input,
      execute: () => loadAssistantStrongestEffects(context.userId, input.period ?? 90, input.requireTemporalStability ?? false),
    }),
  });
}

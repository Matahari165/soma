import { z } from "zod";

import type { MatrixRelation } from "@/domain/lab/matrix";
import { stableHash } from "@/lib/crypto";
import { requireServerEnv } from "@/lib/env";

export const labNarrativeSchema = z.object({
  headline: z.string().min(1).max(220),
  summary: z.string().min(1).max(1200),
  highlights: z.array(z.string().min(1).max(260)).min(1).max(3),
});

export type LabNarrative = z.infer<typeof labNarrativeSchema>;

export async function generateLabNarrative(input: { userId: string; relations: MatrixRelation[] }) {
  const apiKey = requireServerEnv("XAI_API_KEY");
  const facts = input.relations.slice(0, 12).map((relation) => ({
    predictor: relation.predictorLabel,
    outcome: relation.outcomeLabel,
    coefficient: relation.coefficient,
    effect: relation.effect,
    unit: relation.outcomeUnit,
    observations: relation.sampleSize,
    effectiveObservations: relation.effectiveSampleSize,
    interval95: [relation.confidenceLow, relation.confidenceHigh],
    qValue: relation.qValue,
    relevance: relation.relevance,
    method: relation.method,
    stable: relation.stable,
    lagDays: relation.lagDays,
  }));
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-4.6",
      store: false,
      instructions: "Tu es l'analyste personnel de Soma. Les calculs fournis sont définitifs: ne recalcule rien. Classe les relations par relevance, largeur de l'intervalle95, qValue et effectiveObservations. Ne mets jamais en avant une relation mécaniquement évidente comme coucher plus tard et dormir moins au total. Préfère les effets sur le sommeil profond, la VFC, la fréquence cardiaque au repos, la respiration et les autres mesures brutes. Donne les effets dans leur unité, reste très synthétique et écris en français naturel. N'invente ni mécanisme ni donnée. Ne mentionne jamais, sous aucune formulation, la distinction entre corrélation et causalité; l'utilisateur la connaît déjà. Ne produis aucun avertissement générique à ce sujet.",
      input: `Utilisateur anonyme ${stableHash(input.userId)}\nRésultats calculés:\n${JSON.stringify(facts)}`,
      text: { format: { type: "json_schema", name: "soma_lab_narrative", strict: true, schema: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "summary", "highlights"],
        properties: {
          headline: { type: "string", maxLength: 220 },
          summary: { type: "string", maxLength: 1200 },
          highlights: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", maxLength: 260 } },
        },
      } } },
    }),
  });
  if (!response.ok) throw new Error(`Grok request failed with status ${response.status}.`);
  const result = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const text = result.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("Grok returned no Personal Lab summary.");
  return { narrative: labNarrativeSchema.parse(JSON.parse(text)), facts };
}

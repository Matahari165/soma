import "server-only";

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { tool } from "ai";
import { z } from "zod";

import { parseNutritionTargets, type NutritionTargets, type NutritionTargetRange } from "@/domain/nutrition-targets";
import { loadNutritionTargetsStateForUser } from "@/services/nutrition-targets";

import { confirmNutritionTargetAction, findAssistantAction, loadPendingNutritionTargetActions, proposeNutritionTargetAction } from "../repository";
import { executeAuditedAssistantTool } from "./audited-tool";
import { assertAssistantConfirmation } from "./manage-user-context";

const finiteTarget = z.number().finite().min(0).max(20_000);
const rangePatch = z.object({
  low: finiteTarget.optional(), likely: finiteTarget.optional(), high: finiteTarget.optional(),
}).refine((value) => Object.keys(value).length > 0, "A nutrition range change cannot be empty.");

export const nutritionTargetPatchSchema = z.object({
  caloriesKcal: rangePatch.optional(), proteinG: rangePatch.optional(), fatG: rangePatch.optional(),
  carbsG: rangePatch.optional(), fiberG: rangePatch.optional(), addedSugarG: rangePatch.optional(),
  surplusKcal: z.number().finite().min(-2_000).max(2_000).optional(),
  mealDistribution: z.object({
    breakfast: z.number().min(0).max(100), lunch: z.number().min(0).max(100),
    snack: z.number().min(0).max(100), dinner: z.number().min(0).max(100),
  }).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one nutrition target change is required.");

type NutritionTargetPatch = z.infer<typeof nutritionTargetPatchSchema>;

function patchedRange(current: NutritionTargetRange, patch: Partial<NutritionTargetRange>): NutritionTargetRange {
  const delta = patch.likely === undefined ? 0 : patch.likely - current.likely;
  return {
    low: patch.low ?? Math.max(0, current.low + delta),
    likely: patch.likely ?? current.likely,
    high: patch.high ?? current.high + delta,
  };
}

export function applyNutritionTargetPatch(current: NutritionTargets, rawPatch: unknown): NutritionTargets {
  const patch = nutritionTargetPatchSchema.parse(rawPatch) as NutritionTargetPatch;
  const next: NutritionTargets = {
    caloriesKcal: patch.caloriesKcal ? patchedRange(current.caloriesKcal, patch.caloriesKcal) : current.caloriesKcal,
    proteinG: patch.proteinG ? patchedRange(current.proteinG, patch.proteinG) : current.proteinG,
    fatG: patch.fatG ? patchedRange(current.fatG, patch.fatG) : current.fatG,
    carbsG: patch.carbsG ? patchedRange(current.carbsG, patch.carbsG) : current.carbsG,
    fiberG: patch.fiberG ? patchedRange(current.fiberG, patch.fiberG) : current.fiberG,
    addedSugarG: patch.addedSugarG ? patchedRange(current.addedSugarG, patch.addedSugarG) : current.addedSugarG,
    surplusKcal: patch.surplusKcal ?? current.surplusKcal,
    mealDistribution: patch.mealDistribution ?? current.mealDistribution,
  };
  if (next.addedSugarG.low > next.addedSugarG.likely || next.addedSugarG.likely > next.addedSugarG.high) {
    throw new Error("Les nouvelles cibles sont incohérentes. Vérifie les bornes et la répartition des repas.");
  }
  const valid = parseNutritionTargets(next);
  if (!valid) throw new Error("Les nouvelles cibles sont incohérentes. Vérifie les bornes et la répartition des repas.");
  if (isDeepStrictEqual(valid, parseNutritionTargets(current))) throw new Error("Ces cibles sont déjà enregistrées.");
  return valid;
}

function targetsFromPayload(payload: Record<string, unknown>) {
  const before = parseNutritionTargets(payload.before);
  const after = parseNutritionTargets(payload.after);
  if (!before || !after) throw new Error("La proposition de cibles n'est plus valide.");
  return { before, after };
}

const inputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("read") }),
  z.object({ operation: z.literal("propose"), patch: nutritionTargetPatchSchema }),
  z.object({ operation: z.literal("confirm"), targetId: z.uuid(), confirmationQuote: z.string().trim().min(1).max(500) }),
]);

export function createManageNutritionTargetsTool(context: {
  userId: string; runId: string; conversationId: string;
  triggeringMessageId: string; triggeringUserText: string;
}) {
  return tool({
    description: "Lis les cibles nutritionnelles de Soma, propose une modification partielle, puis confirme la dernière proposition après accord clair en langage naturel. Les cibles de base sont distinctes des cibles journalières ajustées à l'effort. Pour modifier la valeur centrale d'une plage, fournis likely ; Soma conserve l'amplitude existante. Pour une répartition des repas, fournis les quatre pourcentages totalisant 100. Ne confirme jamais sans avoir présenté la proposition.",
    inputSchema,
    execute: async (input, options) => executeAuditedAssistantTool({
      context,
      toolName: "manageNutritionTargets",
      toolCallId: options.toolCallId,
      arguments: input,
      operationClass: input.operation === "confirm" ? "execute_confirmed" : input.operation === "propose" ? "propose" : "read",
      execute: async () => {
        if (input.operation === "read") {
          const [state, pending] = await Promise.all([
            loadNutritionTargetsStateForUser(context.userId),
            loadPendingNutritionTargetActions(context.userId),
          ]);
          return {
            targets: state.targets, persisted: state.persisted,
            pending: pending.map((action) => ({ id: action.id, proposed: targetsFromPayload(action.payload).after })),
          };
        }
        if (input.operation === "propose") {
          const state = await loadNutritionTargetsStateForUser(context.userId);
          const after = applyNutritionTargetPatch(state.targets, input.patch);
          const digest = createHash("sha256").update(JSON.stringify(input.patch)).digest("hex").slice(0, 24);
          const action = await proposeNutritionTargetAction({
            userId: context.userId, conversationId: context.conversationId, runId: context.runId,
            idempotencyKey: `nutrition-propose:${context.triggeringMessageId}:${digest}`,
            payload: { before: state.targets, rawBefore: state.rawTargets ?? null, after, persisted: state.persisted },
          });
          const proposal = targetsFromPayload(action.payload);
          if (!isDeepStrictEqual(proposal.before, state.targets) || !isDeepStrictEqual(proposal.after, after)) {
            throw new Error("La proposition précédente ne correspond plus aux cibles actuelles.");
          }
          return { proposalId: action.id, current: state.targets, proposed: proposal.after, persisted: state.persisted };
        }
        assertAssistantConfirmation(context.triggeringUserText, input.confirmationQuote);
        const pending = await loadPendingNutritionTargetActions(context.userId);
        const action = pending[0]?.id === input.targetId
          ? pending[0]
          : await findAssistantAction(context.userId, input.targetId);
        if (!action || action.action_type !== "nutrition_targets.update") throw new Error("Proposition de cibles introuvable.");
        const { before, after } = targetsFromPayload(action.payload);
        if (action.state === "executed" && action.confirmation_message_id === context.triggeringMessageId) {
          return confirmNutritionTargetAction(context.userId, action.id, context.triggeringMessageId);
        }
        if (action.state !== "proposed" || pending[0]?.id !== action.id) {
          throw new Error("Une proposition plus récente existe. Vérifie-la avant de confirmer.");
        }
        const current = (await loadNutritionTargetsStateForUser(context.userId)).targets;
        if (!isDeepStrictEqual(current, before) && !isDeepStrictEqual(current, after)) {
          throw new Error("Les cibles ont changé depuis la proposition. Présente une version mise à jour.");
        }
        return confirmNutritionTargetAction(context.userId, action.id, context.triggeringMessageId);
      },
    }),
  });
}

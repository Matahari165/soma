import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { assistantGoalSetInputSchema, assistantMemoryInputSchema, assistantPlanBodySchema } from "../contracts";
import {
  confirmAssistantGoalSet,
  confirmAssistantMemory,
  confirmAssistantPlanVersion,
  proposeAssistantGoalSet,
  proposeAssistantMemory,
  proposeAssistantPlanVersion,
  saveAssistantGoalSet,
} from "../repository";
import { executeAuditedAssistantTool } from "./audited-tool";

const confirmationFields = z.object({
  targetId: z.uuid(),
  confirmationQuote: z.string().trim().min(1).max(500),
});

const inputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("propose_memory"), memory: assistantMemoryInputSchema }),
  z.object({ operation: z.literal("confirm_memory"), ...confirmationFields.shape }),
  z.object({ operation: z.literal("propose_goal_set"), goalSet: assistantGoalSetInputSchema }),
  z.object({ operation: z.literal("confirm_goal_set"), ...confirmationFields.shape }),
  z.object({ operation: z.literal("save_goal_set"), confirmationQuote: confirmationFields.shape.confirmationQuote, goalSet: assistantGoalSetInputSchema }),
  z.object({
    operation: z.literal("propose_plan"),
    goalSetId: z.uuid().nullable().default(null),
    planId: z.uuid().optional(),
    plan: assistantPlanBodySchema,
  }),
  z.object({ operation: z.literal("confirm_plan"), ...confirmationFields.shape }),
]);

function normalizeConfirmation(value: string) {
  return value.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim();
}

export function assertAssistantConfirmation(userText: string, quote: string) {
  const normalizedText = normalizeConfirmation(userText);
  if (!normalizedText.includes(normalizeConfirmation(quote))) {
    throw new Error("La confirmation doit citer exactement une partie du message utilisateur actuel.");
  }
  const beginsWithApproval = /^(?:oui\b|ok\b|d'accord\b|c'est bon\b|ca marche\b|ca me va\b|vas-y\b|valide\b|je (?:valide|confirme|approuve)\b|(?:enregistre|sauvegarde|garde)\b)/u.test(normalizedText);
  const changesOrConditions = /\b(?:pas|non|mais|si|sauf|condition|reserve|refuse|attends|corrige|correction|reessaie|relire|plutot|avant|erreur|modifie|modifier|change|changer)\b/u
    .test(normalizedText.replace(/\bne change rien\b/gu, ""));
  if (!beginsWithApproval || changesOrConditions || /\bne\s+(?:valide|confirme|veux)\b/u.test(normalizedText)) {
    throw new Error("Une confirmation explicite et sans correction est nécessaire avant cet enregistrement.");
  }
}

export function createManageUserContextTool(context: {
  userId: string;
  runId: string;
  triggeringMessageId: string;
  triggeringUserText: string;
}) {
  return tool({
    description: "Propose ou confirme une mémoire, un cadre d’objectifs ou une version de plan. Pour enregistrer un cadre d’objectifs que l’utilisateur vient de valider, utilise save_goal_set en un seul appel avec le cadre complet et une citation exacte de sa confirmation. Une confirmation doit être explicite et sans correction.",
    inputSchema,
    execute: async (input, options) => {
      const confirming = input.operation.startsWith("confirm_") || input.operation === "save_goal_set";
      return executeAuditedAssistantTool({
        context,
        toolName: "manageUserContext",
        toolCallId: options.toolCallId,
        arguments: input,
        operationClass: confirming ? "execute_confirmed" : "propose",
        execute: async () => {
          if (input.operation === "propose_memory") {
            return proposeAssistantMemory(context.userId, context.triggeringMessageId, input.memory);
          }
          if (input.operation === "propose_goal_set") {
            return proposeAssistantGoalSet(context.userId, context.triggeringMessageId, input.goalSet);
          }
          if (input.operation === "save_goal_set") {
            assertAssistantConfirmation(context.triggeringUserText, input.confirmationQuote);
            return saveAssistantGoalSet(context.userId, context.triggeringMessageId, input.goalSet);
          }
          if (input.operation === "propose_plan") {
            return proposeAssistantPlanVersion({
              userId: context.userId,
              sourceMessageId: context.triggeringMessageId,
              goalSetId: input.goalSetId,
              planId: input.planId,
              body: input.plan,
            });
          }

          assertAssistantConfirmation(context.triggeringUserText, input.confirmationQuote);
          if (input.operation === "confirm_memory") {
            return confirmAssistantMemory(context.userId, input.targetId, context.triggeringMessageId);
          }
          if (input.operation === "confirm_goal_set") {
            return confirmAssistantGoalSet(context.userId, input.targetId, context.triggeringMessageId);
          }
          return confirmAssistantPlanVersion(context.userId, input.targetId, context.triggeringMessageId);
        },
      });
    },
  });
}

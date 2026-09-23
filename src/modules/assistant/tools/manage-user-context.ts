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
  const normalizedQuote = normalizeConfirmation(quote);
  if (!normalizedQuote || !normalizedText.includes(normalizedQuote)) {
    throw new Error("La confirmation doit citer exactement une partie du message utilisateur actuel.");
  }
  // The model interprets natural intent. This guard only blocks obvious non-consent;
  // it must never force the user to repeat one exact command word.
  const explicitApproval = /\b(?:oui|ok|d'accord|c'est bon|ca marche|ca me va|parfait|vas-y|valide|validons|confirme|approuve|enregistre|enregistrer|sauvegarde|sauvegarder|garde|garder|finalise|finaliser)\b/u.test(normalizedText);
  const refusal = /\b(?:je ne (?:valide|confirme|veux)(?: pas)?|je refuse|n'enregistre pas|ne pas (?:enregistrer|sauvegarder|garder)|ne (?:l'|les |le |la )?(?:enregistre|sauvegarde|garde) pas|pas encore|plus tard|attends|attendez|reessaie|a relire|a revoir|on verra|pour l'instant|provisoirement|a condition|d'abord|avant de|mais|si|sauf)\b/u.test(normalizedText);
  const directQuestionRequest = /\b(?:peux-tu|tu peux|est-ce que tu peux)\b.{0,100}\b(?:enregistrer|sauvegarder|garder|valider)\b/u.test(normalizedText);
  if (!explicitApproval || refusal || (normalizedText.endsWith("?") && !directQuestionRequest)) {
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
    description: "Propose ou confirme une mémoire, un cadre d’objectifs ou une version de plan. Comprends les confirmations en langage naturel : « c’est bon, tu peux enregistrer » suffit. Une correction, un refus ou une simple question sur le cadre ne vaut pas confirmation ; une demande explicite de sauvegarder, même formulée comme une question, le peut. Ne demande jamais une formule exacte. Pour un cadre déjà proposé et inchangé, confirme son identifiant ; sinon save_goal_set peut enregistrer directement le cadre explicitement approuvé, même si ses métriques facultatives sont inconnues.",
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

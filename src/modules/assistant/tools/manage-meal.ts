import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { mealTypeSchema } from "@/domain/meals";
import { findMealByIdempotencyKey } from "@/repositories/meals";
import { createMeal, deleteMeal } from "@/services/meals";

import {
  findAssistantAction,
  findAssistantActionByIdempotencyKey,
  markAssistantActionUndone,
  recordExecutedAssistantMealAction,
} from "../repository";
import { loadAssistantUserContext } from "./user-context";
import { executeAuditedAssistantTool } from "./audited-tool";

const inputSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("record"),
    mealType: mealTypeSchema,
    mealDate: z.iso.date().optional(),
    description: z.string().trim().min(1).max(500),
    authorizationQuote: z.string().trim().min(1).max(500),
  }),
  z.object({
    operation: z.literal("undo"),
    actionId: z.uuid(),
    authorizationQuote: z.string().trim().min(1).max(500),
  }),
]);

function normalize(value: string) {
  return value.toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function assertQuote(userText: string, quote: string) {
  if (!normalize(userText).includes(normalize(quote))) {
    throw new Error("L’autorisation doit citer exactement une partie du message utilisateur actuel.");
  }
}

function assertIntent(userText: string, operation: "record" | "undo") {
  const value = normalize(userText);
  const pattern = operation === "record"
    ? /\b(enregistre|enregistrer|ajoute|ajouter|consigne|consigner|record|log)\b/
    : /\b(annule|annuler|supprime|supprimer|undo)\b/;
  if (!pattern.test(value)) throw new Error("L’action exige une demande explicite dans le message utilisateur actuel.");
}

function dateInTimezone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function createManageMealTool(context: {
  userId: string;
  runId: string;
  conversationId: string;
  triggeringMessageId: string;
  triggeringUserText: string;
}) {
  return tool({
    description: "Enregistre un repas texte explicitement demandé, ou annule cet enregistrement. Le type de repas est obligatoire. Sans date, utilise aujourd’hui dans le fuseau du profil.",
    inputSchema,
    execute: async (input, options) => {
      assertQuote(context.triggeringUserText, input.authorizationQuote);
      assertIntent(context.triggeringUserText, input.operation);
      const idempotencyKey = input.operation === "record"
        ? `meal-record:${context.triggeringMessageId}`
        : `meal-undo:${context.triggeringMessageId}:${input.actionId}`;

      return executeAuditedAssistantTool({
        context,
        toolName: "manageMeal",
        toolCallId: options.toolCallId,
        arguments: input,
        operationClass: input.operation === "record" ? "execute_confirmed" : "undo",
        execute: async () => {
          if (input.operation === "record") {
            const existingAction = await findAssistantActionByIdempotencyKey(context.userId, idempotencyKey);
            if (existingAction) return { actionId: existingAction.id, mealId: existingAction.target_id, recorded: true, replayed: true };

            const userContext = await loadAssistantUserContext(context.userId);
            const mealDate = input.mealDate ?? dateInTimezone(userContext.profile.timezone);
            const { meal, created } = await createMeal(context.userId, {
              mealDate,
              mealType: input.mealType,
              note: input.description,
              status: "confirmed",
              entryState: "recorded",
              idempotencyKey,
            });
            if (!created) {
              const mealForRetry = await findMealByIdempotencyKey(context.userId, idempotencyKey);
              if (mealForRetry !== meal.id) {
                throw new Error("Un repas existe déjà pour ce créneau. Demande une modification explicite au lieu de l’écraser.");
              }
            }
            const action = await recordExecutedAssistantMealAction({
              userId: context.userId,
              conversationId: context.conversationId,
              runId: context.runId,
              confirmationMessageId: context.triggeringMessageId,
              idempotencyKey,
              mealId: meal.id,
              payload: { mealDate, mealType: input.mealType, description: input.description },
            });
            return { actionId: action.id, mealId: meal.id, recorded: true, created, mealDate, mealType: input.mealType, undoAvailable: true };
          }

          const action = await findAssistantAction(context.userId, input.actionId);
          if (!action || action.action_type !== "meal.create" || action.state !== "executed" || !action.target_id) {
            throw new Error("Cet enregistrement de repas ne peut pas être annulé.");
          }
          if (action.undo_deadline && Date.parse(action.undo_deadline) < Date.now()) {
            throw new Error("Le délai d’annulation de cet enregistrement est dépassé.");
          }
          await deleteMeal(context.userId, action.target_id);
          const undone = await markAssistantActionUndone(context.userId, action.id);
          return { actionId: undone.id, mealId: action.target_id, undone: true };
        },
      });
    },
  });
}

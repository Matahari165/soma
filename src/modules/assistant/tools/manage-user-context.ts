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
  z.object({
    operation: z.literal("propose_plan"),
    goalSetId: z.uuid().nullable().default(null),
    planId: z.uuid().optional(),
    plan: assistantPlanBodySchema,
  }),
  z.object({ operation: z.literal("confirm_plan"), ...confirmationFields.shape }),
]);

function assertConfirmationQuote(userText: string, quote: string) {
  const normalize = (value: string) => value.toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();
  if (!normalize(userText).includes(normalize(quote))) {
    throw new Error("La confirmation doit citer exactement une partie du message utilisateur actuel.");
  }
}

export function createManageUserContextTool(context: {
  userId: string;
  runId: string;
  triggeringMessageId: string;
  triggeringUserText: string;
}) {
  return tool({
    description: "Propose ou confirme une mémoire, un cadre d’objectifs ou une version de plan. Les propositions restent inactives; une confirmation exige une citation exacte du message utilisateur actuel.",
    inputSchema,
    execute: async (input, options) => {
      const confirming = input.operation.startsWith("confirm_");
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
          if (input.operation === "propose_plan") {
            return proposeAssistantPlanVersion({
              userId: context.userId,
              sourceMessageId: context.triggeringMessageId,
              goalSetId: input.goalSetId,
              planId: input.planId,
              body: input.plan,
            });
          }

          assertConfirmationQuote(context.triggeringUserText, input.confirmationQuote);
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

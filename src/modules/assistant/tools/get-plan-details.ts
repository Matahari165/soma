import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { assistantPlanBodySchema } from "../contracts";
import { loadActiveAssistantPlan } from "../repository";
import { executeAuditedAssistantTool } from "./audited-tool";

export function createGetPlanDetailsTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Lit une section d'un plan confirmé actif ou à revoir après un changement d'objectif, avec pagination. Utilise l'identifiant fourni par getUserContext et respecte le statut returned. Ne déduis pas le contenu d'une section à partir de son titre.",
    inputSchema: z.object({
      planId: z.uuid(),
      sectionIndex: z.number().int().min(0).max(19).default(0),
      cursor: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(20).default(10),
    }),
    execute: async (input, options) => executeAuditedAssistantTool({
      context,
      toolName: "getPlanDetails",
      toolCallId: options.toolCallId,
      arguments: input,
      execute: async () => {
        const plan = await loadActiveAssistantPlan(context.userId, input.planId);
        if (!plan) return { found: false, reason: "not_active_or_not_owned" };
        const parsed = assistantPlanBodySchema.safeParse(plan.confirmedVersion?.body);
        if (!parsed.success) return { found: false, reason: "confirmed_version_unavailable" };
        const body = parsed.data;
        const section = body.sections[input.sectionIndex];
        if (!section) return { found: false, reason: "section_not_found", sectionCount: body.sections.length };
        const items = section.content.slice(input.cursor, input.cursor + input.limit);
        const nextCursor = input.cursor + items.length;
        return {
          found: true,
          planId: plan.id,
          status: plan.status,
          version: plan.confirmedVersion?.version,
          title: body.title,
          objectiveSummary: body.objectiveSummary,
          detailedThrough: body.detailedThrough,
          reviewOn: body.reviewOn,
          phases: body.phases.map((phase) => ({ title: phase.title, startsOn: phase.startsOn, endsOn: phase.endsOn })),
          sectionIndex: input.sectionIndex,
          sectionCount: body.sections.length,
          section: { domain: section.domain, title: section.title, itemCount: section.content.length },
          items,
          nextCursor: nextCursor < section.content.length ? nextCursor : null,
          complete: nextCursor >= section.content.length,
        };
      },
    }),
  });
}

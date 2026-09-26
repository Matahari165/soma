import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { loadAssistantLabAnalyses } from "../data/lab-analyses";
import { executeAuditedAssistantTool } from "./audited-tool";

const periodSchema = z.union([z.literal(15), z.literal(30), z.literal(90), z.literal("all")]);

const inputSchema = z.object({
  periods: z.array(periodSchema).min(1).max(4).optional(),
  predictorId: z.string().trim().min(1).max(160).optional(),
  outcomeId: z.string().trim().min(1).max(160).optional(),
  mode: z.enum(["summary", "details", "compare"]).default("summary"),
  includeExploratory: z.boolean().default(false),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(40),
});

export function createQueryLabAnalysesTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Explains and compares the Personal Lab analyses already calculated by Soma. Filter by the exact predictorId and/or outcomeId returned in catalog. Without a requested window, uses 90 days; pass several periods to compare 15, 30, 90 days or all history. Published relations are returned by default; includeExploratory=true opts into non-published but analyzable associations. All modes are paginated: continue with nextOffset while hasMore is true. Reports coverage, uncertainty, q-values, lag, method, units and stability. Associations do not prove causation.",
    inputSchema,
    execute: async (input, options) => executeAuditedAssistantTool({
      context,
      toolName: "queryLabAnalyses",
      toolCallId: options.toolCallId,
      arguments: input,
      execute: () => loadAssistantLabAnalyses(context.userId, {
        ...input,
        periods: input.periods?.length ? input.periods : [90],
        mode: input.mode ?? "summary",
        includeExploratory: input.includeExploratory ?? false,
        offset: input.offset ?? 0,
        limit: input.limit ?? 40,
      }),
    }),
  });
}

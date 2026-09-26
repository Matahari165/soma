import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { GOOGLE_HEALTH_DATA_TYPES } from "@/integrations/google-health/client";

import { getAssistantDataCatalog } from "../data/health-catalog";
import { executeAuditedAssistantTool } from "./audited-tool";

export function createGetDataCatalogTool(context: { userId: string; runId: string }) {
  return tool({
    description: "Découvre les métriques de santé, leur format, unité, source et alias, ainsi que les types d’activité reconnus avant d’interroger les données.",
    inputSchema: z.object({}),
    execute: async (_input, options) => executeAuditedAssistantTool({
      context,
      toolName: "getDataCatalog",
      toolCallId: options.toolCallId,
      arguments: {},
      execute: async () => ({ ...getAssistantDataCatalog(), rawHealthTypes: GOOGLE_HEALTH_DATA_TYPES }),
    }),
  });
}

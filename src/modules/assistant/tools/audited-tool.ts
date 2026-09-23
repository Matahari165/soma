import "server-only";

import { completeAssistantToolCall, createAssistantToolCall } from "../repository";

type AuditedToolContext = {
  userId: string;
  runId: string;
};

function resultManifest(value: unknown) {
  if (!value || typeof value !== "object") return { resultType: typeof value };
  if ("manifest" in value) return { manifest: (value as { manifest: unknown }).manifest };
  return { resultType: Array.isArray(value) ? "array" : "object" };
}

async function completeAuditBestEffort(input: Parameters<typeof completeAssistantToolCall>[0]) {
  try {
    await completeAssistantToolCall(input);
  } catch {
    // A repeated status update is safe; never let an audit outage reverse a committed action.
    await completeAssistantToolCall(input).catch(() => undefined);
  }
}

export async function executeAuditedAssistantTool<T>(input: {
  context: AuditedToolContext;
  toolName: string;
  toolCallId: string;
  arguments: unknown;
  operationClass?: "read" | "propose" | "execute_confirmed" | "undo";
  execute: () => Promise<T>;
}) {
  const startedAt = Date.now();
  const call = await createAssistantToolCall({
    userId: input.context.userId,
    runId: input.context.runId,
    toolName: input.toolName,
    idempotencyKey: `${input.context.runId}:${input.toolCallId}`,
    argumentsManifest: input.arguments,
    operationClass: input.operationClass,
  });

  let result: T;
  try {
    result = await input.execute();
  } catch (error) {
    await completeAuditBestEffort({
      userId: input.context.userId,
      toolCallId: call.id,
      status: "failed",
      resultManifest: { error: error instanceof Error ? error.name : "UnknownError" },
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
  // An audit update can fail after the business write committed. Never turn that success
  // into a false tool failure that would prompt a duplicate user action.
  await completeAuditBestEffort({
    userId: input.context.userId,
    toolCallId: call.id,
    status: "completed",
    resultManifest: resultManifest(result),
    durationMs: Date.now() - startedAt,
  });
  return result;
}

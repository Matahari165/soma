import "server-only";

import { assistantAttachmentMetadataSchema, assistantGoalSetInputSchema, assistantMemoryInputSchema, assistantPlanBodySchema, assistantMessagePartSchema, type AssistantMessagePart, type AssistantQuality } from "../contracts";
import { assistantDatabaseRequest, assistantFilter } from "./database";

type ConversationRow = {
  id: string; user_id: string; title: string | null; status: "active" | "archived";
  summary: string | null; summary_through_sequence: number; created_at: string; updated_at: string;
};
type MessageRow = {
  id: string; user_id: string; conversation_id: string; sequence: number; role: "user" | "assistant" | "tool";
  parts: AssistantMessagePart[]; status: "pending" | "streaming" | "completed" | "failed" | "cancelled";
  parent_message_id: string | null; created_at: string;
};
type RunRow = {
  id: string; user_id: string; conversation_id: string; triggering_message_id: string | null; output_message_id: string | null; request_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled"; quality: AssistantQuality;
  provider: string | null; model: string | null; prompt_version: string; usage: unknown; web_searched: boolean;
  error_code: string | null; created_at: string;
};
type AttachmentRow = {
  id: string; user_id: string; conversation_id: string; message_id: string | null; object_path: string;
  media_type: "image/jpeg" | "image/png"; byte_size: number; sha256: string;
  purpose: "meal" | "context"; status: "available" | "processed" | "failed" | "deleted"; created_at: string;
};

function one<T>(rows: T[], label: string) {
  const row = rows[0];
  if (!row) throw new Error(`${label} was not persisted.`);
  return row;
}

export async function createAssistantConversation(userId: string, title: string | null = null) {
  const rows = await assistantDatabaseRequest<ConversationRow[]>("assistant_conversations", {
    method: "POST", prefer: "return=representation",
    body: { id: crypto.randomUUID(), user_id: userId, title },
  });
  return one(rows, "Assistant conversation");
}

export async function listAssistantConversations(userId: string, limit = 50) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return assistantDatabaseRequest<ConversationRow[]>(
    `assistant_conversations?user_id=eq.${assistantFilter(userId)}&select=*&order=updated_at.desc&limit=${safeLimit}`,
  );
}

export async function findAssistantConversation(userId: string, conversationId: string) {
  const rows = await assistantDatabaseRequest<ConversationRow[]>(
    `assistant_conversations?user_id=eq.${assistantFilter(userId)}&id=eq.${assistantFilter(conversationId)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export async function appendAssistantMessage(input: {
  userId: string;
  conversationId: string;
  role: MessageRow["role"];
  parts: AssistantMessagePart[];
  status?: MessageRow["status"];
  parentMessageId?: string | null;
  id?: string;
}) {
  const parts = input.parts.map((part) => assistantMessagePartSchema.parse(part));
  const result = await assistantDatabaseRequest<MessageRow | MessageRow[]>("rpc/append_assistant_message", {
    method: "POST",
    body: {
      p_user_id: input.userId,
      p_conversation_id: input.conversationId,
      p_message_id: input.id ?? crypto.randomUUID(),
      p_role: input.role,
      p_parts: parts,
      p_status: input.status ?? "completed",
      p_parent_message_id: input.parentMessageId ?? null,
    },
  });
  return Array.isArray(result) ? one(result, "Assistant message") : result;
}

export async function listAssistantMessages(userId: string, conversationId: string, afterSequence = 0) {
  const sequenceFilter = afterSequence > 0 ? `&sequence=gt.${Math.trunc(afterSequence)}` : "";
  return assistantDatabaseRequest<MessageRow[]>(
    `assistant_messages?user_id=eq.${assistantFilter(userId)}&conversation_id=eq.${assistantFilter(conversationId)}${sequenceFilter}&select=*&order=sequence.asc`,
  );
}

export async function updateAssistantConversation(userId: string, conversationId: string, update: {
  title?: string | null;
  summary?: string | null;
  summary_through_sequence?: number;
  status?: ConversationRow["status"];
}) {
  const rows = await assistantDatabaseRequest<ConversationRow[]>(
    `assistant_conversations?user_id=eq.${assistantFilter(userId)}&id=eq.${assistantFilter(conversationId)}`,
    { method: "PATCH", prefer: "return=representation", body: update },
  );
  return one(rows, "Assistant conversation update");
}

export async function deleteAssistantConversation(userId: string, conversationId: string) {
  const rows = await assistantDatabaseRequest<ConversationRow[]>(
    `assistant_conversations?user_id=eq.${assistantFilter(userId)}&id=eq.${assistantFilter(conversationId)}`,
    { method: "DELETE", prefer: "return=representation" },
  );
  return one(rows, "Assistant conversation deletion");
}

export async function findAssistantMessage(userId: string, messageId: string) {
  const rows = await assistantDatabaseRequest<MessageRow[]>(
    `assistant_messages?user_id=eq.${assistantFilter(userId)}&id=eq.${assistantFilter(messageId)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

function attachmentIdFromPath(userId: string, conversationId: string, objectPath: string) {
  if (userId.includes("/") || conversationId.includes("/")) throw new Error("Invalid assistant attachment owner.");
  const prefix = `assistant/${userId}/${conversationId}/`;
  if (!objectPath.startsWith(prefix)) throw new Error("Assistant attachment path does not match its owner.");
  const filename = objectPath.slice(prefix.length);
  if (!filename || filename.includes("/")) throw new Error("Invalid assistant attachment path.");
  const id = filename.slice(0, filename.lastIndexOf("."));
  return zUuid(id);
}

function zUuid(value: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return value;
  throw new Error("Assistant attachment filename must be a UUID.");
}

export async function createAssistantAttachment(input: {
  userId: string; conversationId: string; messageId?: string | null; objectPath: string;
  mediaType: AttachmentRow["media_type"]; byteSize: number; sha256: string; purpose: AttachmentRow["purpose"];
}) {
  const metadata = assistantAttachmentMetadataSchema.parse(input);
  const id = attachmentIdFromPath(input.userId, input.conversationId, metadata.objectPath);
  const rows = await assistantDatabaseRequest<AttachmentRow[]>("assistant_attachments", {
    method: "POST", prefer: "return=representation",
    body: {
      id, user_id: input.userId, conversation_id: input.conversationId, message_id: input.messageId ?? null,
      object_path: metadata.objectPath, media_type: metadata.mediaType, byte_size: metadata.byteSize,
      sha256: metadata.sha256, purpose: metadata.purpose, status: "available",
    },
  });
  return one(rows, "Assistant attachment");
}

export async function listAssistantAttachments(userId: string, conversationId: string, limit = 100, offset = 0) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const safeOffset = Math.max(0, Math.trunc(offset));
  return assistantDatabaseRequest<AttachmentRow[]>(
    `assistant_attachments?user_id=eq.${assistantFilter(userId)}&conversation_id=eq.${assistantFilter(conversationId)}&select=*&order=created_at.asc,id.asc&limit=${safeLimit}&offset=${safeOffset}`,
  );
}

export async function findAssistantAttachment(userId: string, attachmentId: string) {
  const rows = await assistantDatabaseRequest<AttachmentRow[]>(
    `assistant_attachments?user_id=eq.${assistantFilter(userId)}&id=eq.${assistantFilter(attachmentId)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export async function attachAssistantAttachmentToMessage(userId: string, conversationId: string, attachmentId: string, messageId: string) {
  const existing = await findAssistantAttachment(userId, attachmentId);
  if (existing?.conversation_id !== conversationId || (existing.message_id !== null && existing.message_id !== messageId)) {
    throw new Error("Assistant attachment is already linked to another message.");
  }
  if (existing.message_id === messageId) return existing;
  const rows = await assistantDatabaseRequest<AttachmentRow[]>(
    `assistant_attachments?user_id=eq.${assistantFilter(userId)}&conversation_id=eq.${assistantFilter(conversationId)}&id=eq.${assistantFilter(attachmentId)}&message_id=is.null`,
    { method: "PATCH", prefer: "return=representation", body: { message_id: messageId } },
  );
  return one(rows, "Assistant attachment update");
}

export async function deleteAssistantAttachmentMetadata(userId: string, attachmentId: string) {
  const rows = await assistantDatabaseRequest<AttachmentRow[]>(
    `assistant_attachments?user_id=eq.${assistantFilter(userId)}&id=eq.${assistantFilter(attachmentId)}`,
    { method: "DELETE", prefer: "return=representation" },
  );
  return one(rows, "Assistant attachment deletion");
}

export async function createAssistantRun(input: {
  userId: string; conversationId: string; triggeringMessageId: string; requestId: string;
  quality: AssistantQuality; model: string; promptVersion: string;
}) {
  const result = await assistantDatabaseRequest<RunRow | RunRow[]>("rpc/create_assistant_run", {
    method: "POST",
    body: {
      p_user_id: input.userId, p_run_id: crypto.randomUUID(), p_conversation_id: input.conversationId,
      p_triggering_message_id: input.triggeringMessageId, p_request_id: input.requestId,
      p_quality: input.quality, p_model: input.model, p_prompt_version: input.promptVersion,
    },
  });
  return Array.isArray(result) ? one(result, "Assistant run") : result;
}

export async function findAssistantRunByRequestId(userId: string, requestId: string) {
  const rows = await assistantDatabaseRequest<RunRow[]>(
    `assistant_runs?user_id=eq.${assistantFilter(userId)}&request_id=eq.${assistantFilter(requestId)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export async function updateAssistantRun(userId: string, runId: string, update: Partial<Pick<RunRow, "status" | "provider" | "model" | "usage" | "web_searched" | "error_code" | "output_message_id">> & { started_at?: string; completed_at?: string; finish_reason?: string }) {
  const rows = await assistantDatabaseRequest<RunRow[]>(
    `assistant_runs?user_id=eq.${assistantFilter(userId)}&id=eq.${assistantFilter(runId)}`,
    { method: "PATCH", prefer: "return=representation", body: update },
  );
  return one(rows, "Assistant run update");
}

export async function createAssistantToolCall(input: {
  userId: string; runId: string; toolName: string; idempotencyKey: string; argumentsManifest: unknown;
  operationClass?: "read" | "propose" | "execute_confirmed" | "undo";
}) {
  const rows = await assistantDatabaseRequest<Array<{ id: string }>>("assistant_tool_calls", {
    method: "POST", prefer: "return=representation",
    body: {
      id: crypto.randomUUID(), user_id: input.userId, run_id: input.runId,
      tool_name: input.toolName, operation_class: input.operationClass ?? "read", status: "running",
      idempotency_key: input.idempotencyKey, arguments_manifest: input.argumentsManifest,
    },
  });
  return one(rows, "Assistant tool call");
}

export async function completeAssistantToolCall(input: {
  userId: string; toolCallId: string; status: "completed" | "failed"; resultManifest: unknown; durationMs: number;
}) {
  const rows = await assistantDatabaseRequest<Array<{ id: string }>>(
    `assistant_tool_calls?user_id=eq.${assistantFilter(input.userId)}&id=eq.${assistantFilter(input.toolCallId)}`,
    {
      method: "PATCH", prefer: "return=representation",
      body: {
        status: input.status, result_manifest: input.resultManifest,
        duration_ms: Math.max(0, Math.trunc(input.durationMs)), completed_at: new Date().toISOString(),
      },
    },
  );
  return one(rows, "Assistant tool call update");
}

type AssistantActionRow = {
  id: string;
  user_id: string;
  conversation_id: string;
  run_id: string | null;
  action_type: "meal.create";
  state: "proposed" | "confirmed" | "executing" | "executed" | "undoing" | "undone" | "failed" | "expired";
  payload: Record<string, unknown>;
  inverse_payload: Record<string, unknown> | null;
  confirmation_message_id: string | null;
  idempotency_key: string;
  target_type: string | null;
  target_id: string | null;
  undo_deadline: string | null;
};

export async function findAssistantActionByIdempotencyKey(userId: string, idempotencyKey: string) {
  const rows = await assistantDatabaseRequest<AssistantActionRow[]>(
    `assistant_actions?user_id=eq.${assistantFilter(userId)}&idempotency_key=eq.${assistantFilter(idempotencyKey)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export async function findAssistantAction(userId: string, actionId: string) {
  const rows = await assistantDatabaseRequest<AssistantActionRow[]>(
    `assistant_actions?user_id=eq.${assistantFilter(userId)}&id=eq.${assistantFilter(actionId)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export async function recordExecutedAssistantMealAction(input: {
  userId: string;
  conversationId: string;
  runId: string;
  confirmationMessageId: string;
  idempotencyKey: string;
  mealId: string;
  payload: Record<string, unknown>;
}) {
  const existing = await findAssistantActionByIdempotencyKey(input.userId, input.idempotencyKey);
  if (existing) return existing;
  const now = new Date();
  const rows = await assistantDatabaseRequest<AssistantActionRow[]>("assistant_actions", {
    method: "POST",
    prefer: "return=representation",
    body: {
      id: crypto.randomUUID(),
      user_id: input.userId,
      conversation_id: input.conversationId,
      run_id: input.runId,
      action_type: "meal.create",
      state: "executed",
      payload: input.payload,
      inverse_payload: { operation: "meal.delete", mealId: input.mealId },
      confirmation_message_id: input.confirmationMessageId,
      idempotency_key: input.idempotencyKey,
      target_type: "meal",
      target_id: input.mealId,
      confirmed_at: now.toISOString(),
      executed_at: now.toISOString(),
      undo_deadline: new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
    },
  });
  return one(rows, "Assistant meal action");
}

export async function markAssistantActionUndone(userId: string, actionId: string) {
  const rows = await assistantDatabaseRequest<AssistantActionRow[]>(
    `assistant_actions?user_id=eq.${assistantFilter(userId)}&id=eq.${assistantFilter(actionId)}&state=eq.executed`,
    {
      method: "PATCH",
      prefer: "return=representation",
      body: { state: "undone", undone_at: new Date().toISOString() },
    },
  );
  return one(rows, "Assistant action undo");
}

export async function loadConfirmedAssistantMemories(userId: string) {
  return assistantDatabaseRequest<Array<{ id: string; kind: string; content: string; structured_value: unknown; sensitivity: string; valid_from: string | null; valid_until: string | null }>>(
    `assistant_memories?user_id=eq.${assistantFilter(userId)}&status=eq.confirmed&select=id,kind,content,structured_value,sensitivity,valid_from,valid_until&order=updated_at.desc&limit=100`,
  );
}

export async function loadPendingAssistantChanges(userId: string) {
  const [memories, goalSets, planVersions] = await Promise.all([
    assistantDatabaseRequest<Array<Record<string, unknown>>>(
      `assistant_memories?user_id=eq.${assistantFilter(userId)}&status=eq.proposed&select=id,kind,content,structured_value,sensitivity,valid_from,valid_until&order=updated_at.desc&limit=20`,
    ),
    assistantDatabaseRequest<Array<Record<string, unknown>>>(
      `assistant_goal_sets?user_id=eq.${assistantFilter(userId)}&status=eq.draft&select=id,primary_direction,secondary_directions&order=updated_at.desc&limit=5`,
    ),
    assistantDatabaseRequest<Array<Record<string, unknown>>>(
      `assistant_plan_versions?user_id=eq.${assistantFilter(userId)}&status=eq.proposed&select=id,plan_id,version,body,based_on_version&order=created_at.desc&limit=5`,
    ),
  ]);
  return { memories, goalSets, planVersions };
}

export async function proposeAssistantMemory(userId: string, sourceMessageId: string, input: unknown) {
  const value = assistantMemoryInputSchema.parse(input);
  const rows = await assistantDatabaseRequest<Array<{ id: string; status: string }>>("assistant_memories", {
    method: "POST", prefer: "return=representation",
    body: {
      id: crypto.randomUUID(), user_id: userId, kind: value.kind, content: value.content,
      structured_value: value.structuredValue, status: "proposed", sensitivity: value.sensitivity,
      source_message_id: sourceMessageId, valid_from: value.validFrom, valid_until: value.validUntil,
    },
  });
  return one(rows, "Assistant memory proposal");
}

export async function confirmAssistantMemory(userId: string, memoryId: string, confirmationMessageId: string) {
  return assistantDatabaseRequest("rpc/confirm_assistant_memory", {
    method: "POST", body: { p_user_id: userId, p_memory_id: memoryId, p_confirmation_message_id: confirmationMessageId },
  });
}

export async function proposeAssistantGoalSet(userId: string, sourceMessageId: string, input: unknown) {
  const value = assistantGoalSetInputSchema.parse(input);
  const goalSetId = crypto.randomUUID();
  const goalSet = one(await assistantDatabaseRequest<Array<{ id: string; status: string }>>("assistant_goal_sets", {
    method: "POST", prefer: "return=representation",
    body: { id: goalSetId, user_id: userId, status: "draft", primary_direction: value.primaryDirection, secondary_directions: value.secondaryDirections },
  }), "Assistant goal set");
  if (value.goals.length) {
    await assistantDatabaseRequest("assistant_goals", {
      method: "POST", prefer: "return=minimal",
      body: value.goals.map((goal, position) => ({
        id: crypto.randomUUID(), user_id: userId, goal_set_id: goalSetId, position,
        label: goal.label, domain: goal.domain, baseline: goal.baseline, target: goal.target,
        horizon: goal.horizon, cadence: goal.cadence, constraints: goal.constraints, success_criteria: goal.successCriteria,
        source_message_id: sourceMessageId,
      })),
    });
  }
  return goalSet;
}

export async function confirmAssistantGoalSet(userId: string, goalSetId: string, confirmationMessageId: string) {
  return assistantDatabaseRequest("rpc/confirm_assistant_goal_set", {
    method: "POST", body: { p_user_id: userId, p_goal_set_id: goalSetId, p_confirmation_message_id: confirmationMessageId },
  });
}

export async function loadConfirmedGoalContext(userId: string) {
  const sets = await assistantDatabaseRequest<Array<{ id: string; primary_direction: string; secondary_directions: string[] }>>(
    `assistant_goal_sets?user_id=eq.${assistantFilter(userId)}&status=eq.confirmed&select=id,primary_direction,secondary_directions&limit=1`,
  );
  const goalSet = sets[0];
  if (!goalSet) return null;
  const goals = await assistantDatabaseRequest<Array<Record<string, unknown>>>(
    `assistant_goals?user_id=eq.${assistantFilter(userId)}&goal_set_id=eq.${assistantFilter(goalSet.id)}&status=eq.active&select=id,position,label,domain,baseline,target,horizon,cadence,constraints,success_criteria&order=position.asc`,
  );
  return { goalSet, goals };
}

export async function proposeAssistantPlanVersion(input: { userId: string; goalSetId: string | null; sourceMessageId: string; planId?: string; body: unknown }) {
  const body = assistantPlanBodySchema.parse(input.body);
  let planId = input.planId;
  if (!planId) {
    const plans = await assistantDatabaseRequest<Array<{ id: string }>>("assistant_plans", {
      method: "POST", prefer: "return=representation",
      body: { id: crypto.randomUUID(), user_id: input.userId, goal_set_id: input.goalSetId, status: "draft" },
    });
    planId = one(plans, "Assistant plan").id;
  }
  const previous = await assistantDatabaseRequest<Array<{ version: number }>>(
    `assistant_plan_versions?user_id=eq.${assistantFilter(input.userId)}&plan_id=eq.${assistantFilter(planId)}&select=version&order=version.desc&limit=1`,
  );
  const version = (previous[0]?.version ?? 0) + 1;
  const rows = await assistantDatabaseRequest<Array<{ id: string; version: number; status: string }>>("assistant_plan_versions", {
    method: "POST", prefer: "return=representation",
    body: { id: crypto.randomUUID(), user_id: input.userId, plan_id: planId, version, body, status: "proposed", based_on_version: version > 1 ? version - 1 : null, source_message_id: input.sourceMessageId },
  });
  return one(rows, "Assistant plan version");
}

export async function confirmAssistantPlanVersion(userId: string, planVersionId: string, confirmationMessageId: string) {
  return assistantDatabaseRequest("rpc/confirm_assistant_plan_version", {
    method: "POST", body: { p_user_id: userId, p_plan_version_id: planVersionId, p_confirmation_message_id: confirmationMessageId },
  });
}

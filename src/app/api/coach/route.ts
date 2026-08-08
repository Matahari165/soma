import { NextResponse } from "next/server";
import { z } from "zod";

import { askSomaCoach } from "@/integrations/openai/coach";
import { getCurrentUser } from "@/lib/auth";
import { stableHash } from "@/lib/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const inputSchema = z.object({ message: z.string().trim().min(1).max(4000), threadId: z.string().uuid().nullable().optional() });
const threadIdSchema = z.string().uuid();

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const requestedThreadId = new URL(request.url).searchParams.get("threadId");
  if (requestedThreadId && !threadIdSchema.safeParse(requestedThreadId).success) {
    return NextResponse.json({ error: "Invalid conversation." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const { data: threads, error: threadError } = await admin.from("coach_threads")
    .select("id,title,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (threadError) return NextResponse.json({ error: "Conversation history could not be loaded." }, { status: 500 });

  let messages: Array<{ id: string; role: string; content: string; evidence: unknown; createdAt: string }> = [];
  if (requestedThreadId) {
    const { data: ownedThread } = await admin.from("coach_threads").select("id").eq("id", requestedThreadId).eq("user_id", user.id).maybeSingle();
    if (!ownedThread) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const { data, error } = await admin.from("coach_messages")
      .select("id,role,content,evidence_refs,created_at")
      .eq("user_id", user.id)
      .eq("thread_id", requestedThreadId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return NextResponse.json({ error: "Messages could not be loaded." }, { status: 500 });
    messages = (data ?? []).map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      evidence: Array.isArray(item.evidence_refs) ? item.evidence_refs.filter((value): value is string => typeof value === "string") : [],
      createdAt: item.created_at,
    }));
  }

  return NextResponse.json({
    threads: (threads ?? []).map((thread) => ({ id: thread.id, title: thread.title, updatedAt: thread.updated_at })),
    messages,
  });
}

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid message." }, { status: 400 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin.from("coach_messages").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("role", "user").gte("created_at", oneMinuteAgo);
  if ((count ?? 0) >= 10) return NextResponse.json({ error: "Please wait a moment before sending another Coach message." }, { status: 429 });
  let threadId = parsed.data.threadId ?? null;
  if (threadId) {
    const { data } = await admin.from("coach_threads").select("id").eq("id", threadId).eq("user_id", user.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  } else {
    const { data, error } = await admin.from("coach_threads").insert({ user_id: user.id, title: parsed.data.message.slice(0, 80) }).select("id").single();
    if (error || !data) return NextResponse.json({ error: "Conversation could not be created." }, { status: 500 });
    threadId = data.id;
  }
  const { error: userMessageError } = await admin.from("coach_messages").insert({ user_id: user.id, thread_id: threadId, role: "user", content: parsed.data.message });
  if (userMessageError) return NextResponse.json({ error: "Your message could not be saved." }, { status: 500 });
  const [{ data: metrics }, { data: scores }, { data: correlations }] = await Promise.all([
    admin.from("daily_health_metrics").select("metric_date,sleep_minutes,sleep_need_minutes,sleep_regularity,hrv_ms,resting_heart_rate,steps,zone_minutes").eq("user_id", user.id).order("metric_date", { ascending: false }).limit(14),
    admin.from("daily_scores").select("score_date,kind,score,status,drivers").eq("user_id", user.id).order("score_date", { ascending: false }).limit(42),
    admin.from("correlation_results").select("variable_x,variable_y,coefficient,sample_size,quality_status,lag_days").eq("user_id", user.id).order("calculated_at", { ascending: false }).limit(8),
  ]);
  try {
    const result = await askSomaCoach({ userId: user.id, message: parsed.data.message, context: { metrics, scores, correlations } });
    const { data: assistantMessage, error: assistantMessageError } = await admin.from("coach_messages").insert({ user_id: user.id, thread_id: threadId, role: "assistant", content: result.answer, evidence_refs: result.evidence, model: "gpt-5.6-luna" }).select("id").single();
    if (assistantMessageError || !assistantMessage) throw new Error("Coach response could not be saved.");
    let proposalId: string | null = null;
    if (result.proposedAction) {
      const { data: proposal, error: proposalError } = await admin.from("agent_action_proposals").insert({ user_id: user.id, thread_id: threadId, tool_name: result.proposedAction.type, arguments: result.proposedAction.payload, preview: `${result.proposedAction.title}: ${result.proposedAction.description}`, status: "proposed", idempotency_key: stableHash(`${user.id}:${threadId}:${assistantMessage.id}:${result.proposedAction.type}`) }).select("id").single();
      if (proposalError || !proposal) throw new Error("Action preview could not be saved.");
      proposalId = proposal.id;
    }
    await admin.from("coach_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId).eq("user_id", user.id);
    return NextResponse.json({ ...result, threadId, proposalId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Soma Coach is temporarily unavailable." }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { askSomaCoach } from "@/integrations/xai/coach";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { compactHealthContext, type CoachMetricRow, type CoachScoreRow } from "@/services/coach-context";
import { getPersonalLabSnapshot } from "@/services/personal-lab";
import { loadConfirmedMealRecords } from "@/services/meals";
import { loadNutritionTargetsForUser, nutritionTargetLikelyValues } from "@/services/nutrition-targets";

const inputSchema = z.object({ message: z.string().trim().min(1).max(4000), threadId: z.string().uuid().nullable().optional() });
const threadIdSchema = z.string().uuid();

export async function GET(request: Request) {
  if (isLocalPreviewMode()) {
    const threadId = "30000000-0000-4000-8000-000000000001";
    const requestedThreadId = new URL(request.url).searchParams.get("threadId") ?? threadId;
    return NextResponse.json({
      threads: [{ id: threadId, title: "Understanding recovery", updatedAt: new Date().toISOString() }],
      selectedThreadId: requestedThreadId,
      messages: [{ id: "preview-message", role: "assistant", content: "Your demo recovery signal is above its recent range, supported by more regular sleep. Treat this as an interpretation of sample data, not medical advice.", evidence: ["Demo recovery · 82/100", "Demo sleep regularity · 84%"] }],
    });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const requestedThreadId = new URL(request.url).searchParams.get("threadId");
  if (requestedThreadId && !threadIdSchema.safeParse(requestedThreadId).success) {
    return NextResponse.json({ error: "Invalid conversation." }, { status: 400 });
  }
  const admin = createCloudflareAdminClient();
  const { data: threads, error: threadError } = await admin.from("coach_threads")
    .select("id,title,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (threadError) return NextResponse.json({ error: "Conversation history could not be loaded." }, { status: 500 });

  const selectedThreadId = requestedThreadId ?? threads?.[0]?.id ?? null;
  let messages: Array<{ id: string; role: string; content: string; evidence: unknown; createdAt: string }> = [];
  if (selectedThreadId) {
    if (requestedThreadId) {
      const { data: ownedThread, error: ownedThreadError } = await admin.from("coach_threads").select("id").eq("id", requestedThreadId).eq("user_id", user.id).maybeSingle();
      if (ownedThreadError) return NextResponse.json({ error: "Conversation could not be loaded." }, { status: 500 });
      if (!ownedThread) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    const { data, error } = await admin.from("coach_messages")
      .select("id,role,content,evidence_refs,created_at")
      .eq("user_id", user.id)
      .eq("thread_id", selectedThreadId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) return NextResponse.json({ error: "Messages could not be loaded." }, { status: 500 });
    messages = (data ?? []).map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      evidence: Array.isArray(item.evidence_refs) ? item.evidence_refs.filter((value: unknown): value is string => typeof value === "string") : [],
      createdAt: item.created_at,
    }));
  }

  return NextResponse.json({
    threads: (threads ?? []).map((thread) => ({ id: thread.id, title: thread.title, updatedAt: thread.updated_at })),
    selectedThreadId,
    messages,
  });
}

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid message." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({
    answer: `In this local preview, “${parsed.data.message.slice(0, 120)}” can be explored using the demo signals. Sleep is 86, recovery is 82, and effort is 63. No external AI was contacted.`,
    evidence: ["Demo Sleep · 86/100", "Demo Recovery · 82/100", "Demo Effort · 63/100"],
    proposedAction: null,
    threadId: parsed.data.threadId ?? "30000000-0000-4000-8000-000000000002",
    proposalId: null,
  });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createCloudflareAdminClient();
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const startOfUtcDay = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const [minuteQuota, dailyQuota] = await Promise.all([
    admin.from("coach_messages").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("role", "user").gte("created_at", oneMinuteAgo),
    admin.from("coach_messages").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("role", "user").gte("created_at", startOfUtcDay),
  ]);
  if (minuteQuota.error || dailyQuota.error) return NextResponse.json({ error: "Coach availability could not be checked." }, { status: 500 });
  if ((minuteQuota.count ?? 0) >= 10) return NextResponse.json({ error: "Please wait a moment before sending another Coach message." }, { status: 429 });
  if ((dailyQuota.count ?? 0) >= 30) return NextResponse.json({ error: "You have reached today's 30-message Coach limit." }, { status: 429 });
  const threadId = parsed.data.threadId ?? null;
  if (threadId) {
    const { data, error } = await admin.from("coach_threads").select("id").eq("id", threadId).eq("user_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ error: "Conversation could not be checked." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  const contextResults = await Promise.all([
    admin.from("daily_health_metrics").select("metric_date,sleep_minutes,sleep_need_minutes,sleep_regularity,hrv_ms,resting_heart_rate,steps,zone_minutes").eq("user_id", user.id).order("metric_date", { ascending: false }).limit(30),
    admin.from("daily_scores").select("score_date,kind,score").eq("user_id", user.id).order("score_date", { ascending: false }).limit(90),
    admin.from("lab_narrative_history").select("source_facts").eq("user_id", user.id).order("generated_at", { ascending: false }).limit(1),
    threadId ? admin.from("coach_messages").select("role,content,created_at").eq("user_id", user.id).eq("thread_id", threadId).order("created_at", { ascending: false }).limit(6) : Promise.resolve({ data: [], error: null }),
  ]);
  if (contextResults.some((query) => query.error)) return NextResponse.json({ error: "Your health context could not be loaded." }, { status: 500 });
  const [{ data: metrics }, { data: scores }, { data: narrativePointers }, { data: recentMessages }] = contextResults;
  try {
    const sourceFacts = narrativePointers?.[0]?.source_facts;
    const narrativePeriod = Array.isArray(sourceFacts) && sourceFacts.some((fact) => fact && typeof fact === "object" && (fact as Record<string, unknown>).analysisPeriod === 90) ? 90 : 30;
    // A single-period request reuses the canonical matrix cache instead of
    // rebuilding the combined 30/90-day matrix for every Coach message.
    const labSnapshot = await getPersonalLabSnapshot(user, { periods: [narrativePeriod] });
    const narrative = labSnapshot.aiNarrative?.isCurrent ? labSnapshot.aiNarrative : null;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60_000).toISOString().slice(0, 10);
    const todayKey = new Date().toISOString().slice(0, 10);
    let nutritionToday = { caloriesKcal: null as number | null, proteinG: null as number | null, fatG: null as number | null, carbsG: null as number | null, fiberG: null as number | null };
    let nutritionTargets = { caloriesKcal: 3000, proteinG: 160, fatG: 80, carbsG: 385, fiberG: 30, surplusKcal: 300 };
    try {
      const meals = await loadConfirmedMealRecords(user.id, { from: weekAgo });
      const todayMeals = meals.filter((meal) => meal.mealDate === todayKey);
      const sum = (read: (meal: (typeof todayMeals)[number]) => { likely: number } | null) => {
        if (!todayMeals.length) return null;
        const values = todayMeals.map((meal) => read(meal)?.likely ?? null);
        return values.every((value): value is number => typeof value === "number") ? values.reduce((a, b) => a + b, 0) : null;
      };
      nutritionToday = { caloriesKcal: sum((meal) => meal.caloriesKcal), proteinG: sum((meal) => meal.proteinG), fatG: sum((meal) => meal.fatG), carbsG: sum((meal) => meal.carbsG), fiberG: sum((meal) => meal.fiberG) };
      nutritionTargets = nutritionTargetLikelyValues(await loadNutritionTargetsForUser(user.id));
    } catch {
      // Nutrition reste indisponible sans bloquer le coach.
    }
    const result = await askSomaCoach({ userId: user.id, message: parsed.data.message, context: {
      dailyDigest: narrative ? { headline: narrative.headline, summary: narrative.summary, highlights: narrative.highlights, evidenceCandidates: narrative.evidenceCandidates, generatedAt: narrative.generatedAt } : null,
      ...compactHealthContext((metrics ?? []) as CoachMetricRow[], (scores ?? []) as CoachScoreRow[]),
      nutrition: { today: nutritionToday, targets: nutritionTargets },
      recentMessages: [...(recentMessages ?? [])].reverse().map((message) => ({ role: message.role, content: message.content })),
    } });
    const { data: persisted, error: persistError } = await admin.rpc("persist_soma_coach_exchange", {
      p_user_id: user.id,
      p_thread_id: threadId,
      p_title: parsed.data.message.slice(0, 80),
      p_user_message: parsed.data.message,
      p_assistant_message: result.answer,
      p_evidence: result.evidence,
      p_model: "grok-4.6",
      p_token_usage: result.usage,
      p_action_tool_name: result.proposedAction?.type ?? null,
      p_action_arguments: result.proposedAction?.payload ?? null,
      p_action_preview: result.proposedAction ? `${result.proposedAction.title}: ${result.proposedAction.description}` : null,
    });
    if (persistError || !persisted) throw new Error("Coach response could not be saved.");
    const exchange = persisted as { threadId: string; proposalId: string | null };
    return NextResponse.json({ ...result, threadId: exchange.threadId, proposalId: exchange.proposalId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Soma Coach is temporarily unavailable." }, { status: 503 });
  }
}

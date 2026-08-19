import { getCurrentUser, type SomaUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DashboardSnapshot, DailyScore, ScoreKind } from "@/domain/health";
import { isLocalPreviewMode } from "@/lib/env";
import { previewDashboard } from "@/lib/local-preview";

type ScoreRow = { score_date: string; kind: ScoreKind; score: number | null; status: DailyScore["status"]; drivers: Record<string, unknown>; calculated_at: string };
type MetricRow = { metric_date: string; sleep_minutes: number | null; sleep_need_minutes: number | null; sleep_regularity: number | null; bedtime: string | null; wake_time: string | null; hrv_ms: number | null; resting_heart_rate: number | null; steps: number | null; zone_minutes: number | null; source_freshness: { latestMeasuredAt?: string | null } };

function greetingFor(timeZone: string) {
  let hour: number;
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  } catch {
    hour = new Date().getUTCHours();
  }
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function clockFromMinutes(value: unknown) {
  if (typeof value !== "number") return null;
  const hour24 = Math.floor(value / 60) % 24;
  const minute = Math.round(value % 60);
  const suffix = hour24 >= 12 ? "PM" : "AM";
  return `${hour24 % 12 || 12}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

function duration(minutes: number | null) {
  return minutes === null ? "Not enough data" : `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

function scoreRowsFor(kind: ScoreKind, scores: ScoreRow[]) {
  return scores.filter((row) => row.kind === kind);
}

export function selectSignalMetric(kind: ScoreKind, metrics: MetricRow[]) {
  if (kind === "sleep") return metrics.findLast((metric) => metric.sleep_minutes !== null);
  if (kind === "recovery") return metrics.findLast((metric) => metric.hrv_ms !== null || metric.resting_heart_rate !== null);
  return metrics.at(-1);
}

function scoreForMetric(kind: ScoreKind, scores: ScoreRow[], metric: MetricRow | undefined) {
  if (!metric) return undefined;
  return scoreRowsFor(kind, scores).findLast((row) => row.score_date === metric.metric_date);
}

function metricScore(kind: ScoreKind, row: ScoreRow | undefined, metrics: MetricRow | undefined, histories: number[]): DailyScore {
  const missing = row?.score === null || row?.score === undefined;
  const synced = row?.calculated_at ? new Date(row.calculated_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "pending";
  if (kind === "sleep") {
    const bedtime = clockFromMinutes(row?.drivers?.bedtimeRecommendationMinutes);
    return { kind, score: row?.score ?? null, status: row?.status ?? "limited", label: "Sleep", value: duration(metrics?.sleep_minutes ?? null), target: metrics?.sleep_need_minutes ? `of ${duration(metrics.sleep_need_minutes)} needed` : "Need is being estimated", delta: metrics?.sleep_regularity === null || metrics?.sleep_regularity === undefined ? "Regularity needs three nights" : `${Math.round(metrics.sleep_regularity)}% regularity`, detail: missing ? "Soma needs complete sleep duration, efficiency, and regularity inputs." : "Duration, efficiency, and regularity are combined transparently.", action: bedtime ? `Aim to be in bed by ${bedtime} tonight.` : "A bedtime recommendation needs more complete sleep data.", href: "/sleep", freshness: { measuredAt: metrics?.source_freshness?.latestMeasuredAt ?? "unknown", syncedAt: synced, state: missing ? "missing" : "fresh" }, history: histories };
  }
  if (kind === "recovery") {
    return { kind, score: row?.score ?? null, status: row?.status ?? "limited", label: "Recovery", value: missing ? "Building your baseline" : "Compared with your baseline", target: `HRV ${metrics?.hrv_ms ? `${Math.round(metrics.hrv_ms)} ms` : "—"} · RHR ${metrics?.resting_heart_rate ? `${Math.round(metrics.resting_heart_rate)} bpm` : "—"}`, delta: "Uses your own recent range", detail: missing ? "At least seven HRV and resting-heart-rate readings plus sleep are required." : "HRV, resting heart rate, and sleep support today's score.", action: missing ? "Keep wearing your device overnight to complete the baseline." : "Use this signal alongside how you feel today.", href: "/recovery", freshness: { measuredAt: metrics?.source_freshness?.latestMeasuredAt ?? "unknown", syncedAt: synced, state: missing ? "missing" : "fresh" }, history: histories };
  }
  const minimum = Number(row?.drivers?.targetMinimum ?? 0);
  const maximum = Number(row?.drivers?.targetMaximum ?? 0);
  return { kind, score: row?.score ?? null, status: row?.status ?? "limited", label: "Effort", value: missing ? "Not calculated" : `${row?.score} of ${minimum}–${maximum}`, target: "Today's target zone", delta: `${metrics?.steps?.toLocaleString("en-US") ?? "—"} steps · ${Math.round(metrics?.zone_minutes ?? 0)} zone min`, detail: "Today's completed effort stays separate from the goal-aware target.", action: missing ? "Sync activity data to calculate effort." : row.score! < minimum ? "You still have room to move toward today's target." : row.score! > maximum ? "You are above today's target; recovery can take priority." : "Keep today's effort in this range; no extra load is needed.", href: "/activity", freshness: { measuredAt: metrics?.source_freshness?.latestMeasuredAt ?? "unknown", syncedAt: synced, state: missing ? "missing" : "partial" }, history: histories };
}

export async function getDashboardSnapshot(currentUser?: SomaUser): Promise<DashboardSnapshot> {
  if (isLocalPreviewMode()) return previewDashboard;
  const user = currentUser ?? await getCurrentUser();
  if (!user) {
    const now = new Date();
    return {
      dateLabel: new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(now),
      greeting: greetingFor("UTC"),
      greetingName: "there",
      scores: (["sleep", "recovery", "effort"] as ScoreKind[]).map((kind) => metricScore(kind, undefined, undefined, [])),
      summary: "Sign in to connect your health data and build your first summary.",
      insights: [],
      weeklyEffort: { current: 0, targetMin: 0, targetMax: 0, days: [] },
      recoveryTrend: [],
      sleepRegularity: { bedtime: "—", wakeTime: "—", consistency: null },
    };
  }
  const supabase = await createSupabaseServerClient();
  const results = await Promise.all([
    supabase.from("profiles").select("display_name,timezone").eq("user_id", user.id).single(),
    supabase.from("daily_health_metrics").select("metric_date,sleep_minutes,sleep_need_minutes,sleep_regularity,bedtime,wake_time,hrv_ms,resting_heart_rate,steps,zone_minutes,source_freshness").eq("user_id", user.id).order("metric_date", { ascending: false }).limit(30),
    supabase.from("daily_scores").select("score_date,kind,score,status,drivers,calculated_at").eq("user_id", user.id).order("score_date", { ascending: false }).limit(90),
    supabase.from("insights").select("id,category,title,description,evidence").eq("user_id", user.id).neq("status", "dismissed").order("created_at", { ascending: false }).limit(3),
    supabase.from("briefs").select("generated_text").eq("user_id", user.id).eq("kind", "morning").order("brief_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error("Your daily health view is temporarily unavailable.");
  const [{ data: profile }, { data: rawMetrics }, { data: rawScores }, { data: rawInsights }, { data: brief }] = results;
  const metrics = ((rawMetrics ?? []) as MetricRow[]).reverse();
  const scores = ((rawScores ?? []) as ScoreRow[]).reverse();
  const latestMetric = metrics.at(-1);
  const latestDate = latestMetric?.metric_date ?? new Date().toISOString().slice(0, 10);
  const metricFor = (kind: ScoreKind) => selectSignalMetric(kind, metrics);
  const latestFor = (kind: ScoreKind) => scoreForMetric(kind, scores, metricFor(kind));
  const historyFor = (kind: ScoreKind) => scoreRowsFor(kind, scores).slice(-7).map((row) => row.score).filter((score): score is number => score !== null);
  const effortRows = scoreRowsFor("effort", scores).slice(-7);
  const effortLatest = latestFor("effort");
  const effortCurrent = effortRows.reduce((sum, row) => sum + (row.score ?? 0), 0);
  const date = new Date(`${latestDate}T12:00:00`);
  const sleepMetric = metricFor("sleep");

  return {
    dateLabel: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    greeting: greetingFor(profile?.timezone ?? "UTC"),
    greetingName: profile?.display_name ?? user.displayName ?? "there",
    scores: (["sleep", "recovery", "effort"] as ScoreKind[]).map((kind) => metricScore(kind, latestFor(kind), metricFor(kind), historyFor(kind))),
    summary: brief?.generated_text ?? "Soma is still building your first evidence-based summary.",
    insights: (rawInsights ?? []).map((insight) => ({ id: insight.id, category: insight.category, title: insight.title, description: insight.description, evidence: `Confidence ${Math.round(Number((insight.evidence as Record<string, unknown>)?.sampleSize ?? 0))} baseline days` })),
    weeklyEffort: { current: effortCurrent, targetMin: Number(effortLatest?.drivers?.weeklyMinimum ?? 0), targetMax: Number(effortLatest?.drivers?.weeklyMaximum ?? 0), days: effortRows.map((row, index) => ({ label: new Date(`${row.score_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" }), value: row.score ?? 0, today: index === effortRows.length - 1 })) },
    recoveryTrend: scoreRowsFor("recovery", scores).slice(-7).map((row) => ({ label: new Date(`${row.score_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }), value: row.score ?? 0 })),
    sleepRegularity: { bedtime: sleepMetric?.bedtime ? new Date(sleepMetric.bedtime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—", wakeTime: sleepMetric?.wake_time ? new Date(sleepMetric.wake_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—", consistency: sleepMetric?.sleep_regularity === null || sleepMetric?.sleep_regularity === undefined ? null : Math.round(sleepMetric.sleep_regularity) },
  };
}

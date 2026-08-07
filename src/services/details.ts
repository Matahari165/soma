import { getCurrentUser } from "@/lib/auth";
import { getDataMode } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DetailPoint = { date: string; score: number | null; primary: number | null; secondary: number | null };

const demoScores = {
  sleep: [68, 74, 71, 82, 79, 77, 84],
  recovery: [76, 65, 61, 58, 63, 66, 72],
  effort: [61, 52, 68, 42, 73, 47, 38],
};

export async function getMetricDetail(kind: "sleep" | "recovery" | "effort") {
  if (getDataMode() === "demo") {
    return demoScores[kind].map((score, index) => ({ date: new Date(Date.now() - (6 - index) * 86400000).toISOString().slice(0, 10), score, primary: kind === "sleep" ? 410 + index * 7 : kind === "recovery" ? 47 + index : 2400 + index * 370, secondary: kind === "sleep" ? 78 + index : kind === "recovery" ? 62 - index * 0.6 : 8 + index * 2 }));
  }
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const [{ data: scores }, { data: metrics }] = await Promise.all([
    supabase.from("daily_scores").select("score_date,score").eq("user_id", user.id).eq("kind", kind).order("score_date", { ascending: false }).limit(30),
    supabase.from("daily_health_metrics").select("metric_date,sleep_minutes,sleep_regularity,hrv_ms,resting_heart_rate,steps,zone_minutes").eq("user_id", user.id).order("metric_date", { ascending: false }).limit(30),
  ]);
  const metricsByDate = new Map((metrics ?? []).map((metric) => [metric.metric_date, metric]));
  return [...(scores ?? [])].reverse().map((row) => {
    const metric = metricsByDate.get(row.score_date);
    return { date: row.score_date, score: row.score, primary: kind === "sleep" ? metric?.sleep_minutes : kind === "recovery" ? metric?.hrv_ms : metric?.steps, secondary: kind === "sleep" ? metric?.sleep_regularity : kind === "recovery" ? metric?.resting_heart_rate : metric?.zone_minutes } as DetailPoint;
  });
}

export async function getCorrelations() {
  if (getDataMode() === "demo") return [
    { id: "bedtime", variable_x: "Bedtime", variable_y: "Recovery", coefficient: -0.42, sample_size: 61, quality_status: "ready", lag_days: 0, explanation: "Later bedtimes were moderately associated with lower recovery. This does not prove causation." },
    { id: "sleep", variable_x: "Sleep duration", variable_y: "Recovery", coefficient: 0.36, sample_size: 73, quality_status: "ready", lag_days: 0, explanation: "Longer sleep was weakly associated with higher recovery." },
    { id: "effort", variable_x: "Effort", variable_y: "Next-day recovery", coefficient: -0.19, sample_size: 58, quality_status: "ready", lag_days: 1, explanation: "The association is weak and should not drive decisions by itself." },
  ];
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("correlation_results").select("id,variable_x,variable_y,coefficient,sample_size,quality_status,lag_days,explanation").eq("user_id", user.id).order("calculated_at", { ascending: false }).limit(20);
  return data ?? [];
}

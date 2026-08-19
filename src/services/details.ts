import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLocalPreviewMode } from "@/lib/env";
import { previewCorrelations, previewDetails } from "@/lib/local-preview";

export type DetailPoint = { date: string; score: number | null; primary: number | null; secondary: number | null };

export async function getMetricDetail(kind: "sleep" | "recovery" | "effort") {
  if (isLocalPreviewMode()) return previewDetails[kind];
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const results = await Promise.all([
    supabase.from("daily_scores").select("score_date,score").eq("user_id", user.id).eq("kind", kind).order("score_date", { ascending: false }).limit(30),
    supabase.from("daily_health_metrics").select("metric_date,sleep_minutes,sleep_regularity,hrv_ms,resting_heart_rate,steps,zone_minutes").eq("user_id", user.id).order("metric_date", { ascending: false }).limit(30),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error("Metric history is temporarily unavailable.");
  const [{ data: scores }, { data: metrics }] = results;
  const metricsByDate = new Map((metrics ?? []).map((metric) => [metric.metric_date, metric]));
  return [...(scores ?? [])].reverse().map((row) => {
    const metric = metricsByDate.get(row.score_date);
    return { date: row.score_date, score: row.score, primary: kind === "sleep" ? metric?.sleep_minutes : kind === "recovery" ? metric?.hrv_ms : metric?.steps, secondary: kind === "sleep" ? metric?.sleep_regularity : kind === "recovery" ? metric?.resting_heart_rate : metric?.zone_minutes } as DetailPoint;
  });
}

export async function getCorrelations() {
  if (isLocalPreviewMode()) return previewCorrelations;
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("correlation_results").select("id,variable_x,variable_y,coefficient,sample_size,quality_status,lag_days,explanation").eq("user_id", user.id).order("calculated_at", { ascending: false }).limit(20);
  if (error) throw new Error("Correlations are temporarily unavailable.");
  return data ?? [];
}

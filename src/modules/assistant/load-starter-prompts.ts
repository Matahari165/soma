import "server-only";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

import { loadConfirmedGoalContext } from "./repository";
import { selectStarterPrompts, type StarterSignals } from "./starter-prompts";

type MetricRow = {
  metric_date: string;
  running_distance_km: number | null;
  running_duration_minutes: number | null;
  exercise_minutes: number | null;
  zone_minutes: number | null;
  sleep_minutes: number | null;
  hrv_ms: number | null;
  resting_heart_rate: number | null;
};
type MealRow = { meal_date: string; entry_state: string | null };

function isRecorded(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function hasPositive(value: number | null | undefined) {
  return isRecorded(value) && Number(value) > 0;
}

export async function loadAssistantStarterPrompts(userId: string, now = new Date()) {
  const confirmed = await loadConfirmedGoalContext(userId);
  if (!confirmed) return { calibrated: false as const, prompts: [] };

  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 45);
  const from = start.toISOString().slice(0, 10);
  const admin = createCloudflareAdminClient();
  const [metricsResult, mealsResult] = await Promise.all([
    admin.from("daily_health_metrics")
      .select("metric_date,running_distance_km,running_duration_minutes,exercise_minutes,zone_minutes,sleep_minutes,hrv_ms,resting_heart_rate")
      .eq("user_id", userId).gte("metric_date", from).order("metric_date", { ascending: false }).limit(45),
    admin.from("meals")
      .select("meal_date,entry_state")
      .eq("user_id", userId).eq("status", "confirmed").gte("meal_date", from)
      .order("meal_date", { ascending: false }).limit(45),
  ]);
  if (metricsResult.error || mealsResult.error) throw new Error("Assistant starter data could not be loaded.");

  const metrics = (metricsResult.data ?? []) as MetricRow[];
  const meals = ((mealsResult.data ?? []) as MealRow[]).filter((row) => row.entry_state !== "skipped");
  const signals: StarterSignals = {
    hasGoals: true,
    hasRunning: metrics.some((row) => hasPositive(row.running_distance_km) || hasPositive(row.running_duration_minutes)),
    hasEffort: metrics.some((row) => hasPositive(row.exercise_minutes) || hasPositive(row.zone_minutes)),
    hasSleep: metrics.some((row) => isRecorded(row.sleep_minutes)),
    hasRecovery: metrics.some((row) => isRecorded(row.hrv_ms) || isRecorded(row.resting_heart_rate)),
    hasMeals: meals.length > 0,
  };
  const dates = {
    running: metrics.find((row) => hasPositive(row.running_distance_km) || hasPositive(row.running_duration_minutes))?.metric_date,
    effort: metrics.find((row) => hasPositive(row.exercise_minutes) || hasPositive(row.zone_minutes))?.metric_date,
    sleep: metrics.find((row) => isRecorded(row.sleep_minutes))?.metric_date,
    recovery: metrics.find((row) => isRecorded(row.hrv_ms) || isRecorded(row.resting_heart_rate))?.metric_date,
    nutrition: meals[0]?.meal_date,
  };
  // A calendar day and newly recorded observations can change the two rotating questions.
  const key = `${now.toISOString().slice(0, 10)}:${metrics[0]?.metric_date ?? ""}:${metrics.length}:${meals[0]?.meal_date ?? ""}:${meals.length}`;
  const rotation = [...key].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return { calibrated: true as const, prompts: selectStarterPrompts(signals, rotation, dates) };
}

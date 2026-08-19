import { NextResponse } from "next/server";

import { GOOGLE_HEALTH_DASHBOARD_DATA_TYPES } from "@/integrations/google-health/client";
import { processGoogleHealthSyncJob } from "@/integrations/google-health/sync";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recomputeUserHealth } from "@/services/analysis";

export const maxDuration = 50;

type DashboardRefreshJob = { id: string; data_types: string[] | null };

function isDashboardRefreshJob(job: DashboardRefreshJob) {
  const expected = new Set(GOOGLE_HEALTH_DASHBOARD_DATA_TYPES);
  return job.data_types?.length === expected.size && job.data_types.every((dataType) => expected.has(dataType as (typeof GOOGLE_HEALTH_DASHBOARD_DATA_TYPES)[number]));
}

export async function GET() {
  if (isLocalPreviewMode()) return NextResponse.json({
    jobs: [{ id: "preview-sync", status: "completed", progress: 100, completed_at: new Date().toISOString() }],
    importedRecords: { sleep: 14, "daily-heart-rate-variability": 14, "daily-resting-heart-rate": 14, steps: 7 },
    analytics: { datedRecords: 49, metricDays: 14, scoreRows: 42 },
  });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const diagnosticTypes = ["sleep", "daily-heart-rate-variability", "daily-resting-heart-rate", "steps"];
  const [jobsResult, datedRecordsResult, metricDaysResult, scoreRowsResult, diagnosticRecordsResult, ...recordResults] = await Promise.all([
    admin.from("sync_jobs")
      .select("id,import_range,status,progress,error_code,error_message,created_at,started_at,completed_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    admin.from("health_records").select("id", { count: "exact", head: true }).eq("user_id", user.id).not("civil_date", "is", null),
    admin.from("daily_health_metrics").select("metric_date", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("daily_scores").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("health_records").select("data_type,civil_date,start_time,end_time,measured_at").eq("user_id", user.id).in("data_type", diagnosticTypes).limit(1000),
    ...diagnosticTypes.map((dataType) =>
      admin.from("health_records").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("data_type", dataType),
    ),
  ]);
  if (jobsResult.error || datedRecordsResult.error || metricDaysResult.error || scoreRowsResult.error || diagnosticRecordsResult.error || recordResults.some((result) => result.error)) {
    return NextResponse.json({ error: "Sync status could not be loaded." }, { status: 500 });
  }
  const analysisStart = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const coverage = Object.fromEntries(diagnosticTypes.map((dataType, index) => {
    const rows = (diagnosticRecordsResult.data ?? []).filter((record) => record.data_type === dataType);
    const dates = rows.map((record) => record.civil_date).filter((date): date is string => Boolean(date)).sort();
    return [dataType, {
      total: recordResults[index].count ?? 0,
      dated: dates.length,
      recent: dates.filter((date) => date >= analysisStart).length,
      minDate: dates.at(0) ?? null,
      maxDate: dates.at(-1) ?? null,
      timed: rows.filter((record) => record.end_time || record.start_time || record.measured_at).length,
    }];
  }));
  const analytics = {
    datedRecords: datedRecordsResult.count ?? 0,
    metricDays: metricDaysResult.count ?? 0,
    scoreRows: scoreRowsResult.count ?? 0,
  };
  console.info("[api/health/sync] diagnostics loaded", {
    latestJobStatus: jobsResult.data?.[0]?.status ?? null,
    latestJobProgress: jobsResult.data?.[0]?.progress ?? null,
    analytics,
    coverage,
  });
  return NextResponse.json({
    jobs: jobsResult.data,
    importedRecords: Object.fromEntries(diagnosticTypes.map((dataType, index) => [dataType, recordResults[index].count ?? 0])),
    analytics,
  });
}

export async function POST() {
  if (isLocalPreviewMode()) return NextResponse.json({ jobId: "preview-sync", completed: true, message: "Local preview data refreshed. Nothing was sent." });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data: connection, error: connectionError } = await admin.from("provider_connections").select("id").eq("user_id", user.id).eq("provider", "google_health").eq("status", "connected").maybeSingle();
  if (connectionError) return NextResponse.json({ error: "Google Health connection could not be checked." }, { status: 500 });
  if (!connection) return NextResponse.json({ error: "Connect Google Health before syncing." }, { status: 409 });

  const { data: queuedJobs, error: queuedJobsError } = await admin.from("sync_jobs")
    .select("id,data_types")
    .eq("user_id", user.id)
    .eq("status", "queued")
    .eq("import_range", "90_days")
    .order("created_at", { ascending: false })
    .limit(20);
  if (queuedJobsError) return NextResponse.json({ error: "Sync queue could not be checked." }, { status: 500 });
  let job = (queuedJobs ?? []).find(isDashboardRefreshJob) ?? null;
  if (!job) {
    const { data: runningJobs, error: runningJobsError } = await admin.from("sync_jobs")
      .select("id,data_types,progress")
      .eq("user_id", user.id)
      .eq("status", "running")
      .eq("import_range", "90_days")
      .order("created_at", { ascending: false })
      .limit(20);
    if (runningJobsError) return NextResponse.json({ error: "Running syncs could not be checked." }, { status: 500 });
    const runningJob = (runningJobs ?? []).find(isDashboardRefreshJob);
    if (runningJob) {
      return NextResponse.json({
        jobId: runningJob.id,
        running: true,
        progress: runningJob.progress ?? 0,
        message: "Google Health import is already running in the background.",
      });
    }

    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 14);
    const result = await admin.from("sync_jobs").insert({
      user_id: user.id,
      connection_id: connection.id,
      import_range: "90_days",
      data_types: [...GOOGLE_HEALTH_DASHBOARD_DATA_TYPES],
      range_start: start.toISOString(),
      range_end: end.toISOString(),
      status: "queued",
    }).select("id,data_types").single();
    if (result.error) return NextResponse.json({ error: "Sync job could not be created." }, { status: 500 });
    job = result.data;
  }
  if (!job) return NextResponse.json({ error: "Sync job could not be created." }, { status: 500 });

  try {
    let result = await processGoogleHealthSyncJob(job.id, { refreshAnalytics: false });
    for (let batch = 1; batch < GOOGLE_HEALTH_DASHBOARD_DATA_TYPES.length + 3 && !result.completed; batch += 1) {
      result = await processGoogleHealthSyncJob(job.id, { refreshAnalytics: false });
    }
    const analytics = await recomputeUserHealth(user.id);
    return NextResponse.json({
      jobId: job.id,
      ...result,
      analytics,
      message: result.completed && analytics.days > 0
        ? `Google Health sync complete. Dashboard updated from ${analytics.days} day${analytics.days === 1 ? "" : "s"}.`
        : analytics.days > 0
          ? `Dashboard updated from ${analytics.days} day${analytics.days === 1 ? "" : "s"}; the current sync still has more data to fetch.`
        : result.completed
          ? "Google Health import is complete, but no dated measurements were available for the dashboard."
          : "Google Health import continues in the background, but Soma has not found dated measurements for the dashboard yet.",
    });
  } catch (error) {
    console.error("[api/health/sync] manual sync failed", {
      jobId: job.id,
      error: error instanceof Error ? error.message : "Unknown manual sync error.",
    });
    return NextResponse.json({ error: "Google Health sync will be retried." }, { status: 502 });
  }
}

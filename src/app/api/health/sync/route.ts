import { after, NextResponse } from "next/server";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import {
  getGrantedGoogleHealthDataTypes,
  GOOGLE_HEALTH_DASHBOARD_DATA_TYPES,
  GOOGLE_HEALTH_SCOPES,
} from "@/integrations/google-health/client";
import { toSyncStatus } from "@/integrations/google-health/status";
import { automaticGoogleHealthDataTypes } from "@/integrations/google-health/schedule";
import { drainGoogleHealthSyncJob } from "@/integrations/google-health/sync";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getHealthDataCoverage } from "@/services/health-data-coverage";

export const maxDuration = 50;

type OpenJob = {
  id: string;
  data_types: string[] | null;
  status: string;
  progress: number | null;
  error_code: string | null;
  error_message: string | null;
  cursor: { phase?: string } | null;
  completed_at: string | null;
  created_at: string;
};

function isDashboardRefreshJob(job: Pick<OpenJob, "data_types">, expectedTypes: readonly string[]) {
  const expected = new Set(expectedTypes);
  return job.data_types?.length === expected.size && job.data_types.every((dataType) => expected.has(dataType));
}

function continueHealthSync(jobId: string) {
  after(async () => {
    try {
      await drainGoogleHealthSyncJob(jobId, { maxDurationMs: 45_000 });
    } catch (error) {
      console.error("[api/health/sync] manual background update failed", {
        jobId,
        error: error instanceof Error ? error.message : "Unknown sync error.",
      });
    }
  });
}

function previewResponse(details = false) {
  const now = new Date().toISOString();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 90);
  const freshness = calculateSignalFreshness({ measuredAt: now, importedAt: now, coverage: 1 });
  const response: Record<string, unknown> = {
    status: toSyncStatus({ id: "preview-sync", status: "completed", progress: 100, cursor: {} }, {
      sleep: freshness,
      "daily-heart-rate-variability": freshness,
      "daily-resting-heart-rate": freshness,
      steps: freshness,
    }),
    connection: { status: "connected", lastSyncedAt: now, partialConsent: false },
  };
  if (details) Object.assign(response, {
    jobs: [{ id: "preview-sync", status: "completed", progress: 100, error_message: null, completed_at: now, created_at: now }],
    importedRecords: { sleep: 91, "daily-heart-rate-variability": 91, "daily-resting-heart-rate": 91, steps: 91 },
    analytics: { datedRecords: 364, metricDays: 91, scoreRows: 273 },
    coverage: { status: "complete", importedDays: 91, usedDays: 91, importedNights: 91, usedNights: 91, missingDays: 0, missingNights: 0, startDate: start.toISOString().slice(0, 10), endDate: now.slice(0, 10) },
  });
  return response;
}

export async function GET(request: Request) {
  if (isLocalPreviewMode()) return NextResponse.json(previewResponse(new URL(request.url).searchParams.get("details") === "1"));
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const [jobsResult, connectionResult] = await Promise.all([
    admin.from("sync_jobs").select("id,data_types,status,progress,error_code,error_message,cursor,completed_at,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    admin.from("provider_connections").select("status,scopes,last_synced_at").eq("user_id", user.id).eq("provider", "google_health").maybeSingle(),
  ]);
  if (jobsResult.error || connectionResult.error) {
    return NextResponse.json({ error: "Sync status could not be loaded." }, { status: 500 });
  }

  const connection = connectionResult.data;
  const scopes = connection?.scopes ?? [];
  const grantedDataTypes = getGrantedGoogleHealthDataTypes(scopes);
  const partialConsent = !GOOGLE_HEALTH_SCOPES.every((scope) => scopes.includes(scope));
  const statusTypes = GOOGLE_HEALTH_DASHBOARD_DATA_TYPES.filter((dataType) => grantedDataTypes.includes(dataType));
  const recordResults = await Promise.all(statusTypes.map((dataType) => admin.from("health_records")
    .select("civil_date,measured_at").eq("user_id", user.id).eq("data_type", dataType)
    .order("civil_date", { ascending: false, nullsFirst: false }).order("measured_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle()));
  if (recordResults.some((result) => result.error)) return NextResponse.json({ error: "Sync freshness could not be loaded." }, { status: 500 });
  const perType = Object.fromEntries(statusTypes.map((dataType, index) => {
    const record = recordResults[index].data;
    const measuredAt = record?.measured_at ?? (record?.civil_date ? `${record.civil_date}T12:00:00.000Z` : null);
    return [dataType, calculateSignalFreshness({ measuredAt, importedAt: connection?.last_synced_at ?? null, coverage: record ? 1 : 0 })];
  }));
  const jobs = (jobsResult.data ?? []) as OpenJob[];
  const status = toSyncStatus(jobs[0] ?? null, perType, partialConsent);

  const response: Record<string, unknown> = {
    status,
    jobs,
    connection: { status: connection?.status ?? "disconnected", lastSyncedAt: connection?.last_synced_at ?? null, partialConsent },
  };
  if (new URL(request.url).searchParams.get("details") === "1") {
    const diagnosticTypes = ["sleep", "daily-heart-rate-variability", "daily-resting-heart-rate", "steps"];
    const [datedRecords, metricDays, scoreRows, coverageResult, ...counts] = await Promise.all([
      admin.from("health_records").select("id", { count: "exact", head: true }).eq("user_id", user.id).not("civil_date", "is", null),
      admin.from("daily_health_metrics").select("metric_date", { count: "exact", head: true }).eq("user_id", user.id),
      admin.from("daily_scores").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      getHealthDataCoverage(user.id).then((coverage) => ({ coverage, error: null })).catch(() => ({ coverage: null, error: true })),
      ...diagnosticTypes.map((dataType) => admin.from("health_records").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("data_type", dataType)),
    ]);
    if (![datedRecords, metricDays, scoreRows, ...counts].some((result) => result.error)) {
      response.importedRecords = Object.fromEntries(diagnosticTypes.map((dataType, index) => [dataType, counts[index].count ?? 0]));
      response.analytics = { datedRecords: datedRecords.count ?? 0, metricDays: metricDays.count ?? 0, scoreRows: scoreRows.count ?? 0 };
    }
    if (coverageResult.coverage) response.coverage = coverageResult.coverage;
    if (coverageResult.error) response.coverageError = true;
  }
  return NextResponse.json(response);
}

export async function POST() {
  if (isLocalPreviewMode()) {
    return NextResponse.json({ ...previewResponse(), message: "Local preview data is already current. Nothing was sent." }, { status: 202 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data: connection, error: connectionError } = await admin.from("provider_connections").select("id,status,scopes")
    .eq("user_id", user.id).eq("provider", "google_health").maybeSingle();
  if (connectionError) return NextResponse.json({ error: "Google Health connection could not be checked." }, { status: 500 });
  if (!connection || ["expired", "revoked"].includes(connection.status)) {
    return NextResponse.json({ error: "Reconnect Google Health before syncing.", phase: "needs_reconnect" }, { status: 409 });
  }

  const dataTypes = automaticGoogleHealthDataTypes(connection.scopes ?? []);
  if (!dataTypes.length) return NextResponse.json({ error: "Grant at least one Soma health permission before syncing." }, { status: 409 });

  const { data: openJobs, error: openJobsError } = await admin.from("sync_jobs")
    .select("id,data_types,status,progress,error_code,error_message,cursor,completed_at,created_at")
    .eq("user_id", user.id).in("status", ["queued", "running"]).order("created_at", { ascending: false }).limit(20);
  if (openJobsError) return NextResponse.json({ error: "Sync queue could not be checked." }, { status: 500 });
  const existing = ((openJobs ?? []) as OpenJob[]).find((job) => isDashboardRefreshJob(job, dataTypes));
  if (existing) {
    continueHealthSync(existing.id);
    return NextResponse.json({ status: toSyncStatus(existing, {}), message: "Google Health is already updating in the background." }, { status: 202 });
  }

  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 3);
  const { data: job, error: jobError } = await admin.from("sync_jobs").insert({
    user_id: user.id,
    connection_id: connection.id,
    import_range: "90_days",
    data_types: [...dataTypes],
    range_start: start.toISOString(),
    range_end: end.toISOString(),
    status: "queued",
    sync_trigger: "manual",
  }).select("id,data_types,status,progress,error_code,error_message,cursor,completed_at,created_at").single();
  if (jobError || !job) return NextResponse.json({ error: "Sync job could not be created." }, { status: 500 });

  continueHealthSync(job.id);

  return NextResponse.json({
    status: toSyncStatus(job as OpenJob, {}),
    message: "Google Health update started. You can keep using Soma.",
  }, { status: 202 });
}

import { after, NextResponse } from "next/server";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import {
  getGrantedGoogleHealthDataTypes,
  GOOGLE_HEALTH_DASHBOARD_DATA_TYPES,
  GOOGLE_HEALTH_SCOPES,
} from "@/integrations/google-health/client";
import { toSyncStatus } from "@/integrations/google-health/status";
import {
  automaticGoogleHealthDataTypes,
  clampGoogleHealthRangeToConnection,
  manualGoogleHealthRange,
} from "@/integrations/google-health/schedule";
import { drainGoogleHealthSyncJob, shouldRefreshAnalyticsForTrigger } from "@/integrations/google-health/sync";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createCloudflareAdminClient, healthSyncDiagnostics, latestHealthRecordsByType } from "@/lib/cloudflare/db";
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
  started_at?: string | null;
  retry_after?: string | null;
  sync_trigger?: string;
  import_range?: string;
};

function isDashboardRefreshJob(job: Pick<OpenJob, "data_types" | "sync_trigger" | "import_range">, expectedTypes: readonly string[]) {
  if (!((job.sync_trigger === "manual" || job.sync_trigger === "initial") && job.import_range === "90_days")) return false;
  const expected = new Set(expectedTypes);
  return job.data_types?.length === expected.size && job.data_types.every((dataType) => expected.has(dataType));
}

function retryIsDue(job: Pick<OpenJob, "retry_after">, now = Date.now()) {
  return !job.retry_after || new Date(job.retry_after).getTime() <= now;
}

function continueHealthSync(job: Pick<OpenJob, "id" | "sync_trigger">) {
  after(async () => {
    try {
      await drainGoogleHealthSyncJob(job.id, {
        maxBatches: 6,
        maxDurationMs: 25_000,
        refreshAnalytics: shouldRefreshAnalyticsForTrigger(job.sync_trigger ?? "manual"),
      });
    } catch (error) {
      console.error("[api/health/sync] manual background update failed", {
        jobId: job.id,
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
  const admin = createCloudflareAdminClient();
  const [jobsResult, connectionResult] = await Promise.all([
    admin.from("sync_jobs").select("id,data_types,status,progress,error_code,error_message,cursor,completed_at,created_at,started_at,retry_after,sync_trigger,import_range")
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
  let latestRecords: Awaited<ReturnType<typeof latestHealthRecordsByType>>;
  try {
    latestRecords = await latestHealthRecordsByType(user.id, statusTypes);
  } catch {
    return NextResponse.json({ error: "Sync freshness could not be loaded." }, { status: 500 });
  }
  const recordsByType = new Map(latestRecords.map((record) => [record.data_type, record]));
  const perType = Object.fromEntries(statusTypes.map((dataType) => {
    const record = recordsByType.get(dataType);
    const measuredAt = record?.measured_at ?? (record?.civil_date ? `${record.civil_date}T12:00:00.000Z` : null);
    return [dataType, calculateSignalFreshness({ measuredAt, importedAt: connection?.last_synced_at ?? null, coverage: record ? 1 : 0 })];
  }));
  const jobs = (jobsResult.data ?? []) as OpenJob[];

  // The scheduled worker remains the primary queue consumer. Status polling is
  // also allowed to advance the user's active manual dashboard refresh so a
  // missed cron invocation cannot leave it permanently queued after its first
  // batch. Initial, automatic, and webhook jobs remain owned by the worker.
  const automaticTypes = automaticGoogleHealthDataTypes(scopes);
  const activeJob = jobs.find((job) => job.sync_trigger === "manual"
    && isDashboardRefreshJob(job, automaticTypes)
    && (job.status === "queued" || job.status === "running"));
  const status = toSyncStatus(activeJob ?? jobs[0] ?? null, perType, partialConsent);
  if (activeJob) {
    const staleRunning = activeJob.status === "running"
      && Boolean(activeJob.started_at)
      && new Date(activeJob.started_at as string).getTime() < Date.now() - 10 * 60_000;
    if (staleRunning) {
      const recovery = await admin.from("sync_jobs").update({ status: "queued", started_at: null })
        .eq("id", activeJob.id).eq("user_id", user.id).eq("status", "running");
      if (!recovery.error) continueHealthSync(activeJob);
    } else if (activeJob.status === "queued" && retryIsDue(activeJob)) continueHealthSync(activeJob);
  }

  const response: Record<string, unknown> = {
    status,
    jobs,
    connection: { status: connection?.status ?? "disconnected", lastSyncedAt: connection?.last_synced_at ?? null, partialConsent },
  };
  if (new URL(request.url).searchParams.get("details") === "1") {
    const diagnosticTypes = ["sleep", "daily-heart-rate-variability", "daily-resting-heart-rate", "steps"];
    const [diagnosticsResult, coverageResult] = await Promise.all([
      healthSyncDiagnostics(user.id, diagnosticTypes)
        .then((diagnostics) => ({ diagnostics, error: false }))
        .catch(() => ({ diagnostics: null, error: true })),
      getHealthDataCoverage(user.id).then((coverage) => ({ coverage, error: null })).catch(() => ({ coverage: null, error: true })),
    ]);
    if (diagnosticsResult.diagnostics) {
      response.importedRecords = diagnosticsResult.diagnostics.importedRecords;
      response.analytics = diagnosticsResult.diagnostics.analytics;
    }
    if (diagnosticsResult.error) response.diagnosticsError = true;
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
  const admin = createCloudflareAdminClient();
  const { data: connection, error: connectionError } = await admin.from("provider_connections").select("id,status,scopes,metadata")
    .eq("user_id", user.id).eq("provider", "google_health").maybeSingle();
  if (connectionError) return NextResponse.json({ error: "Google Health connection could not be checked." }, { status: 500 });
  if (!connection || ["expired", "revoked"].includes(connection.status)) {
    return NextResponse.json({ error: "Reconnect Google Health before syncing.", phase: "needs_reconnect" }, { status: 409 });
  }

  const dataTypes = automaticGoogleHealthDataTypes(connection.scopes ?? []);
  if (!dataTypes.length) return NextResponse.json({ error: "Grant at least one Soma health permission before syncing." }, { status: 409 });

  const { data: openJobs, error: openJobsError } = await admin.from("sync_jobs")
    .select("id,data_types,status,progress,error_code,error_message,cursor,completed_at,created_at,sync_trigger,import_range")
    .eq("user_id", user.id).in("status", ["queued", "running"]).order("created_at", { ascending: false }).limit(20);
  if (openJobsError) return NextResponse.json({ error: "Sync queue could not be checked." }, { status: 500 });
  const existing = ((openJobs ?? []) as OpenJob[]).find((job) => isDashboardRefreshJob(job, dataTypes));
  if (existing) {
    continueHealthSync(existing);
    return NextResponse.json({ status: toSyncStatus(existing, {}), message: "Google Health is already updating in the background." }, { status: 202 });
  }

  const range = clampGoogleHealthRangeToConnection(manualGoogleHealthRange(new Date()), connection.metadata);
  const { data: job, error: jobError } = await admin.from("sync_jobs").insert({
    user_id: user.id,
    connection_id: connection.id,
    import_range: "90_days",
    data_types: [...dataTypes],
    range_start: range.start,
    range_end: range.end,
    status: "queued",
    sync_trigger: "manual",
  }).select("id,data_types,status,progress,error_code,error_message,cursor,completed_at,created_at").single();
  if (jobError || !job) return NextResponse.json({ error: "Sync job could not be created." }, { status: 500 });

  continueHealthSync({ ...job, sync_trigger: "manual" });

  return NextResponse.json({
    status: toSyncStatus(job as OpenJob, {}),
    message: "Google Health update started. You can keep using Soma.",
  }, { status: 202 });
}

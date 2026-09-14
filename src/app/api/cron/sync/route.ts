import { NextResponse } from "next/server";

import {
  automaticGoogleHealthDataTypes,
  automaticGoogleHealthRange,
  clampGoogleHealthRangeToConnection,
  GOOGLE_HEALTH_ANALYTICS_BACKFILL_IDEMPOTENCY_KEY,
  manualGoogleHealthRange,
  shouldQueueGoogleHealthAnalyticsBackfill,
  googleHealthHistorySeededFromTakeout,
  isAutomaticGoogleHealthSyncDue,
} from "@/integrations/google-health/schedule";
import { drainGoogleHealthSyncJob, selectNextGoogleHealthSyncJob, shouldRefreshAnalyticsForTrigger, type GoogleHealthSyncQueueCandidate } from "@/integrations/google-health/sync";
import { coalesceWebhookJobs, mergeWebhookRange, type WebhookJobCandidate } from "@/integrations/google-health/webhook-jobs";
import { getGrantedGoogleHealthDataTypes, isGoogleHealthDataType } from "@/integrations/google-health/client";
import { syncGoogleCalendar } from "@/integrations/google-calendar/sync";
import { requireServerEnv } from "@/lib/env";
import { claimCloudflareLock, createCloudflareAdminClient } from "@/lib/cloudflare/db";

export const maxDuration = 50;

function authorized(request: Request) {
  return request.headers.get("authorization") === `Bearer ${requireServerEnv("CRON_SECRET")}`;
}

function webhookRange(payload: Record<string, unknown>) {
  const data = payload.data as { intervals?: Array<{ physicalTimeInterval?: { startTime?: string; endTime?: string }; civilIso8601TimeInterval?: { startTime?: string; endTime?: string } }> } | undefined;
  const intervals = data?.intervals ?? [];
  const starts = intervals.map((item) => item.physicalTimeInterval?.startTime ?? item.civilIso8601TimeInterval?.startTime).filter((value): value is string => Boolean(value));
  const ends = intervals.map((item) => item.physicalTimeInterval?.endTime ?? item.civilIso8601TimeInterval?.endTime).filter((value): value is string => Boolean(value));
  const now = new Date();
  const fallbackStart = new Date(now);
  fallbackStart.setUTCDate(fallbackStart.getUTCDate() - 2);
  return {
    start: starts.length ? new Date(starts.sort()[0]) : fallbackStart,
    end: ends.length ? new Date(ends.sort().at(-1) as string) : now,
  };
}

async function queueWebhookJobs() {
  const admin = createCloudflareAdminClient();
  const { data: events, error: eventsError } = await admin.from("webhook_events").select("*").eq("status", "queued").order("received_at").limit(100);
  if (eventsError) throw new Error("Queued webhook events could not be loaded.");
  const healthUserIds = [...new Set((events ?? []).map((event) => event.health_user_id).filter((value): value is string => Boolean(value)))];
  const connectionResult = healthUserIds.length
    ? await admin.from("provider_connections").select("id,user_id,external_user_id,metadata,scopes").eq("provider", "google_health").in("external_user_id", healthUserIds)
    : { data: [], error: null };
  if (connectionResult.error) throw new Error("Webhook provider connections could not be loaded.");
  const connectionByExternalId = new Map((connectionResult.data ?? []).map((connection) => [connection.external_user_id, connection]));
  const candidates: WebhookJobCandidate[] = [];
  for (const event of events ?? []) {
    const connection = connectionByExternalId.get(event.health_user_id);
    if (!connection || !event.data_type || !isGoogleHealthDataType(event.data_type)) {
      const { error } = await admin.from("webhook_events").update({ status: "failed", last_error: "No matching connection." }).eq("id", event.id);
      if (error) throw new Error("Invalid webhook event could not be marked as failed.");
      continue;
    }
    if (!automaticGoogleHealthDataTypes(connection.scopes ?? []).includes(event.data_type)) {
      const { error } = await admin.from("webhook_events").update({ status: "completed", processed_at: new Date().toISOString() }).eq("id", event.id);
      if (error) throw new Error("Unused raw-stream webhook could not be completed.");
      continue;
    }
    const rawRange = webhookRange(event.payload as Record<string, unknown>);
    const range = clampGoogleHealthRangeToConnection({ start: rawRange.start.toISOString(), end: rawRange.end.toISOString() }, connection.metadata);
    if (range.start >= range.end) {
      const { error } = await admin.from("webhook_events").update({ status: "completed", processed_at: new Date().toISOString() }).eq("id", event.id);
      if (error) throw new Error("Out-of-range webhook event could not be completed.");
      continue;
    }
    candidates.push({
      eventId: event.id,
      userId: connection.user_id,
      connectionId: connection.id,
      dataType: event.data_type,
      rangeStart: range.start,
      rangeEnd: range.end,
    });
  }

  for (const job of coalesceWebhookJobs(candidates)) {
    const { data: openJobs, error: openJobsError } = await admin.from("sync_jobs")
      .select("id,range_start,range_end,data_types,cursor,updated_at")
      .eq("user_id", job.userId)
      .eq("connection_id", job.connectionId)
      .eq("status", "queued")
      .eq("sync_trigger", "webhook")
      .contains("data_types", [job.dataType])
      .order("created_at")
      .limit(20);
    if (openJobsError) throw new Error("Open webhook sync jobs could not be loaded.");
    const existing = openJobs?.find((item) => item.data_types?.length === 1 && Object.keys(item.cursor ?? {}).length === 0);
    let stored = false;
    if (existing) {
      const result = await admin.from("sync_jobs")
        .update(mergeWebhookRange(existing, job))
        .eq("id", existing.id)
        .eq("status", "queued")
        .eq("updated_at", existing.updated_at)
        .select("id")
        .maybeSingle();
      stored = Boolean(result.data) && !result.error;
    }
    if (!stored) {
      const result = await admin.from("sync_jobs").insert({
        user_id: job.userId,
        connection_id: job.connectionId,
        import_range: "90_days",
        data_types: [job.dataType],
        range_start: job.rangeStart,
        range_end: job.rangeEnd,
        status: "queued",
        sync_trigger: "webhook",
      });
      stored = !result.error;
    }
    if (stored) {
      const { error } = await admin.from("webhook_events").update({ status: "completed", processed_at: new Date().toISOString() }).in("id", job.eventIds);
      if (error) throw new Error("Processed webhook events could not be completed.");
    } else {
      throw new Error("Webhook sync job could not be stored.");
    }
  }
}

async function queueAutomaticJobs(now = new Date()) {
  const admin = createCloudflareAdminClient();
  const { data: connections, error: connectionError } = await admin.from("provider_connections")
    .select("id,user_id,scopes,last_lab_synced_at,metadata")
    .eq("provider", "google_health")
    .eq("status", "connected");
  if (connectionError) throw new Error("Automatic sync connections could not be loaded.");
  const userIds = [...new Set((connections ?? []).map((connection) => connection.user_id))];
  const connectionIds = (connections ?? []).map((connection) => connection.id);
  const [profileResult, openJobsResult, historyJobsResult] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("user_id,timezone").in("user_id", userIds)
      : Promise.resolve({ data: [], error: null }),
    connectionIds.length
      ? admin.from("sync_jobs").select("connection_id,sync_trigger,import_range,scheduled_civil_date,scheduled_sync_slot").in("connection_id", connectionIds).in("status", ["queued", "running"])
      : Promise.resolve({ data: [], error: null }),
    connectionIds.length
      ? admin.from("sync_jobs").select("connection_id").in("connection_id", connectionIds).eq("import_range", "all_history").eq("status", "completed")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (profileResult.error) throw new Error("Automatic sync timezones could not be loaded.");
  if (openJobsResult.error) throw new Error("Open Google Health sync jobs could not be loaded.");
  if (historyJobsResult.error) throw new Error("Google Health history status could not be loaded.");
  const timezoneByUser = new Map((profileResult.data ?? []).map((profile) => [profile.user_id, profile.timezone ?? "Europe/Paris"]));
  const fullHistoryConnections = new Set((historyJobsResult.data ?? []).map((job) => job.connection_id));
  const openJobsByConnection = new Map<string, Array<{ sync_trigger: string; import_range: string; scheduled_civil_date: string | null; scheduled_sync_slot: string | null }>>();
  for (const job of openJobsResult.data ?? []) {
    const jobs = openJobsByConnection.get(job.connection_id) ?? [];
    jobs.push(job);
    openJobsByConnection.set(job.connection_id, jobs);
  }
  let windowOpen = false;
  let queued = 0;

  for (const connection of connections ?? []) {
    const timezone = timezoneByUser.get(connection.user_id) ?? "Europe/Paris";
    const schedule = isAutomaticGoogleHealthSyncDue({
      now,
      timezone,
      lastLabSyncedAt: connection.last_lab_synced_at,
    });
    if (!schedule.due) continue;
    const openJobs = openJobsByConnection.get(connection.id) ?? [];
    windowOpen = true;
    const hourlyDataTypes = automaticGoogleHealthDataTypes(connection.scopes ?? []);
    if (!hourlyDataTypes.length) continue;
    if (openJobs.some((job) => job.sync_trigger === "automatic" || job.sync_trigger === "manual")) continue;
    const analyticsBackfillOpen = openJobs.some((job) => job.sync_trigger === "initial" && job.import_range === "90_days");
    if (shouldQueueGoogleHealthAnalyticsBackfill({
      metadata: connection.metadata,
      analyticsBackfillOpen,
    })) {
      // Repair the analytics window as soon as the API can be queried. It does
      // not need to wait for the optional all-history import below.
      const backfillLockKey = `google-health-analytics-backfill:${connection.id}`;
      if (!await claimCloudflareLock(backfillLockKey, connection.user_id, 60_000)) continue;
      const range = clampGoogleHealthRangeToConnection(manualGoogleHealthRange(now), connection.metadata);
      const historicalDataTypes = automaticGoogleHealthDataTypes(connection.scopes ?? []);
      const { error } = await admin.from("sync_jobs").upsert({
        user_id: connection.user_id,
        connection_id: connection.id,
        idempotency_key: GOOGLE_HEALTH_ANALYTICS_BACKFILL_IDEMPOTENCY_KEY,
        import_range: "90_days",
        data_types: [...historicalDataTypes],
        range_start: range.start,
        range_end: range.end,
        status: "queued",
        sync_trigger: "initial",
      }, { onConflict: "connection_id,idempotency_key", ignoreDuplicates: true });
      if (!error) queued += 1;
      else if (error.code !== "23505") throw new Error("Historical Google Health analytics repair could not be queued.");
      continue;
    }
    if (analyticsBackfillOpen) continue;
    const historyImportOpen = openJobs.some((job) => job.sync_trigger === "initial" && job.import_range === "all_history");
    const historySeeded = googleHealthHistorySeededFromTakeout(connection.metadata);
    if (!historySeeded && !fullHistoryConnections.has(connection.id) && !historyImportOpen) {
      const historyDataTypes = getGrantedGoogleHealthDataTypes(connection.scopes ?? []);
      const { error } = await admin.from("sync_jobs").insert({
        user_id: connection.user_id,
        connection_id: connection.id,
        import_range: "all_history",
        data_types: [...historyDataTypes],
        range_start: "2009-01-01T00:00:00.000Z",
        range_end: now.toISOString(),
        status: "queued",
        sync_trigger: "initial",
      });
      if (!error) queued += 1;
      else throw new Error("Complete Google Health history could not be queued.");
      continue;
    }
    // A full-history import is lower priority than a current automatic window.
    // Keep the latter queueable so selectNextGoogleHealthSyncJob can prevent a
    // long historical import from starving fresh effort, sleep, and recovery data.
    const range = clampGoogleHealthRangeToConnection(automaticGoogleHealthRange(now), connection.metadata);
    const { error } = await admin.from("sync_jobs").insert({
      user_id: connection.user_id,
      connection_id: connection.id,
      import_range: "90_days",
      data_types: [...hourlyDataTypes],
      range_start: range.start,
      range_end: range.end,
      status: "queued",
      sync_trigger: "automatic",
      scheduled_civil_date: schedule.civilDate,
      scheduled_sync_slot: schedule.slot,
    });
    if (!error) queued += 1;
    else if (error.code !== "23505") throw new Error("Automatic Google Health sync could not be queued.");
  }

  return { queued, windowOpen };
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let automatic = { queued: 0, windowOpen: false };
  try {
    automatic = await queueAutomaticJobs();
    await queueWebhookJobs();
  } catch (error) {
    console.error("[api/cron/sync] sync queue failed", { error: error instanceof Error ? error.message : "Unknown queue error." });
    return NextResponse.json({ error: "Google Health sync could not be scheduled." }, { status: 500 });
  }
  const admin = createCloudflareAdminClient();
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { error: staleJobError } = await admin.from("sync_jobs").update({ status: "queued", started_at: null })
    .eq("status", "running").lt("started_at", staleBefore);
  if (staleJobError) return NextResponse.json({ error: "Stale sync jobs could not be recovered." }, { status: 500 });

  const now = new Date().toISOString();
  const deadline = Date.now() + 25_000;
  const results: Array<Record<string, unknown>> = [];
  for (let jobIndex = 0; jobIndex < 1 && Date.now() < deadline - 2_000; jobIndex += 1) {
    const readyJobsResult = await admin.from("sync_jobs")
      .select("id,sync_trigger,import_range,created_at")
      .eq("status", "queued")
      .or(`retry_after.is.null,retry_after.lte.${now}`)
      .order("created_at")
      .limit(100);
    if (readyJobsResult.error) return NextResponse.json({ error: "Next sync job could not be loaded." }, { status: 500 });
    const job = selectNextGoogleHealthSyncJob((readyJobsResult.data ?? []) as GoogleHealthSyncQueueCandidate[]);
    if (!job) break;
    try {
      const result = await drainGoogleHealthSyncJob(job.id, {
        maxBatches: 6,
        maxDurationMs: Math.max(1_000, deadline - Date.now() - 1_500),
        refreshAnalytics: shouldRefreshAnalyticsForTrigger(job.sync_trigger),
      });
      results.push({ id: job.id, ...result });
      if (result && "materializing" in result) break;
    } catch {
      results.push({ id: job.id, error: true });
    }
  }
  if (results.length) return NextResponse.json({ automatic, processed: results });

  const calendarCutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { data: calendarConnection, error: calendarError } = await admin.from("provider_connections").select("user_id,last_synced_at")
    .eq("provider", "google_calendar").eq("status", "connected").or(`last_synced_at.is.null,last_synced_at.lt.${calendarCutoff}`)
    .order("last_synced_at", { ascending: true, nullsFirst: true }).limit(1).maybeSingle();
  if (calendarError) return NextResponse.json({ error: "Calendar sync state could not be loaded." }, { status: 500 });
  if (!calendarConnection) return NextResponse.json({ automatic, processed: [], calendar: null });
  try {
    return NextResponse.json({ automatic, processed: [], calendar: await syncGoogleCalendar(calendarConnection.user_id) });
  } catch (error) {
    console.error("[api/cron/sync] calendar update failed", { userId: calendarConnection.user_id, error: error instanceof Error ? error.message : "Unknown error." });
    return NextResponse.json({ automatic, processed: [], calendar: { error: true } });
  }
}

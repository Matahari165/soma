import { NextResponse } from "next/server";

import { processGoogleHealthSyncJob } from "@/integrations/google-health/sync";
import { coalesceWebhookJobs, mergeWebhookRange, type WebhookJobCandidate } from "@/integrations/google-health/webhook-jobs";
import { requireServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 50;

function authorized(request: Request) {
  return request.headers.get("authorization") === `Bearer ${requireServerEnv("CRON_SECRET")}`;
}

function webhookRange(payload: Record<string, unknown>) {
  const data = payload.data as { intervals?: Array<{ physicalTimeInterval?: { startTime?: string; endTime?: string } }> } | undefined;
  const intervals = data?.intervals ?? [];
  const starts = intervals.map((item) => item.physicalTimeInterval?.startTime).filter((value): value is string => Boolean(value));
  const ends = intervals.map((item) => item.physicalTimeInterval?.endTime).filter((value): value is string => Boolean(value));
  const now = new Date();
  const fallbackStart = new Date(now);
  fallbackStart.setUTCDate(fallbackStart.getUTCDate() - 2);
  return {
    start: starts.length ? new Date(starts.sort()[0]) : fallbackStart,
    end: ends.length ? new Date(ends.sort().at(-1) as string) : now,
  };
}

async function queueWebhookJobs() {
  const admin = createSupabaseAdminClient();
  const { data: events } = await admin.from("webhook_events").select("*").eq("status", "queued").order("received_at").limit(100);
  const healthUserIds = [...new Set((events ?? []).map((event) => event.health_user_id).filter((value): value is string => Boolean(value)))];
  const connectionResult = healthUserIds.length
    ? await admin.from("provider_connections").select("id,user_id,external_user_id").eq("provider", "google_health").in("external_user_id", healthUserIds)
    : { data: [], error: null };
  if (connectionResult.error) return;
  const connectionByExternalId = new Map((connectionResult.data ?? []).map((connection) => [connection.external_user_id, connection]));
  const candidates: WebhookJobCandidate[] = [];
  for (const event of events ?? []) {
    const connection = connectionByExternalId.get(event.health_user_id);
    if (!connection || !event.data_type) {
      await admin.from("webhook_events").update({ status: "failed", last_error: "No matching connection." }).eq("id", event.id);
      continue;
    }
    const range = webhookRange(event.payload as Record<string, unknown>);
    candidates.push({
      eventId: event.id,
      userId: connection.user_id,
      connectionId: connection.id,
      dataType: event.data_type,
      rangeStart: range.start.toISOString(),
      rangeEnd: range.end.toISOString(),
    });
  }

  for (const job of coalesceWebhookJobs(candidates)) {
    const { data: openJobs, error: openJobsError } = await admin.from("sync_jobs")
      .select("id,range_start,range_end,data_types,cursor,updated_at")
      .eq("user_id", job.userId)
      .eq("connection_id", job.connectionId)
      .eq("status", "queued")
      .contains("data_types", [job.dataType])
      .order("created_at")
      .limit(20);
    if (openJobsError) continue;
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
      });
      stored = !result.error;
    }
    if (stored) {
      await admin.from("webhook_events").update({ status: "completed", processed_at: new Date().toISOString() }).in("id", job.eventIds);
    }
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  await queueWebhookJobs();
  const admin = createSupabaseAdminClient();
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin.from("sync_jobs").update({ status: "queued", started_at: null })
    .eq("status", "running").lt("started_at", staleBefore);

  const { data: job } = await admin.from("sync_jobs").select("id").eq("status", "queued").order("created_at").limit(1).maybeSingle();
  if (!job) return NextResponse.json({ processed: [] });

  let result;
  try {
    result = { id: job.id, ...(await processGoogleHealthSyncJob(job.id)) };
  } catch {
    result = { id: job.id, error: true };
  }
  const results = [result];
  return NextResponse.json({ processed: results });
}

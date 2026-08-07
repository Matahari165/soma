import { NextResponse } from "next/server";

import { processGoogleHealthSyncJob } from "@/integrations/google-health/sync";
import { requireServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
  const { data: events } = await admin.from("webhook_events").select("*").eq("status", "queued").order("received_at").limit(20);
  for (const event of events ?? []) {
    const { data: connection } = await admin.from("provider_connections").select("id,user_id").eq("external_user_id", event.health_user_id).eq("provider", "google_health").maybeSingle();
    if (!connection || !event.data_type) {
      await admin.from("webhook_events").update({ status: "failed", last_error: "No matching connection." }).eq("id", event.id);
      continue;
    }
    const range = webhookRange(event.payload as Record<string, unknown>);
    await admin.from("sync_jobs").insert({
      user_id: connection.user_id,
      connection_id: connection.id,
      import_range: "90_days",
      data_types: [event.data_type],
      range_start: range.start.toISOString(),
      range_end: range.end.toISOString(),
      status: "queued",
    });
    await admin.from("webhook_events").update({ status: "completed", processed_at: new Date().toISOString() }).eq("id", event.id);
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  await queueWebhookJobs();
  const admin = createSupabaseAdminClient();
  const { data: jobs } = await admin.from("sync_jobs").select("id").eq("status", "queued").order("created_at").limit(5);
  const results = [];
  for (const job of jobs ?? []) {
    try {
      results.push({ id: job.id, ...(await processGoogleHealthSyncJob(job.id)) });
    } catch {
      results.push({ id: job.id, error: true });
    }
  }
  return NextResponse.json({ processed: results });
}

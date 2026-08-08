import { NextResponse } from "next/server";

import { GOOGLE_HEALTH_DATA_TYPES } from "@/integrations/google-health/client";
import { processGoogleHealthSyncJob } from "@/integrations/google-health/sync";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (isLocalPreviewMode()) return NextResponse.json({ jobs: [{ id: "preview-sync", status: "completed", progress: 100, completed_at: new Date().toISOString() }] });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("sync_jobs")
    .select("id,import_range,status,progress,error_code,error_message,created_at,started_at,completed_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
  if (error) return NextResponse.json({ error: "Sync status could not be loaded." }, { status: 500 });
  return NextResponse.json({ jobs: data });
}

export async function POST() {
  if (isLocalPreviewMode()) return NextResponse.json({ jobId: "preview-sync", completed: true, message: "Local preview data refreshed. Nothing was sent." });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data: connection } = await admin.from("provider_connections").select("id").eq("user_id", user.id).eq("provider", "google_health").eq("status", "connected").maybeSingle();
  if (!connection) return NextResponse.json({ error: "Connect Google Health before syncing." }, { status: 409 });

  let { data: job } = await admin.from("sync_jobs").select("id").eq("user_id", user.id).eq("status", "queued").order("created_at").limit(1).maybeSingle();
  if (!job) {
    const { data: runningJob } = await admin.from("sync_jobs").select("id,progress").eq("user_id", user.id).eq("status", "running").order("created_at").limit(1).maybeSingle();
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
    start.setUTCDate(start.getUTCDate() - 7);
    const result = await admin.from("sync_jobs").insert({
      user_id: user.id,
      connection_id: connection.id,
      import_range: "90_days",
      data_types: [...GOOGLE_HEALTH_DATA_TYPES],
      range_start: start.toISOString(),
      range_end: end.toISOString(),
      status: "queued",
    }).select("id").single();
    job = result.data;
  }
  if (!job) return NextResponse.json({ error: "Sync job could not be created." }, { status: 500 });

  try {
    const result = await processGoogleHealthSyncJob(job.id);
    return NextResponse.json({
      jobId: job.id,
      ...result,
      message: result.completed
        ? "Google Health import is complete."
        : "Google Health import continues in the background.",
    });
  } catch {
    return NextResponse.json({ error: "Google Health sync will be retried." }, { status: 502 });
  }
}

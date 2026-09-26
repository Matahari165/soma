import { NextResponse } from "next/server";

import { activitySessionPreview } from "@/domain/health/activity-session-preview";

import { getCurrentUser } from "@/lib/auth";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { loadHeartRateReferenceForUser } from "@/services/heart-rate-reference";
import { getActivitySessionTelemetry } from "@/services/activity-session-telemetry";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const recordId = new URL(request.url).searchParams.get("record");
  if (!recordId || recordId.length > 500) return NextResponse.json({ error: "Invalid workout." }, { status: 400 });

  if (isLocalPreviewMode()) {
    const reference = await loadHeartRateReferenceForUser(user.id);
    const telemetry = activitySessionPreview(recordId, new Date(), reference.maximumHeartRate);
    if (!telemetry) return NextResponse.json({ error: "Workout not found." }, { status: 404 });
    return NextResponse.json(telemetry, { headers: { "Cache-Control": "private, no-store" } });
  }

  const admin = createCloudflareAdminClient();
  const { data: workout, error } = await admin.from("health_records")
    .select("start_time,end_time,civil_date")
    .eq("user_id", user.id)
    .eq("provider", "google_health")
    .eq("data_type", "exercise")
    .eq("source_record_id", recordId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Workout could not be loaded." }, { status: 500 });
  if (!workout) return NextResponse.json({ error: "Workout not found." }, { status: 404 });
  if (!workout.start_time || !workout.end_time) return NextResponse.json({ error: "Workout time is unavailable." }, { status: 422 });

  try {
    const telemetry = await getActivitySessionTelemetry(user.id, {
      startTime: workout.start_time,
      endTime: workout.end_time,
      date: workout.civil_date,
    });
    return NextResponse.json(telemetry, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Workout readings could not be loaded." }, { status: 500 });
  }
}

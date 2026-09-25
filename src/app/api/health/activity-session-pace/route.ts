import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { getActivitySessionPace } from "@/services/activity-session-pace";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const recordId = new URL(request.url).searchParams.get("record");
  if (!recordId || recordId.length > 500) return NextResponse.json({ error: "Invalid workout." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ splits: [] }, { headers: { "Cache-Control": "private, no-store" } });

  const { data: workout, error } = await createCloudflareAdminClient().from("health_records")
    .select("start_time,end_time")
    .eq("user_id", user.id)
    .eq("provider", "google_health")
    .eq("data_type", "exercise")
    .eq("source_record_id", recordId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Workout could not be loaded." }, { status: 500 });
  if (!workout) return NextResponse.json({ error: "Workout not found." }, { status: 404 });
  if (!workout.start_time || !workout.end_time) return NextResponse.json({ splits: [] }, { headers: { "Cache-Control": "private, no-store" } });

  const splits = await getActivitySessionPace(user.id, { startTime: workout.start_time, endTime: workout.end_time });
  return NextResponse.json({ splits }, { headers: { "Cache-Control": "private, no-store" } });
}

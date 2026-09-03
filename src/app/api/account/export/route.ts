import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { previewDashboard, previewProfile } from "@/lib/local-preview";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { createR2ArchiveDownloadUrl } from "@/lib/r2";
import { listPreviewMeals } from "@/services/meal-preview";
import { mealToApi } from "@/services/meal-api";

const userTables = ["profiles", "health_goals", "sleep_preferences", "dashboard_layouts", "sync_jobs", "health_records", "health_record_archives", "daily_health_metrics", "daily_calendar_metrics", "daily_checkins", "journal_variables", "journal_entries", "lab_narratives", "daily_scores", "insights", "correlation_results", "briefs", "coach_threads", "coach_messages", "agent_action_proposals", "workout_programs", "workout_program_exercises", "workout_sessions", "workout_session_sets", "meals", "meal_photos", "meal_feelings", "meal_analyses", "consent_events", "audit_events"];

export async function GET() {
  if (isLocalPreviewMode()) {
    const user = await getCurrentUser();
    const meals = user ? listPreviewMeals(user.id).map(mealToApi) : [];
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), preview: true, profile: previewProfile, dashboard: previewDashboard, meals }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": "attachment; filename=soma-local-preview.json" } });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createCloudflareAdminClient();
  const exported: Record<string, unknown[]> = {};
  for (const table of userTables) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(table).select("*").eq("user_id", user.id).range(from, from + 999);
      if (error) return NextResponse.json({ error: "Export could not be completed." }, { status: 500 });
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    exported[table] = rows;
  }
  const archiveManifests = (exported.health_record_archives ?? []) as Array<{ object_path?: unknown; storage_backend?: unknown; storage_bucket?: unknown }>;
  const archiveDownloads = await Promise.all(archiveManifests.flatMap((manifest) => {
    if (typeof manifest.object_path !== "string") return [];
    if (manifest.storage_backend !== "r2") return [];
    return [Promise.resolve({ path: manifest.object_path, signedUrl: createR2ArchiveDownloadUrl(manifest.object_path) })];
  })).catch(() => null);
  if (!archiveDownloads) return NextResponse.json({ error: "Archived health records could not be added to the export." }, { status: 500 });
  const mealPhotoDownloads = ((exported.meal_photos ?? []) as Array<{ id?: unknown; meal_id?: unknown }>).flatMap((photo) =>
    typeof photo.id === "string" && typeof photo.meal_id === "string"
      ? [{ mealId: photo.meal_id, photoId: photo.id, path: `/api/meals/${encodeURIComponent(photo.meal_id)}/photos/${encodeURIComponent(photo.id)}` }]
      : [],
  );
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email }, data: exported, archiveDownloads, mealPhotoDownloads }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename=soma-export-${new Date().toISOString().slice(0, 10)}.json`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

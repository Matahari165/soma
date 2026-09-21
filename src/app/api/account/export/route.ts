import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { previewDashboard, previewProfile } from "@/lib/local-preview";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { createR2ArchiveDownloadUrl } from "@/lib/r2";
import { listPreviewMeals } from "@/services/meal-preview";
import { mealToApi } from "@/services/meal-api";
import { sanitizeExportRows } from "./sanitize";

const userTables = ["profiles", "health_goals", "sleep_preferences", "dashboard_layouts", "nutrition_targets", "sync_jobs", "health_records", "health_record_archives", "daily_health_metrics", "daily_calendar_metrics", "daily_checkins", "journal_variables", "journal_entries", "journal_days", "journal_imports", "lab_narratives", "daily_scores", "insights", "correlation_results", "briefs", "workout_programs", "workout_program_exercises", "workout_sessions", "workout_session_sets", "meals", "meal_photos", "meal_feelings", "meal_analyses", "assistant_conversations", "assistant_messages", "assistant_runs", "assistant_tool_calls", "assistant_memories", "assistant_goal_sets", "assistant_goals", "assistant_plans", "assistant_plan_versions", "assistant_attachments", "assistant_actions", "assistant_action_events", "consent_events", "audit_events"];

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
    exported[table] = sanitizeExportRows(table, rows);
  }
  const archiveManifests = (exported.health_record_archives ?? []) as Array<{ object_path?: unknown; storage_backend?: unknown; storage_bucket?: unknown }>;
  const archiveDownloads = await Promise.all(archiveManifests.flatMap((manifest) => {
    if (typeof manifest.object_path !== "string") return [];
    if (manifest.storage_backend !== "r2") return [];
    return [Promise.resolve({ path: manifest.object_path, signedUrl: createR2ArchiveDownloadUrl(manifest.object_path) })];
  })).catch(() => null);
  if (!archiveDownloads) return NextResponse.json({ error: "Archived health records could not be added to the export." }, { status: 500 });
  const confirmedMealIds = new Set(((exported.meals ?? []) as Array<{ id?: unknown; status?: unknown }>).flatMap((meal) => meal.status === "confirmed" && typeof meal.id === "string" ? [meal.id] : []));
  const mealPhotoDownloads = ((exported.meal_photos ?? []) as Array<{ id?: unknown; meal_id?: unknown; storage_status?: unknown }>).flatMap((photo) =>
    typeof photo.id === "string" && typeof photo.meal_id === "string" && !confirmedMealIds.has(photo.meal_id) && photo.storage_status !== "purged" && photo.storage_status !== "purge_pending"
      ? [{ mealId: photo.meal_id, photoId: photo.id, path: `/api/meals/${encodeURIComponent(photo.meal_id)}/photos/${encodeURIComponent(photo.id)}` }]
      : [],
  );
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email }, data: exported, archiveDownloads, mealPhotoDownloads }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename=soma-export-${new Date().toISOString().slice(0, 10)}.json`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

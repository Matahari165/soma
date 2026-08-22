import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { previewDashboard, previewProfile } from "@/lib/local-preview";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const userTables = ["profiles", "health_goals", "sleep_preferences", "dashboard_layouts", "sync_jobs", "health_records", "daily_health_metrics", "daily_calendar_metrics", "daily_checkins", "journal_variables", "journal_entries", "lab_narratives", "daily_scores", "insights", "correlation_results", "briefs", "coach_threads", "coach_messages", "agent_action_proposals", "workout_programs", "workout_program_exercises", "workout_sessions", "workout_session_sets", "consent_events", "audit_events"];

export async function GET() {
  if (isLocalPreviewMode()) return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), preview: true, profile: previewProfile, dashboard: previewDashboard }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": "attachment; filename=soma-local-preview.json" } });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
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
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email }, data: exported }, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename=soma-export-${new Date().toISOString().slice(0, 10)}.json`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

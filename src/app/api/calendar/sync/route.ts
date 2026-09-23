import { NextResponse } from "next/server";

import { syncGoogleCalendar } from "@/integrations/google-calendar/sync";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";

export const maxDuration = 30;

export async function POST() {
  if (isLocalPreviewMode()) return NextResponse.json({ days: 120, events: 218, deepWorkEvents: 54, preview: true, syncedAt: new Date().toISOString() });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json(await syncGoogleCalendar(user.id));
  } catch (error) {
    console.error("[api/calendar/sync] update failed", { reason: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Google Calendar could not be updated." }, { status: 502 });
  }
}

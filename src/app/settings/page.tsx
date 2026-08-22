import type { Metadata } from "next";

import type { CalendarConnectionNotice } from "@/components/calendar-connection-card";
import { SettingsConsole } from "@/components/settings-console";
import { getGoogleHealthNotice } from "@/integrations/google-health/status";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ health?: string | string[]; calendar?: string | string[] }> }) {
  const params = await searchParams;
  const healthStatus = Array.isArray(params.health) ? params.health[0] : params.health;
  const calendarStatus = Array.isArray(params.calendar) ? params.calendar[0] : params.calendar;
  const calendarNotices: Record<string, CalendarConnectionNotice> = {
    connected: { message: "Google Calendar connected and aggregated.", tone: "success" },
    connected_sync_failed: { message: "Google Calendar connected, but its first aggregation needs to be retried.", tone: "error" },
    permission_denied: { message: "Calendar access was not granted.", tone: "error" },
    invalid_state: { message: "The Calendar connection expired before it completed. Try again.", tone: "error" },
    unavailable: { message: "Google Calendar is not configured yet.", tone: "error" },
    connection_failed: { message: "Google Calendar could not be connected.", tone: "error" },
  };
  return <SettingsConsole initialHealthNotice={getGoogleHealthNotice(healthStatus)} initialCalendarNotice={calendarStatus ? calendarNotices[calendarStatus] ?? null : null} />;
}

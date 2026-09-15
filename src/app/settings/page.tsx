import type { Metadata } from "next";

import type { CalendarConnectionNotice } from "@/components/calendar-connection-card";
import { SettingsConsole } from "@/components/settings-console";
import { getGoogleHealthNotice } from "@/integrations/google-health/status";

export const metadata: Metadata = { title: { absolute: "Réglages — Soma" } };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ health?: string | string[]; calendar?: string | string[] }> }) {
  const params = await searchParams;
  const healthStatus = Array.isArray(params.health) ? params.health[0] : params.health;
  const calendarStatus = Array.isArray(params.calendar) ? params.calendar[0] : params.calendar;
  const calendarNotices: Record<string, CalendarConnectionNotice> = {
    connected: { message: "Google Calendar est connecté et agrégé.", tone: "success" },
    connected_sync_failed: { message: "Google Calendar est connecté, mais son premier agrégat doit être relancé.", tone: "error" },
    permission_denied: { message: "L’accès au calendrier n’a pas été accordé.", tone: "error" },
    invalid_state: { message: "La connexion au calendrier a expiré avant de se terminer. Réessayez.", tone: "error" },
    unavailable: { message: "Google Calendar n’est pas encore configuré.", tone: "error" },
    connection_failed: { message: "Google Calendar n’a pas pu être connecté.", tone: "error" },
  };
  return <SettingsConsole initialHealthNotice={getGoogleHealthNotice(healthStatus)} initialCalendarNotice={calendarStatus ? calendarNotices[calendarStatus] ?? null : null} />;
}

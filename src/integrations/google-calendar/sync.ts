import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { aggregateCalendarEvents } from "./aggregate";
import { GoogleCalendarRequestError, listPrimaryCalendarEvents, refreshGoogleCalendarToken } from "./client";

type CalendarConnection = {
  id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
};

async function accessToken(connection: CalendarConnection) {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) return decryptSecret(connection.access_token_ciphertext);
  if (!connection.refresh_token_ciphertext) throw new Error("Google Calendar refresh token is missing.");
  const tokens = await refreshGoogleCalendarToken(decryptSecret(connection.refresh_token_ciphertext));
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("provider_connections").update({
    access_token_ciphertext: encryptSecret(tokens.access_token),
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    status: "connected",
    last_error_code: null,
  }).eq("id", connection.id);
  if (error) throw new Error("Refreshed Google Calendar token could not be stored.");
  return tokens.access_token;
}

function datesBetween(start: Date, end: Date) {
  const dates: string[] = [];
  const cursor = new Date(start);
  cursor.setUTCHours(12, 0, 0, 0);
  while (cursor < end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export async function syncGoogleCalendar(userId: string, days = 120) {
  const admin = createSupabaseAdminClient();
  const [{ data: connection, error: connectionError }, { data: profile, error: profileError }] = await Promise.all([
    admin.from("provider_connections").select("id,access_token_ciphertext,refresh_token_ciphertext,token_expires_at").eq("user_id", userId).eq("provider", "google_calendar").maybeSingle(),
    admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);
  if (connectionError || !connection) throw new Error("Google Calendar connection was not found.");
  if (profileError) throw new Error("Calendar timezone could not be loaded.");
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  try {
    const events = await listPrimaryCalendarEvents({ accessToken: await accessToken(connection as CalendarConnection), start, end, timeZone: profile?.timezone ?? "Europe/Paris" });
    const aggregates = new Map(aggregateCalendarEvents(events, profile?.timezone ?? "Europe/Paris").map((row) => [row.metric_date, row]));
    const syncedAt = new Date().toISOString();
    const rows = datesBetween(start, end).map((date) => ({
      user_id: userId,
      ...(aggregates.get(date) ?? { metric_date: date, deep_work_minutes: 0, deep_work_event_count: 0, total_scheduled_minutes: 0, source_event_count: 0 }),
      synced_at: syncedAt,
    }));
    const { error } = await admin.from("daily_calendar_metrics").upsert(rows, { onConflict: "user_id,metric_date" });
    if (error) throw new Error("Calendar aggregates could not be stored.");
    await admin.from("provider_connections").update({ last_synced_at: syncedAt, status: "connected", last_error_code: null }).eq("id", connection.id);
    return { days: rows.length, events: events.length, deepWorkEvents: rows.reduce((sum, row) => sum + row.deep_work_event_count, 0), syncedAt };
  } catch (error) {
    const expired = error instanceof GoogleCalendarRequestError && error.status === 401;
    await admin.from("provider_connections").update({ status: expired ? "expired" : "error", last_error_code: expired ? "GOOGLE_CALENDAR_AUTH_EXPIRED" : "GOOGLE_CALENDAR_SYNC_FAILED" }).eq("id", connection.id);
    throw error;
  }
}

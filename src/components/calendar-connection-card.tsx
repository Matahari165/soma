"use client";

import { AlertCircle, CalendarDays, ExternalLink, LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { useEffect, useState } from "react";

type CalendarConnection = { status: string; last_synced_at?: string | null };
export type CalendarConnectionNotice = { message: string; tone: "success" | "error" };

export function CalendarConnectionCard({ initialNotice = null }: { initialNotice?: CalendarConnectionNotice | null }) {
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"sync" | "disconnect" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(initialNotice?.tone === "success" ? initialNotice.message : null);
  const [error, setError] = useState<string | null>(initialNotice?.tone === "error" ? initialNotice.message : null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/calendar/connection", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Calendar status is unavailable.")))
      .then((result) => setConnection(result.connection ?? null))
      .catch((loadError) => { if (loadError instanceof Error && loadError.name !== "AbortError") setError(loadError.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function sync() {
    setBusy("sync");
    setMessage(null);
    try {
      const response = await fetch("/api/calendar/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Calendar could not be updated.");
      setConnection((current) => current ? { ...current, status: "connected", last_synced_at: result.syncedAt } : current);
      setMessage(`Calendar updated · ${result.deepWorkEvents} Deep Work blocks found.`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Calendar could not be updated.");
    } finally { setBusy(null); }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      const response = await fetch("/api/calendar/connection", { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Calendar could not be disconnected.");
      setConnection(null);
      setConfirming(false);
      setMessage("Google Calendar disconnected. Existing daily totals remain until account deletion.");
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Calendar could not be disconnected.");
    } finally { setBusy(null); }
  }

  if (loading) return <article className="connection-card" aria-busy="true"><span className="connection-logo"><LoaderCircle className="spin" size={19} /></span><div><strong>Google Calendar</strong><p>Checking connection…</p></div></article>;
  return <>
    <article className="connection-card">
      <span className="connection-logo" aria-hidden="true"><CalendarDays size={19} /></span>
      <div><strong>Google Calendar</strong><p>{connection ? `${connection.status === "connected" ? "Connected" : "Needs attention"} · Last aggregate ${connection.last_synced_at ? new Date(connection.last_synced_at).toLocaleString("en-US") : "pending"}` : "Not connected · Primary calendar only"}</p></div>
      {connection ? <div className="connection-actions"><button className="sync-now-button" disabled={Boolean(busy)} onClick={() => void sync()} type="button">{busy === "sync" ? <LoaderCircle className="spin" /> : <RefreshCw />}Sync now</button><button disabled={Boolean(busy)} onClick={() => setConfirming(true)} type="button"><Unplug />Disconnect</button></div> : <a href="/api/calendar/google/connect">Connect <ExternalLink /></a>}
    </article>
    <p className="calendar-privacy-note">Read-only · primary calendar · stores daily durations only · recognizes titles marked “DW” or “Deep Work”.</p>
    {message && <p className="settings-message settings-message--success settings-message--inline" role="status">{message}</p>}
    {error && <p className="form-error" role="alert"><AlertCircle size={14} />{error}</p>}
    {confirming && <div className="inline-confirmation" role="alert"><div><strong>Disconnect Google Calendar?</strong><p>Daily aggregates already calculated remain in Soma.</p></div><div><button className="secondary-button" type="button" onClick={() => setConfirming(false)}>Cancel</button><button className="danger-button" disabled={busy === "disconnect"} onClick={() => void disconnect()} type="button">{busy === "disconnect" ? "Disconnecting…" : "Disconnect"}</button></div></div>}
  </>;
}

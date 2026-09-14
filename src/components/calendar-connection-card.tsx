"use client";

import { AlertCircle, CalendarDays, ExternalLink, LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { useEffect, useState } from "react";

import { formatDateTime, formatNumber } from "@/lib/locale";

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
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("L’état du calendrier est indisponible.")))
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
      if (!response.ok) throw new Error(result.error ?? "Le calendrier n’a pas pu être mis à jour.");
      setConnection((current) => current ? { ...current, status: "connected", last_synced_at: result.syncedAt } : current);
      setMessage(`Calendrier mis à jour · ${formatNumber(result.deepWorkEvents)} bloc${result.deepWorkEvents === 1 ? "" : "s"} Deep Work trouvé${result.deepWorkEvents === 1 ? "" : "s"}.`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Le calendrier n’a pas pu être mis à jour.");
    } finally { setBusy(null); }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      const response = await fetch("/api/calendar/connection", { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Le calendrier n’a pas pu être déconnecté.");
      setConnection(null);
      setConfirming(false);
      setMessage("Google Calendar est déconnecté. Les totaux journaliers existants restent disponibles jusqu’à la suppression du compte.");
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Le calendrier n’a pas pu être déconnecté.");
    } finally { setBusy(null); }
  }

  if (loading) return <article className="connection-card" aria-busy="true"><span className="connection-logo"><LoaderCircle className="spin" size={19} /></span><div><strong>Google Calendar</strong><p>Vérification de la connexion…</p></div></article>;
  return <>
    <article className="connection-card">
      <span className="connection-logo" aria-hidden="true"><CalendarDays size={19} /></span>
      <div><strong>Google Calendar</strong><p>{connection ? `${connection.status === "connected" ? "Connecté" : "Attention requise"} · Dernier agrégat : ${connection.last_synced_at ? formatDateTime(connection.last_synced_at) : "en attente"}` : "Non connecté · calendrier principal uniquement"}</p></div>
      {connection ? <div className="connection-actions"><button className="sync-now-button" disabled={Boolean(busy)} onClick={() => void sync()} type="button">{busy === "sync" ? <LoaderCircle className="spin" /> : <RefreshCw />}Synchroniser</button><button disabled={Boolean(busy)} onClick={() => setConfirming(true)} type="button"><Unplug />Déconnecter</button></div> : <a href="/api/calendar/google/connect">Connecter <ExternalLink /></a>}
    </article>
    <p className="calendar-privacy-note">Lecture seule · calendrier principal · seules les durées quotidiennes sont conservées · les titres marqués « DW » ou « Deep Work » sont reconnus.</p>
    {message && <p className="settings-message settings-message--success settings-message--inline" role="status">{message}</p>}
    {error && <p className="form-error" role="alert"><AlertCircle size={14} />{error}</p>}
    {confirming && <div className="inline-confirmation" role="alert"><div><strong>Déconnecter Google Calendar ?</strong><p>Les agrégats quotidiens déjà calculés restent dans Soma.</p></div><div><button className="secondary-button" type="button" onClick={() => setConfirming(false)}>Annuler</button><button className="danger-button" disabled={busy === "disconnect"} onClick={() => void disconnect()} type="button">{busy === "disconnect" ? "Déconnexion…" : "Déconnecter"}</button></div></div>}
  </>;
}

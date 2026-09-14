"use client";

import { AlertCircle, Check, Clock3, Database, Download, ExternalLink, HeartPulse, LoaderCircle, LogOut, RefreshCw, RotateCcw, Save, Shield, Trash2, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CalendarConnectionCard, type CalendarConnectionNotice } from "@/components/calendar-connection-card";
import { HealthDataCoverageIndicator } from "@/components/health-data-coverage";
import type { GoogleHealthNotice } from "@/integrations/google-health/status";
import type { SyncStatus } from "@/domain/health";
import type { HealthDataCoverage } from "@/domain/health/data-coverage";
import { formatDateTime, formatNumber } from "@/lib/locale";

type Profile = { displayName: string; dateOfBirth: string; heightCm: number; weightKg: number; primaryGoal: string; baseSleepTargetMinutes: number; usualWakeTime: string; importRange: "90_days" | "all_history" };
type SyncJob = { id: string; status: string; progress: number; error_message: string | null; completed_at: string | null; created_at: string };
type SyncState = { status: SyncStatus; connection?: { lastSyncedAt?: string | null }; jobs?: SyncJob[]; importedRecords?: Record<string, number>; analytics?: { datedRecords: number; metricDays: number; scoreRows: number }; coverage?: HealthDataCoverage; coverageError?: boolean };
type Connection = { status: string; scopes?: string[]; last_synced_at?: string | null; last_lab_synced_at?: string | null; metadata?: { consent_complete?: boolean } };
type SettingsTab = "profile" | "connections" | "privacy";
const tabOrder: SettingsTab[] = ["profile", "connections", "privacy"];
const goals = { build_muscle: "Développer la masse musculaire", improve_endurance: "Améliorer l’endurance", improve_cardio: "Améliorer le cardio", general_fitness: "Forme générale", maintain_health: "Maintenir la santé", other: "Autre" };

export function SettingsConsole({ initialHealthNotice = null, initialCalendarNotice = null }: { initialHealthNotice?: GoogleHealthNotice | null; initialCalendarNotice?: CalendarConnectionNotice | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<SettingsTab>(initialHealthNotice || initialCalendarNotice ? "connections" : "profile");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(initialHealthNotice?.message ?? null);
  const [messageTone, setMessageTone] = useState<GoogleHealthNotice["tone"]>(initialHealthNotice?.tone ?? "neutral");
  const syncPhase = syncState?.status.phase;

  function showMessage(nextMessage: string | null, tone: GoogleHealthNotice["tone"] = "neutral") {
    setMessage(nextMessage);
    setMessageTone(tone);
  }

  useEffect(() => {
    const controller = new AbortController();
    const profileRequest = fetch("/api/profile", { signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Votre profil n’a pas pu être chargé.")));
    const connectionRequest = fetch("/api/health/connection", { signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Votre connexion de santé n’a pas pu être chargée.")));
    Promise.allSettled([
      profileRequest,
      connectionRequest,
    ]).then(([profileResult, connectionResult]) => {
      if (profileResult.status === "fulfilled") {
        setProfile(profileResult.value);
        setSavedProfile(profileResult.value);
      } else if (profileResult.reason instanceof Error && profileResult.reason.name !== "AbortError") setLoadError(profileResult.reason.message);
      if (connectionResult.status === "fulfilled") setConnection(connectionResult.value.connection ?? null);
      else if (connectionResult.reason instanceof Error && connectionResult.reason.name !== "AbortError") setConnectionError(connectionResult.reason.message);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [retryVersion]);

  useEffect(() => {
    if (tab !== "connections" || !connection) return;
    const controller = new AbortController();
    const active = Boolean(syncPhase && ["queued", "fetching", "materializing", "retrying"].includes(syncPhase));
    const loadSync = (details = false) => fetch(`/api/health/sync${details ? "?details=1" : ""}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("L’état de la synchronisation est temporairement indisponible.")))
      .then((state: SyncState) => {
        setSyncState((current) => ({
          ...(current ?? state),
          ...state,
          importedRecords: state.importedRecords ?? current?.importedRecords,
          analytics: state.analytics ?? current?.analytics,
          coverage: state.coverage ?? current?.coverage,
          coverageError: state.coverage ? false : state.coverageError ?? current?.coverageError,
        }));
        const lastSyncedAt = state.connection?.lastSyncedAt;
        if (active && lastSyncedAt) setConnection((current) => current?.last_synced_at === lastSyncedAt ? current : current ? { ...current, last_synced_at: lastSyncedAt } : current);
        setSyncError(null);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setSyncError(error.message); });
    void loadSync(true);
    const interval = active ? window.setInterval(() => void loadSync(diagnosticsOpen), 3000) : null;
    return () => { controller.abort(); if (interval) window.clearInterval(interval); };
  }, [connection, diagnosticsOpen, syncPhase, tab]);

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => current ? { ...current, [key]: value } : current);
    showMessage(null);
  }

  function selectTab(nextTab: SettingsTab) {
    setTab(nextTab);
    showMessage(null);
    setDisconnectConfirm(false);
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentTab: SettingsTab) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const currentIndex = tabOrder.indexOf(currentTab);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabOrder.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabOrder.length) % tabOrder.length;
    const nextTab = tabOrder[nextIndex];
    selectTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`${nextTab}-tab`)?.focus());
  }

  const profileValid = Boolean(profile && profile.displayName.trim() && profile.displayName.length <= 80 && profile.dateOfBirth && Number.isFinite(profile.heightCm) && profile.heightCm >= 50 && profile.heightCm <= 260 && Number.isFinite(profile.weightKg) && profile.weightKg >= 20 && profile.weightKg <= 400 && /^([01]\d|2[0-3]):[0-5]\d$/.test(profile.usualWakeTime));
  const profileDirty = Boolean(profile && savedProfile && JSON.stringify(profile) !== JSON.stringify(savedProfile));
  const partialAccess = Boolean(connection && (connection.metadata?.consent_complete === false || (connection.scopes?.length ?? 0) < 3));

  async function save() {
    if (!profile || !profileValid || !profileDirty || busyAction) return;
    setBusyAction("save");
    showMessage(null);
    try {
      const response = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Votre profil n’a pas pu être enregistré.");
      setSavedProfile(profile);
      showMessage("Modifications du profil enregistrées.", "success");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Votre profil n’a pas pu être enregistré.", "error");
    } finally { setBusyAction(null); }
  }

  async function sync() {
    if (busyAction) return;
    setBusyAction("sync");
    showMessage("Synchronisation de Google Health…");
    try {
      const response = await fetch("/api/health/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "La synchronisation n’a pas pu démarrer.");
      if (result.status) setSyncState((current) => ({ ...(current ?? {}), status: result.status } as SyncState));
      showMessage(result.message ?? "L’import Google Health continue en arrière-plan.", "success");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "La synchronisation n’a pas pu démarrer.", "error");
    } finally { setBusyAction(null); }
  }

  async function disconnect() {
    if (busyAction) return;
    setBusyAction("disconnect");
    try {
      const response = await fetch("/api/health/connection", { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Google Health n’a pas pu être déconnecté.");
      setConnection(null);
      setDisconnectConfirm(false);
      showMessage("Google Health est déconnecté. Les données importées restent disponibles dans Soma.", "success");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Google Health n’a pas pu être déconnecté.", "error");
    } finally { setBusyAction(null); }
  }

  async function deleteAccount() {
    if (deleteText !== "DELETE MY SOMA DATA" || busyAction) return;
    setBusyAction("delete");
    showMessage(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: deleteText }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Votre compte n’a pas pu être supprimé.");
      window.localStorage.clear();
      router.push("/login?deleted=1");
      router.refresh();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Votre compte n’a pas pu être supprimé.", "error");
      setBusyAction(null);
    }
  }

  async function signOut() {
    if (busyAction) return;
    setBusyAction("signout");
    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) throw new Error("La déconnexion a échoué.");
      router.push("/login");
      router.refresh();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "La déconnexion a échoué.", "error");
      setBusyAction(null);
    }
  }

  if (loading) return <div className="workout-loading" id="main-page-content" role="status"><LoaderCircle className="spin" />Chargement des réglages…</div>;
  if (loadError || !profile) return <div className="settings-page" id="main-page-content"><div className="load-error" role="alert"><AlertCircle /><h1>Les réglages n’ont pas pu être chargés</h1><p>{loadError ?? "Votre profil est indisponible."}</p><button className="secondary-button" type="button" onClick={() => { setLoading(true); setLoadError(null); setRetryVersion((current) => current + 1); }}><RotateCcw size={16} />Réessayer</button></div></div>;

  return <div className="settings-page" id="main-page-content"><header><h1>Réglages</h1></header><div className="settings-layout"><nav role="tablist" aria-label="Sections des réglages"><button id="profile-tab" role="tab" tabIndex={tab === "profile" ? 0 : -1} aria-selected={tab === "profile"} aria-controls="settings-panel" className={tab === "profile" ? "is-active" : ""} onKeyDown={(event) => handleTabKeyDown(event, "profile")} onClick={() => selectTab("profile")} type="button">Profil et objectifs</button><button id="connections-tab" role="tab" tabIndex={tab === "connections" ? 0 : -1} aria-selected={tab === "connections"} aria-controls="settings-panel" className={tab === "connections" ? "is-active" : ""} onKeyDown={(event) => handleTabKeyDown(event, "connections")} onClick={() => selectTab("connections")} type="button">Connexions</button><button id="privacy-tab" role="tab" tabIndex={tab === "privacy" ? 0 : -1} aria-selected={tab === "privacy"} aria-controls="settings-panel" className={tab === "privacy" ? "is-active" : ""} onKeyDown={(event) => handleTabKeyDown(event, "privacy")} onClick={() => selectTab("privacy")} type="button">Données et confidentialité</button></nav><section id="settings-panel" role="tabpanel" aria-labelledby={`${tab}-tab`} className="settings-content">
   {tab === "profile" && <section className="settings-card"><div><h2>Profil et objectifs</h2><p>Ces valeurs servent à vos estimations personnelles. Google ne les modifie pas automatiquement.</p></div><div className="settings-form"><label>Nom<input required maxLength={80} autoComplete="name" value={profile.displayName} onChange={(event) => update("displayName", event.target.value)} /></label><label>Date de naissance<input required type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" value={profile.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} /></label><label>Taille (cm)<input required min="50" max="260" type="number" value={profile.heightCm} onChange={(event) => update("heightCm", Number(event.target.value))} /></label><label>Poids (kg)<input required min="20" max="400" type="number" step="0.1" value={profile.weightKg} onChange={(event) => update("weightKg", Number(event.target.value))} /></label><label>Objectif principal<select value={profile.primaryGoal} onChange={(event) => update("primaryGoal", event.target.value)}>{Object.entries(goals).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Besoin de sommeil<input value="8 h 30 min (8 h 20–8 h 40)" readOnly /></label><label>Heure habituelle de réveil<input type="time" required value={profile.usualWakeTime} onChange={(event) => update("usualWakeTime", event.target.value)} /></label><label>Import initial<select value={profile.importRange} onChange={(event) => update("importRange", event.target.value as Profile["importRange"])}><option value="90_days">90 derniers jours</option><option value="all_history">Tout l’historique disponible</option></select></label></div>{!profileValid && <p className="form-error" role="alert">Vérifiez votre nom, votre date de naissance, votre taille, votre poids et votre heure de réveil.</p>}<button className="primary-button" onClick={() => void save()} disabled={!profileDirty || !profileValid || Boolean(busyAction)} type="button">{busyAction === "save" ? <LoaderCircle className="spin" /> : message === "Modifications du profil enregistrées." ? <Check /> : <Save />}{busyAction === "save" ? "Enregistrement…" : profileDirty ? "Enregistrer les modifications" : "Aucune modification"}</button></section>}
    {tab === "connections" && <section className="settings-card"><div><h2>Sources du laboratoire personnel</h2><p>La santé décrit votre physiologie. Le calendrier et le journal quotidien apportent le contexte nécessaire pour comprendre ce qui caractérise vos meilleures journées.</p></div>{connectionError && <div className="inline-empty" role="alert"><AlertCircle size={18} /><div><strong>État de la connexion indisponible</strong><p>{connectionError}</p></div></div>}<article className="connection-card"><span className="connection-logo" aria-hidden="true"><HeartPulse size={19} /></span><div><strong>Google Health</strong><p>{connection ? `${partialAccess ? "Accès partiel" : "Connecté"} · Dernier import terminé : ${connection.last_synced_at ? formatDateTime(connection.last_synced_at) : "en attente"}` : "Non connecté"}</p></div>{connection ? <div className="connection-actions"><button className="sync-now-button" disabled={Boolean(busyAction)} onClick={() => void sync()} type="button">{busyAction === "sync" ? <LoaderCircle className="spin" /> : <RefreshCw />}Synchroniser</button>{partialAccess && <a href="/api/health/google/connect">Revoir les autorisations <ExternalLink /></a>}<button disabled={Boolean(busyAction)} onClick={() => setDisconnectConfirm(true)} type="button"><Unplug />Déconnecter</button></div> : <a href="/api/health/google/connect">Connecter <ExternalLink /></a>}</article>{connection && <p className="sync-schedule"><Clock3 aria-hidden="true" />Les métriques du laboratoire sont actualisées toutes les heures. Les flux bruts sont mis à jour au fil des envois de Google.</p>}{connection && <HealthDataCoverageIndicator coverage={syncState?.coverage} phase={syncState?.status.phase} error={syncState?.coverageError} />}{message && <p className={`settings-message settings-message--${messageTone} settings-message--inline`} role={messageTone === "error" ? "alert" : "status"} aria-live="polite">{message}</p>}{syncError && <p className="form-error" role="alert">{syncError}</p>}{connection && syncState && <SyncStatusSummary state={syncState} />}{connection && <details className="sync-advanced" open={diagnosticsOpen} onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)}><summary>Détails avancés</summary>{diagnosticsOpen && syncState ? <SyncDiagnostics state={syncState} /> : null}</details>}{disconnectConfirm && <div className="inline-confirmation" role="alert"><div><strong>Déconnecter Google Health ?</strong><p>Les données importées restent dans Soma jusqu’à la suppression de votre compte.</p></div><div><button className="secondary-button" type="button" onClick={() => setDisconnectConfirm(false)}>Annuler</button><button className="danger-button" disabled={busyAction === "disconnect"} onClick={() => void disconnect()} type="button">{busyAction === "disconnect" ? "Déconnexion…" : "Déconnecter"}</button></div></div>}<div className="scope-note"><Shield /><div><strong>Lecture seule par conception</strong><p>Sommeil, activité et forme, ainsi que métriques de santé. Les jetons OAuth sont chiffrés et ne sont jamais envoyés à votre navigateur.</p></div></div><CalendarConnectionCard initialNotice={initialCalendarNotice} /></section>}
    {tab === "privacy" && <section className="settings-card"><div><h2>Vos données Soma</h2><p>Soma conserve votre historique jusqu’à son exportation ou sa suppression. Les secrets OAuth des fournisseurs sont exclus des exports.</p></div><div className="privacy-actions"><article><Database /><div><strong>Exporter toutes les données</strong><p>Téléchargez le profil, les données de santé, les scores, les analyses et les entraînements au format JSON.</p></div><a href="/api/account/export" download><Download />Exporter le JSON</a></article><article><LogOut /><div><strong>Se déconnecter</strong><p>Fermez cette session du navigateur sans supprimer vos données.</p></div><button disabled={Boolean(busyAction)} onClick={() => void signOut()} type="button">{busyAction === "signout" ? "Déconnexion…" : "Se déconnecter"}</button></article><article className="danger-zone"><Trash2 /><div><strong>Supprimer le compte et toutes les données Soma</strong><p>Cette action est irréversible. Saisissez DELETE MY SOMA DATA pour confirmer.</p><input aria-label="Saisissez DELETE MY SOMA DATA pour confirmer" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="DELETE MY SOMA DATA" autoComplete="off" /></div><button disabled={deleteText !== "DELETE MY SOMA DATA" || Boolean(busyAction)} onClick={() => void deleteAccount()} type="button">{busyAction === "delete" ? "Suppression…" : "Supprimer définitivement"}</button></article></div></section>}
   {message && tab !== "connections" && <p className={`settings-message settings-message--${messageTone}`} role={messageTone === "error" ? "alert" : "status"} aria-live="polite">{message}</p>}
  </section></div></div>;
}

function SyncDiagnostics({ state }: { state: SyncState }) {
  const latest = state.jobs?.[0];
  const labels: Record<string, string> = { sleep: "Sommeil", "daily-heart-rate-variability": "VFC", "daily-resting-heart-rate": "FC au repos", steps: "Pas" };
  const statusLabels: Record<string, string> = { queued: "En attente", running: "En cours", completed: "Terminé", failed: "Échec" };
  const importedRecords = (key: string) => {
    const value = state.importedRecords?.[key];
    return typeof value === "number" && Number.isFinite(value) ? `${formatNumber(value)} enregistrement${value === 1 ? "" : "s"}` : "—";
  };
  return <section className="sync-diagnostics" aria-labelledby="sync-diagnostics-title">
    <div><strong id="sync-diagnostics-title">Diagnostic de l’import</strong><span>{latest ? `${statusLabels[latest.status] ?? latest.status} · ${formatNumber(latest.progress)} %` : "Aucun import démarré"}</span></div>
    {latest && <progress max="100" value={latest.progress} aria-label={`Progression de l’import : ${formatNumber(latest.progress)} %`} />}
    {state.importedRecords && <dl>{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{importedRecords(key)}</dd></div>)}</dl>}
    {state.analytics && <dl><div><dt>Enregistrements datés</dt><dd>{formatNumber(state.analytics.datedRecords)}</dd></div><div><dt>Jours du tableau de bord</dt><dd>{formatNumber(state.analytics.metricDays)}</dd></div><div><dt>Lignes de score</dt><dd>{formatNumber(state.analytics.scoreRows)}</dd></div></dl>}
    {!state.analytics && <p>Chargement des compteurs de diagnostic…</p>}
    {latest?.error_message && <p role="alert">{latest.error_message}</p>}
  </section>;
}

function SyncStatusSummary({ state }: { state: SyncState }) {
  const labels: Record<SyncStatus["phase"], string> = {
    queued: "En attente", fetching: "Récupération des données Google", materializing: "Mise à jour de vos scores", up_to_date: "À jour",
    partial: "À jour avec un accès partiel", retrying: "Nouvelle tentative automatique", needs_reconnect: "Reconnexion requise", failed: "Échec de la mise à jour",
  };
  const active = ["queued", "fetching", "materializing", "retrying"].includes(state.status.phase);
  return <section className={`sync-summary sync-summary--${state.status.phase}`} aria-live="polite"><div><strong>{labels[state.status.phase]}</strong><span>{formatNumber(state.status.progress)} %</span></div>{active && <progress max="100" value={state.status.progress} aria-label={`Mise à jour Google Health : ${formatNumber(state.status.progress)} %`} />}{state.status.lastError && <p>{state.status.lastError}</p>}</section>;
}

"use client";

import { AlertCircle, Check, Clock3, Database, Download, ExternalLink, HeartPulse, LoaderCircle, LogOut, RefreshCw, RotateCcw, Save, Shield, Trash2, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { usePrimaryChartPresentation } from "@/components/dashboard/chart-presentation-preference";
import { PageScrollReveal } from "@/components/page-scroll-reveal";
import { CalendarConnectionCard, type CalendarConnectionNotice } from "@/components/calendar-connection-card";
import { AppleHealthSyncCard } from "@/components/health/apple-health-sync-card";
import { HealthDataCoverageIndicator } from "@/components/health-data-coverage";
import { AiCostCard } from "@/components/settings/ai-cost-card";
import type { GoogleHealthNotice } from "@/integrations/google-health/status";
import type { SyncStatus } from "@/domain/health";
import type { HealthDataCoverage } from "@/domain/health/data-coverage";
import { formatDateTime, formatNumber } from "@/lib/locale";
import styles from "./settings-console.module.css";

type Profile = { displayName: string; dateOfBirth: string; heightCm: number; weightKg: number; primaryGoal: string; primaryGoalDirection?: string; secondaryGoalDirections?: string[]; baseSleepTargetMinutes: number; usualWakeTime: string; importRange: "90_days" | "all_history" };
type SyncJob = { id: string; status: string; progress: number; error_message: string | null; completed_at: string | null; created_at: string };
type SyncState = { status: SyncStatus; connection?: { lastSyncedAt?: string | null }; jobs?: SyncJob[]; importedRecords?: Record<string, number>; analytics?: { datedRecords: number; metricDays: number; scoreRows: number }; coverage?: HealthDataCoverage; coverageError?: boolean };
type Connection = { status: string; last_error_code?: string | null; scopes?: string[]; last_synced_at?: string | null; last_lab_synced_at?: string | null; metadata?: { consent_complete?: boolean } };
type SettingsTab = "profile" | "display" | "connections" | "privacy";
const tabOrder: SettingsTab[] = ["profile", "display", "connections", "privacy"];
const tabToSlug: Record<SettingsTab, string> = { profile: "profile", display: "display", connections: "connections", privacy: "privacy" };
const slugToTab: Record<string, SettingsTab> = {
  profile: "profile",
  display: "display",
  connections: "connections",
  privacy: "privacy",
  profil: "profile",
  connexions: "connections",
  donnees: "privacy",
};
const goals = { build_muscle: "Build muscle", improve_endurance: "Improve endurance", improve_cardio: "Improve cardio", general_fitness: "General fitness", maintain_health: "Maintain health", other: "Other" };

export function SettingsConsole({ initialHealthNotice = null, initialCalendarNotice = null }: { initialHealthNotice?: GoogleHealthNotice | null; initialCalendarNotice?: CalendarConnectionNotice | null }) {
  const router = useRouter();
  const { primaryChartPresentation, setPrimaryChartPresentation } = usePrimaryChartPresentation();
  const [tab, setTab] = useState<SettingsTab>(() => {
    if (typeof window !== "undefined") {
      const requested = new URLSearchParams(window.location.search).get("tab");
      if (requested && slugToTab[requested]) return slugToTab[requested];
    }
    return initialHealthNotice || initialCalendarNotice ? "connections" : "profile";
  });
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
  const [exportError, setExportError] = useState<string | null>(null);
  const [syncRetryVersion, setSyncRetryVersion] = useState(0);
  const disconnectButtonRef = useRef<HTMLButtonElement>(null);
  const disconnectCancelRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [message, setMessage] = useState<string | null>(initialHealthNotice?.message ?? null);
  const [messageTone, setMessageTone] = useState<GoogleHealthNotice["tone"]>(initialHealthNotice?.tone ?? "neutral");
  const syncPhase = syncState?.status.phase;

  function showMessage(nextMessage: string | null, tone: GoogleHealthNotice["tone"] = "neutral") {
    setMessage(nextMessage);
    setMessageTone(tone);
  }

  useEffect(() => {
    const controller = new AbortController();
    const profileRequest = fetch("/api/profile", { signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Your profile could not be loaded.")));
    const connectionRequest = fetch("/api/health/connection", { signal: controller.signal }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Your health connection could not be loaded.")));
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
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Sync state is temporarily unavailable.")))
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
  }, [connection, diagnosticsOpen, syncPhase, syncRetryVersion, tab]);

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => current ? { ...current, [key]: value } : current);
    showMessage(null);
  }

  function selectTab(nextTab: SettingsTab, options?: { focusPanel?: boolean }) {
    setTab(nextTab);
    setDisconnectConfirm(false);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("tab", tabToSlug[nextTab]);
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
    if (options?.focusPanel) window.requestAnimationFrame(() => panelRef.current?.focus());
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

  useEffect(() => {
    if (!disconnectConfirm) return;
    disconnectCancelRef.current?.focus();
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDisconnectConfirm(false);
        disconnectButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [disconnectConfirm]);

  const profileValid = Boolean(profile && profile.displayName.trim() && profile.displayName.length <= 80 && profile.dateOfBirth && Number.isFinite(profile.heightCm) && profile.heightCm >= 50 && profile.heightCm <= 260 && Number.isFinite(profile.weightKg) && profile.weightKg >= 20 && profile.weightKg <= 400 && Number.isInteger(profile.baseSleepTargetMinutes) && profile.baseSleepTargetMinutes >= 240 && profile.baseSleepTargetMinutes <= 720 && /^([01]\d|2[0-3]):[0-5]\d$/.test(profile.usualWakeTime));
  const profileDirty = Boolean(profile && savedProfile && JSON.stringify(profile) !== JSON.stringify(savedProfile));
  const partialAccess = Boolean(connection && (connection.metadata?.consent_complete === false || (connection.scopes?.length ?? 0) < 3));
  const requiresReconnection = Boolean(connection && (connection.status === "expired" || connection.last_error_code === "GOOGLE_HEALTH_AUTH_EXPIRED"));

  async function save() {
    if (!profile || !profileValid || !profileDirty || busyAction) return;
    setBusyAction("save");
    showMessage(null);
    try {
      const response = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your profile could not be saved.");
      setSavedProfile(profile);
      showMessage("Profile changes saved.", "success");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Your profile could not be saved.", "error");
    } finally { setBusyAction(null); }
  }

  function cancelProfileEdits() {
    if (!savedProfile || busyAction) return;
    setProfile(savedProfile);
    showMessage("Changes discarded.", "neutral");
  }

  async function exportData() {
    if (busyAction) return;
    setBusyAction("export");
    setExportError(null);
    showMessage("Preparing data export…");
    try {
      const response = await fetch("/api/account/export");
      if (!response.ok) throw new Error("Data export could not be prepared.");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `soma-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      showMessage("Data export downloaded as JSON.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Data export could not be prepared.";
      setExportError(message);
      showMessage(message, "error");
    } finally { setBusyAction(null); }
  }

  async function sync() {
    if (busyAction) return;
    setBusyAction("sync");
    showMessage("Syncing Google Health…");
    try {
      const response = await fetch("/api/health/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Sync could not start.");
      if (result.status) setSyncState((current) => ({ ...(current ?? {}), status: result.status } as SyncState));
      showMessage(result.message ?? "Google Health import continues in the background.", "success");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Sync could not start.", "error");
    } finally { setBusyAction(null); }
  }

  async function disconnect() {
    if (busyAction) return;
    setBusyAction("disconnect");
    try {
      const response = await fetch("/api/health/connection", { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Google Health could not be disconnected.");
      setConnection(null);
      setDisconnectConfirm(false);
      showMessage("Google Health disconnected. Imported data remains available in Soma.", "success");
      window.requestAnimationFrame(() => panelRef.current?.focus());
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Google Health could not be disconnected.", "error");
    } finally { setBusyAction(null); }
  }

  async function deleteAccount() {
    if (deleteText !== "DELETE MY SOMA DATA" || busyAction) return;
    setBusyAction("delete");
    showMessage(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: deleteText }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Your account could not be deleted.");
      window.localStorage.clear();
      router.push("/login?deleted=1");
      router.refresh();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Your account could not be deleted.", "error");
      setBusyAction(null);
    }
  }

  async function signOut() {
    if (busyAction) return;
    setBusyAction("signout");
    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed.");
      router.push("/login");
      router.refresh();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Sign out failed.", "error");
      setBusyAction(null);
    }
  }

  if (loading) return <main className={`settings-page ${styles.page}`} id="main-page-content" role="status" aria-busy="true" aria-live="polite" aria-label="Loading settings"><header><h1>Settings</h1><p>Loading settings…</p></header><div className="settings-layout" aria-hidden="true"><div className="settings-card"><div className="system-loading__panel" /><div className="system-loading__panel" /><div className="system-loading__panel system-loading__panel--wide" /></div></div><span className="sr-only">Loading…</span></main>;
  if (loadError || !profile) return <main className={`settings-page ${styles.page}`} id="main-page-content"><div className="load-error" role="alert"><AlertCircle /><h1>Settings could not be loaded</h1><p>{loadError ?? "Your profile is unavailable."}</p><button className="secondary-button" type="button" onClick={() => { setLoading(true); setLoadError(null); setRetryVersion((current) => current + 1); }}><RotateCcw size={16} />Retry</button></div></main>;

  return <main className={`settings-page ${styles.page}`} id="main-page-content" data-scroll-reveal-root><PageScrollReveal /><header><h1>Settings</h1></header><div className="settings-layout"><nav role="tablist" aria-label="Settings sections"><button id="profile-tab" role="tab" tabIndex={tab === "profile" ? 0 : -1} aria-selected={tab === "profile"} aria-controls="settings-panel" className={tab === "profile" ? "is-active" : ""} onKeyDown={(event) => handleTabKeyDown(event, "profile")} onClick={() => selectTab("profile", { focusPanel: true })} type="button">Profile &amp; Goals</button><button id="display-tab" role="tab" tabIndex={tab === "display" ? 0 : -1} aria-selected={tab === "display"} aria-controls="settings-panel" className={tab === "display" ? "is-active" : ""} onKeyDown={(event) => handleTabKeyDown(event, "display")} onClick={() => selectTab("display", { focusPanel: true })} type="button">Display</button><button id="connections-tab" role="tab" tabIndex={tab === "connections" ? 0 : -1} aria-selected={tab === "connections"} aria-controls="settings-panel" className={tab === "connections" ? "is-active" : ""} onKeyDown={(event) => handleTabKeyDown(event, "connections")} onClick={() => selectTab("connections", { focusPanel: true })} type="button">Connections</button><button id="privacy-tab" role="tab" tabIndex={tab === "privacy" ? 0 : -1} aria-selected={tab === "privacy"} aria-controls="settings-panel" className={tab === "privacy" ? "is-active" : ""} onKeyDown={(event) => handleTabKeyDown(event, "privacy")} onClick={() => selectTab("privacy", { focusPanel: true })} type="button">Data &amp; Privacy</button></nav><section id="settings-panel" ref={panelRef} tabIndex={-1} role="tabpanel" aria-labelledby={`${tab}-tab`} className="settings-content">
   {tab === "profile" && <section className="settings-card"><div><h2>Profile &amp; Goals</h2><p>These values drive your personalized estimates. Wearable integrations will not overwrite them.</p></div><div className="settings-form"><label>Display name<input required maxLength={80} autoComplete="name" value={profile.displayName} onChange={(event) => update("displayName", event.target.value)} /></label><label>Date of birth<input required type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" value={profile.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} /></label><label>Height (cm)<input required min="50" max="260" type="number" value={profile.heightCm} onChange={(event) => update("heightCm", Number(event.target.value))} /></label><label>Weight (kg)<input required min="20" max="400" type="number" step="0.1" value={profile.weightKg} onChange={(event) => update("weightKg", Number(event.target.value))} /></label><div><span>Primary goal</span><p>{profile.primaryGoalDirection || goals[profile.primaryGoal as keyof typeof goals] || "Not defined"}</p>{Boolean(profile.secondaryGoalDirections?.length) && <p>Secondary: {profile.secondaryGoalDirections?.join(" · ")}</p>}<Link href="/assistant">Define or adjust with Soma</Link></div><label>Sleep target (minutes)<input required min="240" max="720" step="5" type="number" value={profile.baseSleepTargetMinutes} onChange={(event) => update("baseSleepTargetMinutes", Number(event.target.value))} aria-describedby="sleep-target-help" /><small id="sleep-target-help">510 minutes = 8 h 30. Accepted range: 240 to 720 minutes.</small></label><label>Usual wake time<input type="time" required value={profile.usualWakeTime} onChange={(event) => update("usualWakeTime", event.target.value)} /></label><label>Initial import<select value={profile.importRange} onChange={(event) => update("importRange", event.target.value as Profile["importRange"])}><option value="90_days">Last 90 days</option><option value="all_history">All available history</option></select></label></div>{!profileValid && <p className="form-error" role="alert">Please check your name, date of birth, height, weight, sleep target, and wake time.</p>}{profileDirty && profileValid && <p className="settings-message" role="status">Unsaved changes.</p>}<div className="form-navigation"><button className="secondary-button" onClick={() => void cancelProfileEdits()} disabled={!profileDirty || Boolean(busyAction)} type="button">Discard</button><button className="primary-button" onClick={() => void save()} disabled={!profileDirty || !profileValid || Boolean(busyAction)} type="button">{busyAction === "save" ? <LoaderCircle className="spin" /> : message === "Profile changes saved." ? <Check /> : <Save />}{busyAction === "save" ? "Saving…" : profileDirty ? "Save changes" : "No changes"}</button></div></section>}
   {tab === "display" && <section className="settings-card"><div><h2>Display</h2><p>Choose how sleep, recovery, effort, and calories appear on your Personal Lab.</p></div><fieldset className={styles.chartPresentation}><legend>Home chart</legend><div className={styles.chartPresentationOptions}><label className={styles.chartPresentationOption} data-selected={primaryChartPresentation === "radar"}><input type="radio" name="primary-chart-presentation" value="radar" checked={primaryChartPresentation === "radar"} onChange={() => setPrimaryChartPresentation("radar")} /><span><strong>Radar</strong><small>Compare all four measures on one graph.</small></span></label><label className={styles.chartPresentationOption} data-selected={primaryChartPresentation === "rings"}><input type="radio" name="primary-chart-presentation" value="rings" checked={primaryChartPresentation === "rings"} onChange={() => setPrimaryChartPresentation("rings")} /><span><strong>Rings</strong><small>See each measure against its goal.</small></span></label></div></fieldset></section>}
   {tab === "connections" && <section className="settings-card"><div><h2>Personal Lab Sources</h2><p>Health metrics track your physiology. Calendar and your daily journal provide the context needed to discover what drives your best days.</p></div>{connectionError && <div className="inline-empty" role="alert"><AlertCircle size={18} /><div><strong>Connection state unavailable</strong><p>{connectionError}</p></div></div>}<article className="connection-card" data-scroll-reveal="source"><span className="connection-logo" aria-hidden="true"><HeartPulse size={19} /></span><div><strong>Google Health</strong><p>{connection ? `${requiresReconnection ? "Reconnection required" : partialAccess ? "Partial access" : "Connected"} · Last sync: ${connection.last_synced_at ? formatDateTime(connection.last_synced_at) : "pending"}` : "Not connected"}</p></div>{connection ? <div className="connection-actions"><button className="sync-now-button" disabled={Boolean(busyAction) || requiresReconnection} onClick={() => void sync()} type="button">{busyAction === "sync" ? <LoaderCircle className="spin" /> : <RefreshCw />}Sync now</button>{(partialAccess || requiresReconnection) && <a href="/api/health/google/connect">{requiresReconnection ? "Reconnect Google Health" : "Review permissions"} <ExternalLink /></a>}<button ref={disconnectButtonRef} disabled={Boolean(busyAction)} onClick={() => setDisconnectConfirm(true)} type="button"><Unplug />Disconnect</button></div> : <a href="/api/health/google/connect">Connect <ExternalLink /></a>}</article>{connection && <p className="sync-schedule"><Clock3 aria-hidden="true" />Lab metrics refresh approximately every 15 minutes. Raw wearable streams sync as events arrive from providers.</p>}{connection && <HealthDataCoverageIndicator coverage={syncState?.coverage} phase={syncState?.status.phase} error={syncState?.coverageError} />}{message && <p className={`settings-message settings-message--${messageTone} settings-message--inline`} role={messageTone === "error" ? "alert" : "status"} aria-live="polite">{message}</p>}{syncError && <div className="form-error" role="alert"><p>{syncError}</p><button className="secondary-button" type="button" onClick={() => { setSyncError(null); setSyncRetryVersion((current) => current + 1); }}>Retry</button></div>}{connection && syncState && <SyncStatusSummary state={syncState} />}{connection && <details className="sync-advanced" open={diagnosticsOpen} onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)}><summary>Advanced diagnostics</summary>{diagnosticsOpen && syncState ? <SyncDiagnostics state={syncState} /> : null}</details>}{disconnectConfirm && <div className="inline-confirmation" role="group" aria-labelledby="disconnect-health-title"><div><strong id="disconnect-health-title">Disconnect Google Health?</strong><p>Revoking cuts off future access. Imported data remains in Soma until you delete your account.</p></div><div><button ref={disconnectCancelRef} className="secondary-button" type="button" onClick={() => { setDisconnectConfirm(false); disconnectButtonRef.current?.focus(); }}>Cancel</button><button className="danger-button" disabled={busyAction === "disconnect"} onClick={() => void disconnect()} type="button">{busyAction === "disconnect" ? "Disconnecting…" : "Disconnect"}</button></div></div>}<div className="scope-note" data-scroll-reveal="source"><Shield /><div><strong>Read-only by design</strong><p>Sleep, activity, readiness, and vital health metrics. OAuth tokens are encrypted and never sent to your browser.</p></div></div><AppleHealthSyncCard /><CalendarConnectionCard initialNotice={initialCalendarNotice} /></section>}
    {tab === "privacy" && <section className="settings-card"><div><h2>Your Soma Data</h2><p>Soma retains your history until you export or delete it. Provider OAuth secrets are never included in exports.</p></div><div className="privacy-actions"><article data-scroll-reveal="privacy"><Database /><div><strong>Export all data</strong><p>Download profile, health data, scores, analyses, and workouts in JSON format.</p>{exportError && <p className="form-error" role="alert">{exportError}</p>}</div><button disabled={busyAction === "export"} onClick={() => void exportData()} type="button">{busyAction === "export" ? <LoaderCircle className="spin" size={16} /> : <Download />}{busyAction === "export" ? "Preparing…" : "Export JSON"}</button></article><AiCostCard /><article data-scroll-reveal="privacy"><LogOut /><div><strong>Sign out</strong><p>Close this browser session without deleting your data.</p></div><button disabled={Boolean(busyAction)} onClick={() => void signOut()} type="button">{busyAction === "signout" ? "Signing out…" : "Sign out"}</button></article><article className="danger-zone" data-scroll-reveal="privacy"><Trash2 /><div><strong>Delete account and all Soma data</strong><p>This action is irreversible and deletes all your history.</p><label htmlFor="delete-confirm">Confirmation — type DELETE MY SOMA DATA</label><small id="delete-confirm-help">Exact uppercase phrase with spaces included.</small><input id="delete-confirm" aria-describedby="delete-confirm-help" aria-label="Type DELETE MY SOMA DATA to confirm deletion" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="DELETE MY SOMA DATA" autoComplete="off" /></div><button disabled={deleteText !== "DELETE MY SOMA DATA" || Boolean(busyAction)} onClick={() => void deleteAccount()} type="button">{busyAction === "delete" ? "Deleting…" : "Delete permanently"}</button></article></div></section>}
   {message && tab !== "connections" && <p className={`settings-message settings-message--${messageTone}`} role={messageTone === "error" ? "alert" : "status"} aria-live="polite">{message}</p>}
  </section></div></main>;
}

function SyncDiagnostics({ state }: { state: SyncState }) {
  const latest = state.jobs?.[0];
  const labels: Record<string, string> = { sleep: "Sleep", "daily-heart-rate-variability": "HRV", "daily-resting-heart-rate": "Resting HR", steps: "Steps" };
  const statusLabels: Record<string, string> = { queued: "Queued", running: "In progress", completed: "Completed", failed: "Failed" };
  const importedRecords = (key: string) => {
    const value = state.importedRecords?.[key];
    return typeof value === "number" && Number.isFinite(value) ? `${formatNumber(value)} record${value === 1 ? "" : "s"}` : "—";
  };
  return <section className="sync-diagnostics" aria-labelledby="sync-diagnostics-title">
    <div><strong id="sync-diagnostics-title">Import diagnostics</strong><span>{latest ? `${statusLabels[latest.status] ?? latest.status} · ${formatNumber(latest.progress)} %` : "No import running"}</span></div>
    {latest && <progress max="100" value={latest.progress} aria-label={`Import progress: ${formatNumber(latest.progress)} %`} />}
    {state.importedRecords && <dl>{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{importedRecords(key)}</dd></div>)}</dl>}
    {state.analytics && <dl><div><dt>Dated records</dt><dd>{formatNumber(state.analytics.datedRecords)}</dd></div><div><dt>Metric days</dt><dd>{formatNumber(state.analytics.metricDays)}</dd></div><div><dt>Score rows</dt><dd>{formatNumber(state.analytics.scoreRows)}</dd></div></dl>}
    {!state.analytics && <p>Loading diagnostic counters…</p>}
    {latest?.error_message && <p role="alert">{latest.error_message}</p>}
  </section>;
}

function SyncStatusSummary({ state }: { state: SyncState }) {
  const labels: Record<SyncStatus["phase"], string> = {
    queued: "Queued", fetching: "Fetching Google Health data", materializing: "Updating scores", up_to_date: "Up to date",
    partial: "Up to date with partial access", retrying: "Retrying automatically", needs_reconnect: "Reconnection required", failed: "Update failed",
  };
  const active = ["queued", "fetching", "materializing", "retrying"].includes(state.status.phase);
  return <section className={`sync-summary sync-summary--${state.status.phase}`} aria-live="polite" data-scroll-reveal="source"><div><strong>{labels[state.status.phase]}</strong><span>{formatNumber(state.status.progress)} %</span></div>{active && <progress max="100" value={state.status.progress} aria-label={`Google Health sync: ${formatNumber(state.status.progress)} %`} />}{state.status.lastError && <p>{state.status.lastError}</p>}</section>;
}

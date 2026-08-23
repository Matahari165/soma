"use client";

import { AlertCircle, Check, Clock3, Database, Download, ExternalLink, HeartPulse, LoaderCircle, LogOut, RefreshCw, RotateCcw, Save, Shield, Trash2, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CalendarConnectionCard, type CalendarConnectionNotice } from "@/components/calendar-connection-card";
import { HealthDataCoverageIndicator } from "@/components/health-data-coverage";
import type { GoogleHealthNotice } from "@/integrations/google-health/status";
import type { SyncStatus } from "@/domain/health";
import type { HealthDataCoverage } from "@/domain/health/data-coverage";

type Profile = { displayName: string; dateOfBirth: string; heightCm: number; weightKg: number; primaryGoal: string; baseSleepTargetMinutes: number; usualWakeTime: string; importRange: "90_days" | "all_history" };
type SyncJob = { id: string; status: string; progress: number; error_message: string | null; completed_at: string | null; created_at: string };
type SyncState = { status: SyncStatus; connection?: { lastSyncedAt?: string | null }; jobs?: SyncJob[]; importedRecords?: Record<string, number>; analytics?: { datedRecords: number; metricDays: number; scoreRows: number }; coverage?: HealthDataCoverage; coverageError?: boolean };
type Connection = { status: string; scopes?: string[]; last_synced_at?: string | null; last_lab_synced_at?: string | null; metadata?: { consent_complete?: boolean } };
type SettingsTab = "profile" | "connections" | "privacy";
const tabOrder: SettingsTab[] = ["profile", "connections", "privacy"];
const goals = { build_muscle: "Build muscle", improve_endurance: "Improve endurance", improve_cardio: "Improve cardio", general_fitness: "General fitness", maintain_health: "Maintain health", other: "Other" };

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
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Sync status is temporarily unavailable.")))
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
      if (!response.ok) throw new Error(result.error ?? "Your profile could not be saved.");
      setSavedProfile(profile);
      showMessage("Profile changes saved.", "success");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Your profile could not be saved.", "error");
    } finally { setBusyAction(null); }
  }

  async function sync() {
    if (busyAction) return;
    setBusyAction("sync");
    showMessage("Syncing Google Health…");
    try {
      const response = await fetch("/api/health/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Sync could not be started.");
      if (result.status) setSyncState((current) => ({ ...(current ?? {}), status: result.status } as SyncState));
      showMessage(result.message ?? "Google Health import continues in the background.", "success");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Sync could not be started.", "error");
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
      showMessage("Google Health disconnected. Imported Soma data remains available.", "success");
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
      if (!response.ok) throw new Error("You could not be signed out.");
      router.push("/login");
      router.refresh();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "You could not be signed out.", "error");
      setBusyAction(null);
    }
  }

  if (loading) return <div className="workout-loading" id="main-page-content" role="status"><LoaderCircle className="spin" />Loading settings…</div>;
  if (loadError || !profile) return <div className="settings-page" id="main-page-content"><div className="load-error" role="alert"><AlertCircle /><h1>Settings could not load</h1><p>{loadError ?? "Your profile is unavailable."}</p><button className="secondary-button" type="button" onClick={() => { setLoading(true); setLoadError(null); setRetryVersion((current) => current + 1); }}><RotateCcw size={16} />Try again</button></div></div>;

  return <div className="settings-page" id="main-page-content"><header><h1>Settings</h1></header><div className="settings-layout"><nav role="tablist" aria-label="Settings sections"><button id="profile-tab" role="tab" tabIndex={tab === "profile" ? 0 : -1} aria-selected={tab === "profile"} aria-controls="settings-panel" className={tab === "profile" ? "is-active" : ""} onKeyDown={(event) => handleTabKeyDown(event, "profile")} onClick={() => selectTab("profile")} type="button">Profile & goals</button><button id="connections-tab" role="tab" tabIndex={tab === "connections" ? 0 : -1} aria-selected={tab === "connections"} aria-controls="settings-panel" className={tab === "connections" ? "is-active" : ""} onKeyDown={(event) => handleTabKeyDown(event, "connections")} onClick={() => selectTab("connections")} type="button">Connections</button><button id="privacy-tab" role="tab" tabIndex={tab === "privacy" ? 0 : -1} aria-selected={tab === "privacy"} aria-controls="settings-panel" className={tab === "privacy" ? "is-active" : ""} onKeyDown={(event) => handleTabKeyDown(event, "privacy")} onClick={() => selectTab("privacy")} type="button">Data & privacy</button></nav><section id="settings-panel" role="tabpanel" aria-labelledby={`${tab}-tab`} className="settings-content">
    {tab === "profile" && <section className="settings-card"><div><h2>Profile and targets</h2><p>These values support your personal estimates. Google does not change them automatically.</p></div><div className="settings-form"><label>Name<input required maxLength={80} autoComplete="name" value={profile.displayName} onChange={(event) => update("displayName", event.target.value)} /></label><label>Date of birth<input required type="date" max={new Date().toISOString().slice(0, 10)} autoComplete="bday" value={profile.dateOfBirth} onChange={(event) => update("dateOfBirth", event.target.value)} /></label><label>Height (cm)<input required min="50" max="260" type="number" value={profile.heightCm} onChange={(event) => update("heightCm", Number(event.target.value))} /></label><label>Weight (kg)<input required min="20" max="400" type="number" step="0.1" value={profile.weightKg} onChange={(event) => update("weightKg", Number(event.target.value))} /></label><label>Primary goal<select value={profile.primaryGoal} onChange={(event) => update("primaryGoal", event.target.value)}>{Object.entries(goals).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Base sleep target<select value={profile.baseSleepTargetMinutes} onChange={(event) => update("baseSleepTargetMinutes", Number(event.target.value))}><option value="420">7 hours</option><option value="450">7.5 hours</option><option value="480">8 hours</option><option value="510">8.5 hours</option><option value="540">9 hours</option></select></label><label>Usual wake time<input type="time" required value={profile.usualWakeTime} onChange={(event) => update("usualWakeTime", event.target.value)} /></label><label>Initial import<select value={profile.importRange} onChange={(event) => update("importRange", event.target.value as Profile["importRange"])}><option value="90_days">Last 90 days</option><option value="all_history">All available history</option></select></label></div>{!profileValid && <p className="form-error" role="alert">Check your name, date of birth, height, weight, and wake time.</p>}<button className="primary-button" onClick={() => void save()} disabled={!profileDirty || !profileValid || Boolean(busyAction)} type="button">{busyAction === "save" ? <LoaderCircle className="spin" /> : message === "Profile changes saved." ? <Check /> : <Save />}{busyAction === "save" ? "Saving…" : profileDirty ? "Save changes" : "No changes"}</button></section>}
    {tab === "connections" && <section className="settings-card"><div><h2>Personal Lab sources</h2><p>Health describes your physiology. Calendar and the daily journal add the context needed to learn what changes your best days.</p></div>{connectionError && <div className="inline-empty" role="alert"><AlertCircle size={18} /><div><strong>Connection status unavailable</strong><p>{connectionError}</p></div></div>}<article className="connection-card"><span className="connection-logo" aria-hidden="true"><HeartPulse size={19} /></span><div><strong>Google Health</strong><p>{connection ? `${partialAccess ? "Partial access" : "Connected"} · Last completed import ${connection.last_synced_at ? new Date(connection.last_synced_at).toLocaleString("en-US") : "pending"}` : "Not connected"}</p></div>{connection ? <div className="connection-actions"><button className="sync-now-button" disabled={Boolean(busyAction)} onClick={() => void sync()} type="button">{busyAction === "sync" ? <LoaderCircle className="spin" /> : <RefreshCw />}Sync now</button>{partialAccess && <a href="/api/health/google/connect">Review access <ExternalLink /></a>}<button disabled={Boolean(busyAction)} onClick={() => setDisconnectConfirm(true)} type="button"><Unplug />Disconnect</button></div> : <a href="/api/health/google/connect">Connect <ExternalLink /></a>}</article>{connection && <p className="sync-schedule"><Clock3 aria-hidden="true" />Lab metrics refresh hourly. Raw streams update as Google sends them.</p>}{connection && <HealthDataCoverageIndicator coverage={syncState?.coverage} phase={syncState?.status.phase} error={syncState?.coverageError} />}{message && <p className={`settings-message settings-message--${messageTone} settings-message--inline`} role={messageTone === "error" ? "alert" : "status"} aria-live="polite">{message}</p>}{syncError && <p className="form-error" role="alert">{syncError}</p>}{connection && syncState && <SyncStatusSummary state={syncState} />}{connection && <details className="sync-advanced" open={diagnosticsOpen} onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)}><summary>Advanced details</summary>{diagnosticsOpen && syncState ? <SyncDiagnostics state={syncState} /> : null}</details>}{disconnectConfirm && <div className="inline-confirmation" role="alert"><div><strong>Disconnect Google Health?</strong><p>Imported data remains in Soma until you delete your account.</p></div><div><button className="secondary-button" type="button" onClick={() => setDisconnectConfirm(false)}>Cancel</button><button className="danger-button" disabled={busyAction === "disconnect"} onClick={() => void disconnect()} type="button">{busyAction === "disconnect" ? "Disconnecting…" : "Disconnect"}</button></div></div>}<div className="scope-note"><Shield /><div><strong>Read-only by design</strong><p>Sleep, activity and fitness, and health metrics. OAuth tokens are encrypted and never sent to your browser.</p></div></div><CalendarConnectionCard initialNotice={initialCalendarNotice} /></section>}
    {tab === "privacy" && <section className="settings-card"><div><h2>Your Soma data</h2><p>Soma keeps your history until you export or delete it. Provider OAuth secrets are excluded from exports.</p></div><div className="privacy-actions"><article><Database /><div><strong>Export all data</strong><p>Download profile, health records, scores, insights, conversations, and workouts as JSON.</p></div><a href="/api/account/export" download><Download />Export JSON</a></article><article><LogOut /><div><strong>Sign out</strong><p>End this browser session without deleting data.</p></div><button disabled={Boolean(busyAction)} onClick={() => void signOut()} type="button">{busyAction === "signout" ? "Signing out…" : "Sign out"}</button></article><article className="danger-zone"><Trash2 /><div><strong>Delete account and all Soma data</strong><p>This cannot be undone. Enter DELETE MY SOMA DATA to confirm.</p><input aria-label="Type DELETE MY SOMA DATA to confirm" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="DELETE MY SOMA DATA" autoComplete="off" /></div><button disabled={deleteText !== "DELETE MY SOMA DATA" || Boolean(busyAction)} onClick={() => void deleteAccount()} type="button">{busyAction === "delete" ? "Deleting…" : "Delete permanently"}</button></article></div></section>}
    {message && tab !== "connections" && <p className={`settings-message settings-message--${messageTone}`} role={messageTone === "error" ? "alert" : "status"} aria-live="polite">{message}</p>}
  </section></div></div>;
}

function SyncDiagnostics({ state }: { state: SyncState }) {
  const latest = state.jobs?.[0];
  const labels: Record<string, string> = { sleep: "Sleep", "daily-heart-rate-variability": "HRV", "daily-resting-heart-rate": "Resting HR", steps: "Steps" };
  return <section className="sync-diagnostics" aria-labelledby="sync-diagnostics-title">
    <div><strong id="sync-diagnostics-title">Import diagnostics</strong><span>{latest ? `${latest.status} · ${latest.progress}%` : "No import started"}</span></div>
    {latest && <progress max="100" value={latest.progress} aria-label={`Import progress: ${latest.progress}%`} />}
    {state.importedRecords && <dl>{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{state.importedRecords?.[key] ?? 0} records</dd></div>)}</dl>}
    {state.analytics && <dl><div><dt>Dated records</dt><dd>{state.analytics.datedRecords}</dd></div><div><dt>Dashboard days</dt><dd>{state.analytics.metricDays}</dd></div><div><dt>Score rows</dt><dd>{state.analytics.scoreRows}</dd></div></dl>}
    {!state.analytics && <p>Loading diagnostic counts…</p>}
    {latest?.error_message && <p role="alert">{latest.error_message}</p>}
  </section>;
}

function SyncStatusSummary({ state }: { state: SyncState }) {
  const labels: Record<SyncStatus["phase"], string> = {
    queued: "Queued", fetching: "Fetching Google data", materializing: "Updating your scores", up_to_date: "Up to date",
    partial: "Up to date with partial access", retrying: "Retrying automatically", needs_reconnect: "Reconnect required", failed: "Update failed",
  };
  const active = ["queued", "fetching", "materializing", "retrying"].includes(state.status.phase);
  return <section className={`sync-summary sync-summary--${state.status.phase}`} aria-live="polite"><div><strong>{labels[state.status.phase]}</strong><span>{state.status.progress}%</span></div>{active && <progress max="100" value={state.status.progress} aria-label={`Google Health update ${state.status.progress}%`} />}{state.status.lastError && <p>{state.status.lastError}</p>}</section>;
}

"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { SupplementDefinition, SupplementEntry } from "@/domain/supplements";
import styles from "./meal-supplements.module.css";

type DefinitionView = Omit<SupplementDefinition, "userId"> & { contributionScope: "micronutrients" | "protein" | "separate" };
type EntryView = Omit<SupplementEntry, "userId">;
type IntakeStatus = EntryView["actual"]["status"];

export const MEAL_SUPPLEMENTS_DATE_EVENT = "soma:meal-date";

export type MealSupplementsProps = { date: string; initialDefinitions: readonly DefinitionView[]; initialEntries: readonly EntryView[]; initialError?: string | null; className?: string; compact?: boolean };

function definitionName(definition: DefinitionView) {
  return definition.brand ? `${definition.productName} · ${definition.brand}` : definition.productName;
}

function formatSupplementDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(parsed);
}

async function requestJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => null) as T & { error?: string } | null;
  if (!response.ok) throw new Error(body?.error ?? "L’opération n’a pas pu être enregistrée.");
  return body as T;
}

export function MealSupplements({ date, initialDefinitions, initialEntries, initialError, className, compact = false }: MealSupplementsProps) {
  const [definitions, setDefinitions] = useState<DefinitionView[]>([...initialDefinitions]);
  const [entries, setEntries] = useState<EntryView[]>([...initialEntries]);
  // Le journal change de jour côté client sans recharger la page : la date
  // suivie ici reste celle du jour affiché, jamais celle du premier rendu.
  const [currentDate, setCurrentDate] = useState(date);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(initialDefinitions.length === 0 && !initialError);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [dose, setDose] = useState("1 dose");
  const [usageInstruction, setUsageInstruction] = useState("");
  const [pendingArchive, setPendingArchive] = useState<DefinitionView | null>(null);
  const archiveTrigger = useRef<HTMLElement | null>(null);
  const archiveCancelRef = useRef<HTMLButtonElement>(null);
  const trackedDate = useRef(date);
  const activeDefinitions = useMemo(() => definitions.filter((definition) => !definition.archivedAt), [definitions]);
  const archivedDefinitions = useMemo(() => definitions.filter((definition) => definition.archivedAt), [definitions]);
  const entryByDefinition = useMemo(() => new Map(entries.filter((entry) => entry.entryDate === currentDate).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).map((entry) => [entry.definitionId, entry])), [currentDate, entries]);

  async function loadEntriesFor(nextDate: string) {
    setEntriesLoading(true);
    try {
      const response = await fetch(`/api/supplements/entries?from=${encodeURIComponent(nextDate)}&to=${encodeURIComponent(nextDate)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as { entries?: EntryView[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Les compléments de ce jour sont momentanément indisponibles.");
      setEntries(Array.isArray(body?.entries) ? body.entries : []);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Les compléments de ce jour sont momentanément indisponibles.");
    } finally {
      setEntriesLoading(false);
    }
  }

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || trackedDate.current === date) return;
    trackedDate.current = date;
    setCurrentDate(date);
    setEntries([...initialEntries]);
    setError(initialError ?? null);
    setMessage(null);
    setPendingArchive(null);
  }, [date, initialEntries, initialError]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMealDate = (event: Event) => {
      const next = (event as CustomEvent<{ date?: string }>).detail?.date;
      if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next) || trackedDate.current === next) return;
      trackedDate.current = next;
      setCurrentDate(next);
      setError(null);
      setMessage(null);
      setPendingArchive(null);
      void loadEntriesFor(next);
    };
    window.addEventListener(MEAL_SUPPLEMENTS_DATE_EVENT, onMealDate);
    return () => window.removeEventListener(MEAL_SUPPLEMENTS_DATE_EVENT, onMealDate);
  }, []);

  useEffect(() => {
    if (!pendingArchive) return;
    archiveCancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPendingArchive(null);
      archiveTrigger.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pendingArchive]);

  async function setIntake(definition: DefinitionView, status: IntakeStatus) {
    setBusy(`entry-${definition.id}`); setError(null); setMessage(null);
    try {
      const body = await requestJson<{ entry: EntryView }>("/api/supplements/entries", { method: "POST", body: JSON.stringify({ entry: {
        definitionId: definition.id, entryDate: currentDate, planned: { servings: 1, scheduledAt: null },
        actual: { status, servings: status === "taken" ? 1 : null, takenAt: null, note: null }, note: null,
      } }) });
      setEntries((current) => [body.entry, ...current.filter((entry) => entry.id !== body.entry.id && !(entry.definitionId === body.entry.definitionId && entry.entryDate === body.entry.entryDate))]);
      const dayLabel = formatSupplementDate(currentDate);
      setMessage(status === "taken" ? `${definition.productName} : oui (${definition.serving.label}, ${dayLabel}).` : status === "skipped" ? `${definition.productName} : non (${definition.serving.label}, ${dayLabel}).` : `${definition.productName} remis à non renseigné (${dayLabel}).`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "La réponse n’a pas pu être enregistrée."); }
    finally { setBusy(null); }
  }

  async function createDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("create"); setError(null); setMessage(null);
    try {
      const body = await requestJson<{ definition: DefinitionView }>("/api/supplements", { method: "POST", body: JSON.stringify({ definition: {
        productName, brand: null, category: "other", source: "personal_record", sourceReference: null,
        serving: { quantity: 1, unit: "serving", label: dose }, nutrients: [], frequency: { kind: "daily", timesPerDay: 1 },
        usageInstruction: usageInstruction.trim() || null, notes: null,
      } }) });
      setDefinitions((current) => [body.definition, ...current]); setProductName(""); setDose("1 dose"); setUsageInstruction(""); setFormOpen(false);
      setMessage(`${body.definition.productName} est maintenant actif dans le journal.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Le complément n’a pas pu être enregistré."); }
    finally { setBusy(null); }
  }

  function requestArchive(definition: DefinitionView) {
    archiveTrigger.current = typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setPendingArchive(definition);
  }

  function cancelArchive() {
    setPendingArchive(null);
    archiveTrigger.current?.focus();
  }

  async function confirmArchive() {
    const definition = pendingArchive;
    if (!definition) return;
    setPendingArchive(null);
    setBusy(`archive-${definition.id}`); setError(null); setMessage(null);
    try {
      const body = await requestJson<{ definition: DefinitionView }>(`/api/supplements/${definition.id}`, { method: "PATCH", body: JSON.stringify({ definition: { archivedAt: new Date().toISOString() } }) });
      setDefinitions((current) => current.map((item) => item.id === body.definition.id ? body.definition : item));
      setMessage(`${definition.productName} archivé. Son historique est conservé.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Le complément n’a pas pu être archivé."); }
    finally { setBusy(null); archiveTrigger.current?.focus(); }
  }

  function archiveDefinition(definition: DefinitionView) {
    requestArchive(definition);
  }

  return <section className={[styles.root, compact ? styles.compact : "", className].filter(Boolean).join(" ")} aria-labelledby="supplements-title">
    <header className={styles.header}><div><h2 id="supplements-title">Compléments</h2><p>Une réponse par produit, à la dose habituelle. <span>Jour suivi : {formatSupplementDate(currentDate)}.</span></p></div><button className={styles.addButton} type="button" onClick={() => setFormOpen((open) => !open)} aria-expanded={formOpen} aria-controls="supplement-form">{formOpen ? "Fermer" : "Nouvelle boîte"}</button></header>
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.message} role="status" aria-live="polite">{message}</p>}
    {entriesLoading && <p className={styles.loading} role="status" aria-live="polite">Chargement des prises du jour…</p>}
    {formOpen && <form id="supplement-form" className={styles.form} onSubmit={createDefinition}>
      <label><span>Produit</span><input required maxLength={160} value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Ex. Oméga-3" /></label>
      <label><span>Dose habituelle</span><input required maxLength={120} value={dose} onChange={(event) => setDose(event.target.value)} placeholder="Ex. 2 capsules" /></label>
      <label><span>Indication <em>(facultative)</em></span><input maxLength={240} value={usageInstruction} onChange={(event) => setUsageInstruction(event.target.value)} placeholder="Ex. Avec un repas contenant du gras" /></label>
      <button className={styles.primaryButton} type="submit" disabled={busy === "create"}>{busy === "create" ? "Enregistrement…" : "Activer dans le journal"}</button>
    </form>}
    <div className={styles.body}>
      {activeDefinitions.length ? <ul className={styles.definitionList}>{activeDefinitions.map((definition) => {
        const status = entryByDefinition.get(definition.id)?.actual.status ?? "not_recorded"; const entrySaving = busy === `entry-${definition.id}`; const archiveSaving = busy === `archive-${definition.id}`;
        return <li key={definition.id} className={styles.definitionRow}><div className={styles.definitionInfo}><strong>{definitionName(definition)}</strong><span>{definition.serving.label}{definition.usageInstruction ? ` · ${definition.usageInstruction}` : ""}</span><small data-status={status}>{status === "taken" ? "Oui" : status === "skipped" ? "Non" : "Non renseigné"}</small></div><div className={styles.actions} role="group" aria-label={`${definitionName(definition)}, pris à la dose habituelle`}><button type="button" aria-pressed={status === "taken"} onClick={() => void setIntake(definition, "taken")} disabled={entrySaving}>{entrySaving ? "…" : "Oui"}</button><button type="button" aria-pressed={status === "skipped"} onClick={() => void setIntake(definition, "skipped")} disabled={entrySaving}>Non</button>{status !== "not_recorded" && <button className={styles.resetButton} type="button" onClick={() => void setIntake(definition, "not_recorded")} disabled={entrySaving}>Effacer</button>}</div><button className={styles.archiveButton} type="button" onClick={() => archiveDefinition(definition)} disabled={archiveSaving}>{archiveSaving ? "Archivage…" : "Boîte terminée"}</button></li>;
      })}</ul> : <p className={styles.empty}>{initialError ? "Impossible de charger les compléments." : "Aucun complément actif. Ajoute une boîte si tu en commences une."}</p>}
      {archivedDefinitions.length > 0 && <details className={styles.history}><summary>Anciennes boîtes ({archivedDefinitions.length})</summary><ul>{archivedDefinitions.map((definition) => <li key={definition.id}><span>{definitionName(definition)}</span><span>{definition.serving.label}</span></li>)}</ul></details>}
    </div>
    {pendingArchive && <div className={styles.dialogBackdrop} onClick={(event) => { if (event.target === event.currentTarget) cancelArchive(); }}>
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="supplement-archive-title" aria-describedby="supplement-archive-description">
        <h3 id="supplement-archive-title">Boîte terminée ?</h3>
        <p id="supplement-archive-description">{definitionName(pendingArchive)} sera archivé. Son historique est conservé.</p>
        <div className={styles.dialogActions}>
          <button ref={archiveCancelRef} type="button" onClick={cancelArchive}>Annuler</button>
          <button type="button" onClick={() => void confirmArchive()}>Archiver</button>
        </div>
      </div>
    </div>}
  </section>;
}

export default MealSupplements;

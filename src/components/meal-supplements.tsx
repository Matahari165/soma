"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { SupplementDefinition, SupplementEntry } from "@/domain/supplements";
import styles from "./meal-supplements.module.css";

type DefinitionView = Omit<SupplementDefinition, "userId"> & { contributionScope: "micronutrients" | "protein" | "separate" };
type EntryView = Omit<SupplementEntry, "userId">;
type IntakeStatus = EntryView["actual"]["status"];

export type MealSupplementsProps = { date: string; initialDefinitions: readonly DefinitionView[]; initialEntries: readonly EntryView[]; initialError?: string | null; className?: string; compact?: boolean };

function definitionName(definition: DefinitionView) {
  return definition.brand ? `${definition.productName} · ${definition.brand}` : definition.productName;
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
  const [formOpen, setFormOpen] = useState(initialDefinitions.length === 0 && !initialError);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [dose, setDose] = useState("1 dose");
  const [usageInstruction, setUsageInstruction] = useState("");
  const activeDefinitions = useMemo(() => definitions.filter((definition) => !definition.archivedAt), [definitions]);
  const archivedDefinitions = useMemo(() => definitions.filter((definition) => definition.archivedAt), [definitions]);
  const entryByDefinition = useMemo(() => new Map(entries.filter((entry) => entry.entryDate === date).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).map((entry) => [entry.definitionId, entry])), [date, entries]);

  async function setIntake(definition: DefinitionView, status: IntakeStatus) {
    setBusy(`entry-${definition.id}`); setError(null); setMessage(null);
    try {
      const body = await requestJson<{ entry: EntryView }>("/api/supplements/entries", { method: "POST", body: JSON.stringify({ entry: {
        definitionId: definition.id, entryDate: date, planned: { servings: 1, scheduledAt: null },
        actual: { status, servings: status === "taken" ? 1 : null, takenAt: null, note: null }, note: null,
      } }) });
      setEntries((current) => [body.entry, ...current.filter((entry) => entry.id !== body.entry.id && !(entry.definitionId === body.entry.definitionId && entry.entryDate === body.entry.entryDate))]);
      setMessage(status === "taken" ? `${definition.productName} : oui.` : status === "skipped" ? `${definition.productName} : non.` : `${definition.productName} remis à non renseigné.`);
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

  async function archiveDefinition(definition: DefinitionView) {
    setBusy(`archive-${definition.id}`); setError(null); setMessage(null);
    try {
      const body = await requestJson<{ definition: DefinitionView }>(`/api/supplements/${definition.id}`, { method: "PATCH", body: JSON.stringify({ definition: { archivedAt: new Date().toISOString() } }) });
      setDefinitions((current) => current.map((item) => item.id === body.definition.id ? body.definition : item));
      setMessage(`${definition.productName} archivé. Son historique est conservé.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Le complément n’a pas pu être archivé."); }
    finally { setBusy(null); }
  }

  return <section className={[styles.root, compact ? styles.compact : "", className].filter(Boolean).join(" ")} aria-labelledby="supplements-title">
    <header className={styles.header}><div><h2 id="supplements-title">Compléments</h2><p>Une réponse par produit, à la dose habituelle.</p></div><button className={styles.addButton} type="button" onClick={() => setFormOpen((open) => !open)} aria-expanded={formOpen} aria-controls="supplement-form">{formOpen ? "Fermer" : "Nouvelle boîte"}</button></header>
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.message} role="status" aria-live="polite">{message}</p>}
    {formOpen && <form id="supplement-form" className={styles.form} onSubmit={createDefinition}>
      <label><span>Produit</span><input required maxLength={160} value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Ex. Oméga-3" /></label>
      <label><span>Dose habituelle</span><input required maxLength={120} value={dose} onChange={(event) => setDose(event.target.value)} placeholder="Ex. 2 capsules" /></label>
      <label><span>Indication <em>(facultative)</em></span><input maxLength={240} value={usageInstruction} onChange={(event) => setUsageInstruction(event.target.value)} placeholder="Ex. Avec un repas contenant du gras" /></label>
      <button className={styles.primaryButton} type="submit" disabled={busy !== null}>{busy === "create" ? "Enregistrement…" : "Activer dans le journal"}</button>
    </form>}
    <div className={styles.body}>
      {activeDefinitions.length ? <ul className={styles.definitionList}>{activeDefinitions.map((definition) => {
        const status = entryByDefinition.get(definition.id)?.actual.status ?? "not_recorded"; const saving = busy === `entry-${definition.id}`;
        return <li key={definition.id} className={styles.definitionRow}><div className={styles.definitionInfo}><strong>{definitionName(definition)}</strong><span>{definition.serving.label}{definition.usageInstruction ? ` · ${definition.usageInstruction}` : ""}</span><small data-status={status}>{status === "taken" ? "Oui" : status === "skipped" ? "Non" : "Non renseigné"}</small></div><div className={styles.actions} role="group" aria-label={`${definitionName(definition)}, pris à la dose habituelle`}><button type="button" aria-pressed={status === "taken"} onClick={() => void setIntake(definition, "taken")} disabled={busy !== null}>{saving ? "…" : "Oui"}</button><button type="button" aria-pressed={status === "skipped"} onClick={() => void setIntake(definition, "skipped")} disabled={busy !== null}>Non</button>{status !== "not_recorded" && <button className={styles.resetButton} type="button" onClick={() => void setIntake(definition, "not_recorded")} disabled={busy !== null}>Effacer</button>}</div><button className={styles.archiveButton} type="button" onClick={() => void archiveDefinition(definition)} disabled={busy !== null}>{busy === `archive-${definition.id}` ? "Archivage…" : "Boîte terminée"}</button></li>;
      })}</ul> : <p className={styles.empty}>{initialError ? "Impossible de charger les compléments." : "Aucun complément actif. Ajoute une boîte si tu en commences une."}</p>}
      {archivedDefinitions.length > 0 && <details className={styles.history}><summary>Anciennes boîtes ({archivedDefinitions.length})</summary><ul>{archivedDefinitions.map((definition) => <li key={definition.id}><span>{definitionName(definition)}</span><span>{definition.serving.label}</span></li>)}</ul></details>}
    </div>
  </section>;
}

export default MealSupplements;

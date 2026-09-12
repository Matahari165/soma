"use client";

import { useState, type FormEvent } from "react";

import type {
  SupplementCategory,
  SupplementDefinition,
  SupplementEntry,
} from "@/domain/supplements";

import styles from "./meal-supplements.module.css";

type DefinitionView = Omit<SupplementDefinition, "userId"> & { contributionScope: "micronutrients" | "protein" | "separate" };
type EntryView = Omit<SupplementEntry, "userId">;

export type MealSupplementsProps = {
  date: string;
  initialDefinitions: readonly DefinitionView[];
  initialEntries: readonly EntryView[];
  initialError?: string | null;
  className?: string;
};

const CATEGORY_LABELS: Record<SupplementCategory, string> = {
  vitamin_mineral: "Vitamines / minéraux",
  protein: "Protéines",
  creatine: "Créatine",
  caffeine: "Caféine",
  electrolyte: "Électrolytes",
  other: "Autre",
};

const UNIT_OPTIONS = ["g", "mg", "mcg", "capsule", "tablet", "scoop", "serving"] as const;

function definitionName(definition: DefinitionView) {
  return definition.brand ? `${definition.productName} · ${definition.brand}` : definition.productName;
}

function entryLabel(entry: EntryView) {
  if (entry.actual.status === "taken") return `Pris · ${entry.actual.servings ?? "—"} dose${entry.actual.servings === 1 ? "" : "s"}`;
  if (entry.actual.status === "skipped") return "Non pris";
  return "À renseigner";
}

async function requestJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => null) as T & { error?: string } | null;
  if (!response.ok) throw new Error(body?.error ?? "L’opération n’a pas pu être enregistrée.");
  return body as T;
}

export function MealSupplements({ date, initialDefinitions, initialEntries, initialError, className }: MealSupplementsProps) {
  const [definitions, setDefinitions] = useState<DefinitionView[]>([...initialDefinitions]);
  const [entries, setEntries] = useState<EntryView[]>([...initialEntries]);
  const [formOpen, setFormOpen] = useState(initialDefinitions.length === 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState<SupplementCategory>("other");
  const [servingQuantity, setServingQuantity] = useState("1");
  const [servingUnit, setServingUnit] = useState<(typeof UNIT_OPTIONS)[number]>("serving");
  const [servingLabel, setServingLabel] = useState("1 dose");

  async function recordIntake(definition: DefinitionView) {
    setBusy(`take-${definition.id}`);
    setError(null);
    setMessage(null);
    try {
      const body = await requestJson<{ entry: EntryView }>("/api/supplements/entries", {
        method: "POST",
        body: JSON.stringify({ entry: { definitionId: definition.id, entryDate: date, planned: { servings: 1 }, actual: { status: "taken", servings: 1, takenAt: new Date().toISOString(), note: null } } }),
      });
      setEntries((current) => [body.entry, ...current.filter((entry) => entry.id !== body.entry.id)]);
      setMessage(`${definition.productName} enregistré pour le ${date}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La prise n’a pas pu être enregistrée.");
    } finally {
      setBusy(null);
    }
  }

  async function createDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    setMessage(null);
    try {
      const body = await requestJson<{ definition: DefinitionView }>("/api/supplements", {
        method: "POST",
        body: JSON.stringify({ definition: {
          productName,
          brand: null,
          category,
          source: "personal_record",
          sourceReference: null,
          serving: { quantity: Number(servingQuantity), unit: servingUnit, label: servingLabel },
          nutrients: [],
          frequency: { kind: "daily", timesPerDay: 1 },
          notes: null,
        } }),
      });
      setDefinitions((current) => [body.definition, ...current]);
      setProductName("");
      setServingQuantity("1");
      setServingLabel("1 dose");
      setFormOpen(false);
      setMessage(`${body.definition.productName} ajouté à tes compléments.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le complément n’a pas pu être enregistré.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={[styles.root, className].filter(Boolean).join(" ")} aria-labelledby="meal-supplements-title">
      <header className={styles.header}>
        <div>
          <h2 id="meal-supplements-title">Compléments</h2>
        </div>
        <button className={styles.addButton} type="button" onClick={() => setFormOpen((open) => !open)} aria-expanded={formOpen} aria-controls="supplement-form">{formOpen ? "Fermer" : "Ajouter"}</button>
      </header>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p className={styles.message} role="status">{message}</p>}

      {formOpen && <form id="supplement-form" className={styles.form} onSubmit={createDefinition}>
        <label><span>Nom du produit</span><input required maxLength={160} value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Ex. Créatine monohydrate" /></label>
        <label><span>Catégorie</span><select value={category} onChange={(event) => setCategory(event.target.value as SupplementCategory)}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Quantité par prise</span><input required min="0.01" max="100000" step="any" type="number" inputMode="decimal" value={servingQuantity} onChange={(event) => setServingQuantity(event.target.value)} /></label>
        <label><span>Unité</span><select value={servingUnit} onChange={(event) => setServingUnit(event.target.value as (typeof UNIT_OPTIONS)[number])}>{UNIT_OPTIONS.map((unit) => <option value={unit} key={unit}>{unit}</option>)}</select></label>
        <label><span>Libellé de la prise</span><input required maxLength={120} value={servingLabel} onChange={(event) => setServingLabel(event.target.value)} placeholder="1 dose" /></label>
        <button className={styles.primaryButton} type="submit" disabled={busy !== null}>{busy === "create" ? "Enregistrement…" : "Enregistrer le complément"}</button>
      </form>}

      <div className={styles.body}>
        <section className={styles.definitions} aria-labelledby="supplement-list-title">
          <div className={styles.subheading}><h3 id="supplement-list-title">Ce que tu prends</h3><span>{definitions.length} produit{definitions.length === 1 ? "" : "s"}</span></div>
          {definitions.length ? <ul className={styles.definitionList}>{definitions.map((definition) => <li key={definition.id} className={styles.definitionRow}>
            <div className={styles.definitionInfo}><strong>{definitionName(definition)}</strong><span>{CATEGORY_LABELS[definition.category]} · {definition.serving.label}</span><small>{definition.contributionScope === "protein" ? "Contribue aux protéines" : definition.contributionScope === "micronutrients" ? "Contribue aux micronutriments" : "Suivi séparé"}</small></div>
            <button className={styles.takeButton} type="button" onClick={() => void recordIntake(definition)} disabled={busy !== null} aria-label={`Enregistrer ${definitionName(definition)} comme pris aujourd’hui`}>{busy === `take-${definition.id}` ? "…" : "Pris aujourd’hui"}</button>
          </li>)}</ul> : <p className={styles.empty}>Aucun complément renseigné.</p>}
        </section>

        <section className={styles.entries} aria-labelledby="supplement-today-title">
          <div className={styles.subheading}><h3 id="supplement-today-title">Prises du {date}</h3><span>{entries.length} enregistrée{entries.length === 1 ? "" : "s"}</span></div>
          {entries.length ? <ul className={styles.entryList}>{entries.map((entry) => <li key={entry.id}><span>{definitions.find((definition) => definition.id === entry.definitionId)?.productName ?? "Complément"}</span><strong data-status={entry.actual.status}>{entryLabel(entry)}</strong></li>)}</ul> : <p className={styles.empty}>Aucune prise enregistrée pour cette date.</p>}
        </section>
      </div>
    </section>
  );
}

export default MealSupplements;

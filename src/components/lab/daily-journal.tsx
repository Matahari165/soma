"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { JournalEntry, JournalEntryValue, JournalVariable, JournalVariableType } from "@/domain/lab/journal";

type DraftValue = JournalEntryValue | null;
type NewVariable = { name: string; variableType: JournalVariableType; unit: string; options: string };

const typeLabels: Record<JournalVariableType, string> = {
  boolean: "Oui / non",
  count: "Compteur",
  duration: "Durée",
  number: "Nombre",
  scale: "Échelle 1–5",
  category: "Catégorie",
  time: "Heure",
};

function formatEntryDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
}

function Field({ variable, value, onChange }: { variable: JournalVariable; value: DraftValue; onChange: (value: DraftValue) => void }) {
  if (variable.variableType === "boolean") return <div className="journal-choice" role="group" aria-label={variable.name}>{[{ label: "—", value: null }, { label: "Oui", value: true }, { label: "Non", value: false }].map((option) => <button type="button" className={value === option.value ? "is-selected" : ""} aria-pressed={value === option.value} onClick={() => onChange(option.value)} key={option.label}>{option.label}</button>)}</div>;
  if (variable.variableType === "scale") return <div className="journal-choice journal-choice--scale" role="group" aria-label={`${variable.name} de 1 à 5`}>{[1, 2, 3, 4, 5].map((option) => <button type="button" className={value === option ? "is-selected" : ""} aria-pressed={value === option} onClick={() => onChange(value === option ? null : option)} key={option}>{option}</button>)}</div>;
  if (variable.variableType === "category") return <select aria-label={variable.name} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)}><option value="">Non renseigné</option>{variable.options.map((option) => <option value={option} key={option}>{option}</option>)}</select>;
  if (variable.variableType === "time") return <input aria-label={variable.name} type="time" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />;
  return <div className="journal-number"><input aria-label={variable.name} type="number" min={variable.variableType === "count" || variable.variableType === "duration" ? 0 : undefined} step={variable.variableType === "count" ? 1 : "any"} value={typeof value === "number" || typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} /><span>{variable.unit}</span></div>;
}

function VariableManager({ variables }: { variables: JournalVariable[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editOptions, setEditOptions] = useState("");
  const [draft, setDraft] = useState<NewVariable>({ name: "", variableType: "boolean", unit: "", options: "" });
  const [error, setError] = useState<string | null>(null);

  async function request(method: "POST" | "PATCH", body: unknown, busy: string) {
    setBusyId(busy);
    setError(null);
    try {
      const response = await fetch("/api/lab/variables", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "La variable n’a pas pu être enregistrée.");
      router.refresh();
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "La variable n’a pas pu être enregistrée.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function create() {
    const ok = await request("POST", { name: draft.name, variableType: draft.variableType, unit: draft.unit || null, options: draft.variableType === "category" ? draft.options.split(",").map((value) => value.trim()).filter(Boolean) : [] }, "new");
    if (ok) { setDraft({ name: "", variableType: "boolean", unit: "", options: "" }); setCreating(false); }
  }

  function startEdit(variable: JournalVariable) {
    setEditingId(variable.id);
    setEditName(variable.name);
    setEditUnit(variable.unit ?? "");
    setEditOptions(variable.options.join(", "));
  }

  async function saveEdit(variable: JournalVariable) {
    const ok = await request("PATCH", { id: variable.id, name: editName, unit: editUnit || null, ...(variable.variableType === "category" ? { options: editOptions.split(",").map((value) => value.trim()).filter(Boolean) } : {}) }, variable.id);
    if (ok) setEditingId(null);
  }

  return <details className="journal-manager"><summary>Mesures suivies</summary><div className="journal-manager__body">
    <div className="journal-variable-list">{variables.filter((variable) => variable.isActive).map((variable) => editingId === variable.id ? <div className="journal-variable-edit" key={variable.id}><input aria-label="Nom de la variable" value={editName} onChange={(event) => setEditName(event.target.value)} /><input aria-label="Unité" placeholder="Unité facultative" value={editUnit} onChange={(event) => setEditUnit(event.target.value)} />{variable.variableType === "category" && <input aria-label="Choix séparés par des virgules" value={editOptions} onChange={(event) => setEditOptions(event.target.value)} />}<button type="button" onClick={() => void saveEdit(variable)} disabled={busyId === variable.id}>Enregistrer</button><button type="button" onClick={() => setEditingId(null)}>Annuler</button></div> : <div className="journal-variable-row" key={variable.id}><span><strong>{variable.name}</strong><small>{typeLabels[variable.variableType]}{variable.unit ? ` · ${variable.unit}` : ""}</small></span><button type="button" onClick={() => startEdit(variable)}>Modifier</button><button type="button" disabled={busyId === variable.id} onClick={() => void request("PATCH", { id: variable.id, isActive: false }, variable.id)}>Retirer</button></div>)}</div>
    {creating ? <div className="journal-new-variable"><input autoFocus placeholder="Nom, ex. Vacances" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><select aria-label="Type de variable" value={draft.variableType} onChange={(event) => setDraft((current) => ({ ...current, variableType: event.target.value as JournalVariableType }))}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{!["boolean", "scale", "category", "time"].includes(draft.variableType) && <input placeholder="Unité facultative" value={draft.unit} onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))} />}{draft.variableType === "category" && <input placeholder="Choix séparés par des virgules" value={draft.options} onChange={(event) => setDraft((current) => ({ ...current, options: event.target.value }))} />}<button className="primary-button" type="button" disabled={!draft.name.trim() || busyId === "new"} onClick={() => void create()}>{busyId === "new" ? <LoaderCircle className="spin" size={15} /> : null}Ajouter</button><button className="text-link" type="button" onClick={() => setCreating(false)}>Annuler</button></div> : <button className="secondary-button" type="button" onClick={() => setCreating(true)}>Ajouter une mesure</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div></details>;
}

export function DailyJournal({ variables, entries, entryDate }: { variables: JournalVariable[]; entries: JournalEntry[]; entryDate: string }) {
  const router = useRouter();
  const activeVariables = useMemo(() => variables.filter((variable) => variable.isActive), [variables]);
  const initial = useMemo(() => Object.fromEntries(activeVariables.map((variable) => [variable.id, entries.find((entry) => entry.variableId === variable.id)?.value ?? null])), [activeVariables, entries]);
  const [values, setValues] = useState<Record<string, DraftValue>>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(entries.length > 0);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/lab/entries", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryDate, entries: activeVariables.map((variable) => ({ variableId: variable.id, value: values[variable.id] ?? null })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Le journal n’a pas pu être enregistré.");
      setSaved(true);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Le journal n’a pas pu être enregistré.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="checkin-card journal-card" aria-labelledby="journal-title"><header><div><h2 id="journal-title">{formatEntryDate(entryDate)}</h2></div><span className={saved ? "checkin-state checkin-state--saved" : "checkin-state"}>{saved ? "Enregistré" : "À remplir"}</span></header>
    <div className="journal-grid">{activeVariables.map((variable) => <div className="journal-field" key={variable.id}><span>{variable.name}</span><Field variable={variable} value={values[variable.id] ?? null} onChange={(value) => { setValues((current) => ({ ...current, [variable.id]: value })); setSaved(false); }} /></div>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="journal-actions"><button className="primary-button" type="button" onClick={() => void save()} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} />Enregistrement…</> : "Enregistrer"}</button></div>
    <VariableManager variables={variables} />
  </section>;
}

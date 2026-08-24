"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  journalDayPeriod,
  journalDayPeriods,
  journalFieldHint,
  journalVariableSuggestions,
  type JournalEntry,
  type JournalEntryValue,
  type JournalVariable,
  type JournalVariableType,
} from "@/domain/lab/journal";

type DraftValue = JournalEntryValue | null;
type NewVariable = { name: string; variableType: JournalVariableType; unit: string; options: string };

const typeLabels: Record<JournalVariableType, string> = {
  boolean: "Yes / no",
  count: "Count",
  duration: "Duration",
  number: "Number",
  scale: "Scale 1–5",
  category: "Category",
  time: "Time",
};

const numericTypes = new Set<JournalVariableType>(["count", "duration", "number", "scale"]);

function formatEntryDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
}

function splitOptions(value: string) {
  return value.split(",").map((option) => option.trim()).filter(Boolean);
}

function suggestionDraft(suggestion: (typeof journalVariableSuggestions)[number]): NewVariable {
  return {
    name: suggestion.name,
    variableType: suggestion.variableType,
    unit: suggestion.unit ?? "",
    options: suggestion.options.join(", "),
  };
}

function Field({ variable, value, onChange }: { variable: JournalVariable; value: DraftValue; onChange: (value: DraftValue) => void }) {
  const inputId = `journal-${variable.id}`;

  if (variable.variableType === "boolean") {
    return <div className="journal-choice" role="group" aria-label={variable.name}>
      {[{ label: "—", value: null }, { label: "Yes", value: true }, { label: "No", value: false }].map((option) => <button type="button" className={value === option.value ? "is-selected" : ""} aria-pressed={value === option.value} onClick={() => onChange(option.value)} key={option.label}>{option.label}</button>)}
    </div>;
  }

  if (variable.variableType === "scale") {
    return <div className="journal-choice journal-choice--scale" role="group" aria-label={`${variable.name}, from 1 to 5`}>
      {[1, 2, 3, 4, 5].map((option) => <button type="button" className={value === option ? "is-selected" : ""} aria-pressed={value === option} onClick={() => onChange(value === option ? null : option)} key={option}>{option}</button>)}
    </div>;
  }

  if (variable.variableType === "category") {
    return <select id={inputId} aria-label={variable.name} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">Not recorded</option>
      {variable.options.map((option) => <option value={option} key={option}>{option}</option>)}
    </select>;
  }

  if (variable.variableType === "time") {
    return <input id={inputId} aria-label={variable.name} type="time" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />;
  }

  return <div className="journal-number"><input id={inputId} aria-label={variable.name} type="number" min={variable.variableType === "count" || variable.variableType === "duration" ? 0 : undefined} step={variable.variableType === "count" ? 1 : "any"} value={typeof value === "number" || typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} /><span>{variable.unit}</span></div>;
}

function VariableEditor({ variable, name, unit, options, busy, onNameChange, onUnitChange, onOptionsChange, onSave, onCancel }: {
  variable: JournalVariable;
  name: string;
  unit: string;
  options: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onUnitChange: (value: string) => void;
  onOptionsChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return <div className="journal-variable-edit">
    <label>
      <span>Name</span>
      <input aria-label="Measure name" value={name} onChange={(event) => onNameChange(event.target.value)} />
    </label>
    {numericTypes.has(variable.variableType) && <label>
      <span>Unit</span>
      <input aria-label="Optional unit" placeholder="Optional" value={unit} onChange={(event) => onUnitChange(event.target.value)} />
    </label>}
    {variable.variableType === "category" && <label>
      <span>Choices</span>
      <input aria-label="Choices separated by commas" placeholder="e.g. Home, Office" value={options} onChange={(event) => onOptionsChange(event.target.value)} />
    </label>}
    <span className="journal-variable-edit__type">{typeLabels[variable.variableType]}</span>
    <div className="journal-variable-edit__actions">
      <button type="button" onClick={onSave} disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Save</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

function VariableManager({ variables }: { variables: JournalVariable[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editOptions, setEditOptions] = useState("");
  const [draft, setDraft] = useState<NewVariable>({ name: "", variableType: "boolean", unit: "", options: "" });
  const [error, setError] = useState<string | null>(null);
  const activeVariables = variables.filter((variable) => variable.isActive);
  const activeNames = new Set(activeVariables.map((variable) => variable.name.toLocaleLowerCase("en")));
  const suggestions = journalVariableSuggestions.filter((suggestion) => !activeNames.has(suggestion.name.toLocaleLowerCase("en")));

  async function request(method: "POST" | "PATCH", body: unknown, busy: string) {
    setBusyId(busy);
    setError(null);
    try {
      const response = await fetch("/api/lab/variables", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "This measure could not be saved.");
      router.refresh();
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "This measure could not be saved.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function create() {
    const options = draft.variableType === "category" ? splitOptions(draft.options) : [];
    const ok = await request("POST", { name: draft.name, variableType: draft.variableType, unit: numericTypes.has(draft.variableType) ? draft.unit || null : null, options }, "new");
    if (ok) {
      setDraft({ name: "", variableType: "boolean", unit: "", options: "" });
      setCreating(false);
    }
  }

  function startEdit(variable: JournalVariable) {
    setEditingId(variable.id);
    setEditName(variable.name);
    setEditUnit(variable.unit ?? "");
    setEditOptions(variable.options.join(", "));
    setError(null);
  }

  async function saveEdit(variable: JournalVariable) {
    const ok = await request("PATCH", { id: variable.id, name: editName, unit: numericTypes.has(variable.variableType) ? editUnit || null : null, ...(variable.variableType === "category" ? { options: splitOptions(editOptions) } : {}) }, variable.id);
    if (ok) setEditingId(null);
  }

  const categoryOptions = splitOptions(draft.options);
  const canCreate = draft.name.trim().length > 0 && (draft.variableType !== "category" || categoryOptions.length >= 2);

  if (!open) {
    return <div className="journal-manager journal-manager--closed"><button className="text-link" type="button" onClick={() => setOpen(true)}>Manage journal fields</button></div>;
  }

  return <section className="journal-manager" aria-labelledby="journal-manager-title">
    <div className="journal-manager__header">
      <div>
        <h3 id="journal-manager-title">Journal fields</h3>
        <p>Add the habits or context you want to compare with your health data.</p>
      </div>
      <div className="journal-manager__header-actions">
        {!creating && <button className="secondary-button" type="button" onClick={() => { setCreating(true); setError(null); }}>Add a measure</button>}
        <button className="text-link" type="button" onClick={() => { setOpen(false); setCreating(false); setEditingId(null); }}>Done</button>
      </div>
    </div>

    <div className="journal-manager__body">
      {!creating && suggestions.length > 0 && <div className="journal-suggestions" aria-label="Suggested measures">
        {suggestions.map((suggestion) => <button type="button" key={suggestion.name} onClick={() => {
          setDraft(suggestionDraft(suggestion));
          setCreating(true);
          setError(null);
        }}><strong>{suggestion.name}</strong><span>{suggestion.unit ?? typeLabels[suggestion.variableType]}</span></button>)}
      </div>}
      <div className="journal-variable-list" aria-live="polite">
        {activeVariables.length === 0 && <p className="journal-manager__empty">No measures yet.</p>}
        {activeVariables.map((variable) => editingId === variable.id ? <VariableEditor key={variable.id} variable={variable} name={editName} unit={editUnit} options={editOptions} busy={busyId === variable.id} onNameChange={setEditName} onUnitChange={setEditUnit} onOptionsChange={setEditOptions} onSave={() => void saveEdit(variable)} onCancel={() => setEditingId(null)} /> : <div className="journal-variable-row" key={variable.id}>
          <span><strong>{variable.name}</strong><small>{typeLabels[variable.variableType]}{variable.unit ? ` · ${variable.unit}` : ""}{variable.variableType === "category" && variable.options.length ? ` · ${variable.options.join(", ")}` : ""}</small></span>
          <button type="button" onClick={() => startEdit(variable)}>Edit</button>
          <button type="button" disabled={busyId === variable.id} title={`Remove ${variable.name} from your daily journal`} onClick={() => void request("PATCH", { id: variable.id, isActive: false }, variable.id)}>{busyId === variable.id ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Remove</button>
        </div>)}
      </div>

      {creating && <div className="journal-new-variable">
        <div className="journal-new-variable__heading"><h4>Add a tracked measure</h4><p>Leave it blank on any day you do not want to record; it will stay missing.</p></div>
        <label><span>Name</span><input placeholder="e.g. Alcohol, Vacation, Deep work" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span>Measure type</span><select aria-label="Measure type" value={draft.variableType} onChange={(event) => setDraft((current) => ({ ...current, variableType: event.target.value as JournalVariableType }))}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {numericTypes.has(draft.variableType) && <label><span>Unit <em>(optional)</em></span><input placeholder="e.g. mg, min, drinks" value={draft.unit} onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))} /></label>}
        {draft.variableType === "category" && <label><span>Choices <em>(at least two)</em></span><input placeholder="e.g. Home, Office, Vacation" value={draft.options} onChange={(event) => setDraft((current) => ({ ...current, options: event.target.value }))} /></label>}
        {draft.variableType === "category" && categoryOptions.length < 2 && <p className="journal-manager__hint">Add at least two comma-separated choices.</p>}
        <div className="journal-new-variable__actions"><button className="primary-button" type="button" disabled={!canCreate || busyId === "new"} onClick={() => void create()}>{busyId === "new" ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Add measure</button><button className="text-link" type="button" onClick={() => setCreating(false)}>Cancel</button></div>
      </div>}

      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </section>;
}

function JournalFieldRow({ variable, value, onChange }: { variable: JournalVariable; value: DraftValue; onChange: (value: DraftValue) => void }) {
  const hint = journalFieldHint(variable);
  const label = <>{variable.name}{hint && <small>{hint}</small>}</>;
  return <div className="journal-field">
    {variable.variableType === "boolean" || variable.variableType === "scale"
      ? <span className="journal-field__label">{label}</span>
      : <label className="journal-field__label" htmlFor={`journal-${variable.id}`}>{label}</label>}
    <Field variable={variable} value={value} onChange={onChange} />
  </div>;
}

export function DailyJournal({ variables, entries, entryDate }: { variables: JournalVariable[]; entries: JournalEntry[]; entryDate: string }) {
  const router = useRouter();
  const activeVariables = useMemo(() => variables.filter((variable) => variable.isActive).sort((first, second) => first.position - second.position), [variables]);
  const sections = useMemo(() => journalDayPeriods.map((period) => ({
    ...period,
    variables: activeVariables.filter((variable) => journalDayPeriod(variable.position) === period.id),
  })).filter((period) => period.variables.length > 0), [activeVariables]);
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
      if (!response.ok) throw new Error(result.error ?? "Your journal could not be saved.");
      setSaved(true);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Your journal could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="checkin-card journal-card" aria-labelledby="journal-title"><header><div><span className="eyebrow">Daily journal</span><h2 id="journal-title">{formatEntryDate(entryDate)}</h2><p>Record yesterday’s habits and context. Empty fields are left out of analysis.</p></div><span className={saved ? "checkin-state checkin-state--saved" : "checkin-state"}>{saved ? "Saved" : "To fill in"}</span></header>
    {activeVariables.length > 0 ? <div className="journal-sections">{sections.map((section) => <section className="journal-period" aria-labelledby={`journal-${section.id}-title`} key={section.id}>
      <h3 id={`journal-${section.id}-title`}>{section.label}</h3>
      <div className="journal-grid">{section.variables.map((variable) => <JournalFieldRow variable={variable} value={values[variable.id] ?? null} onChange={(value) => { setValues((current) => ({ ...current, [variable.id]: value })); setSaved(false); }} key={variable.id} />)}</div>
    </section>)}</div> : <p className="journal-empty">Add your first tracked measure below.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="journal-actions"><button className="primary-button" type="button" onClick={() => void save()} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} aria-hidden="true" />Saving…</> : "Save journal"}</button></div>
    <VariableManager variables={variables} />
  </section>;
}

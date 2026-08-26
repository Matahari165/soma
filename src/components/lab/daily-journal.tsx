"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import {
  journalDayPeriod,
  journalDayPeriods,
  journalFieldHint,
  journalVariableSuggestions,
  type JournalEntry,
  type JournalEntryValue,
  type JournalDay,
  type JournalDayPeriod,
  type JournalVariable,
  type JournalVariableType,
} from "@/domain/lab/journal";

type DraftValue = JournalEntryValue | null;
type NewVariable = { name: string; variableType: JournalVariableType; unit: string; options: string; emoji: string; dayPeriod: JournalDayPeriod; defaultValue: string };

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
    emoji: "🧪",
    dayPeriod: "day",
    defaultValue: suggestion.variableType === "boolean" ? "false" : "0",
  };
}

function Field({ variable, value, onChange, disabled = false }: { variable: JournalVariable; value: DraftValue; onChange: (value: DraftValue) => void; disabled?: boolean }) {
  const inputId = `journal-${variable.id}`;

  if (variable.variableType === "boolean") {
    return <div className="journal-choice" role="group" aria-label={variable.name}>
      {[{ label: "—", value: null }, { label: "Yes", value: true }, { label: "No", value: false }].map((option) => <button type="button" disabled={disabled} className={value === option.value ? "is-selected" : ""} aria-pressed={value === option.value} onClick={() => onChange(option.value)} key={option.label}>{option.label}</button>)}
    </div>;
  }

  if (variable.variableType === "scale") {
    return <div className="journal-choice journal-choice--scale" role="group" aria-label={`${variable.name}, from 1 to 5`}>
      {[1, 2, 3, 4, 5].map((option) => <button type="button" disabled={disabled} className={value === option ? "is-selected" : ""} aria-pressed={value === option} onClick={() => onChange(value === option ? null : option)} key={option}>{option}</button>)}
    </div>;
  }

  if (variable.variableType === "category") {
    return <select disabled={disabled} id={inputId} aria-label={variable.name} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">Not recorded</option>
      {variable.options.map((option) => <option value={option} key={option}>{option}</option>)}
    </select>;
  }

  if (variable.variableType === "time") {
    return <input disabled={disabled} id={inputId} aria-label={variable.name} type="time" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />;
  }

  const nonNegative = variable.variableType === "count" || variable.variableType === "duration" || ["caffeine", "added sugar", "magnesium"].includes(variable.name.toLocaleLowerCase("en"));
  return <div className="journal-number"><input disabled={disabled} id={inputId} aria-label={variable.name} type="number" min={nonNegative ? 0 : undefined} step={variable.variableType === "count" ? 1 : "any"} value={typeof value === "number" || typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} /><span>{variable.unit}</span></div>;
}

function VariableEditor({ variableType, name, unit, options, emoji, dayPeriod, defaultValue, busy, onNameChange, onTypeChange, onUnitChange, onOptionsChange, onEmojiChange, onDayPeriodChange, onDefaultValueChange, onSave, onCancel }: {
  variableType: JournalVariableType;
  name: string;
  unit: string;
  options: string;
  emoji: string;
  dayPeriod: JournalDayPeriod;
  defaultValue: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onTypeChange: (value: JournalVariableType) => void;
  onUnitChange: (value: string) => void;
  onOptionsChange: (value: string) => void;
  onEmojiChange: (value: string) => void;
  onDayPeriodChange: (value: JournalDayPeriod) => void;
  onDefaultValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return <div className="journal-variable-edit">
    <label>
      <span>Name</span>
      <input aria-label="Measure name" value={name} onChange={(event) => onNameChange(event.target.value)} />
    </label>
    <label><span>Emoji</span><input aria-label="Measure emoji" maxLength={8} value={emoji} onChange={(event) => onEmojiChange(event.target.value)} /></label>
    <label><span>Type</span><select aria-label="Measure type" value={variableType} onChange={(event) => onTypeChange(event.target.value as JournalVariableType)}>{Object.entries(typeLabels).filter(([value]) => ["boolean", "number", "count", "time", "scale", variableType].includes(value)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <label><span>Moment</span><select aria-label="Measure moment" value={dayPeriod} onChange={(event) => onDayPeriodChange(event.target.value as JournalDayPeriod)}>{journalDayPeriods.map((period) => <option value={period.id} key={period.id}>{period.label}</option>)}</select></label>
    {numericTypes.has(variableType) && <label>
      <span>Unit</span>
      <input aria-label="Optional unit" placeholder="Optional" value={unit} onChange={(event) => onUnitChange(event.target.value)} />
    </label>}
    {variableType === "category" && <label>
      <span>Choices</span>
      <input aria-label="Choices separated by commas" placeholder="e.g. Home, Office" value={options} onChange={(event) => onOptionsChange(event.target.value)} />
    </label>}
    {variableType === "boolean" ? <label><span>Default</span><select aria-label="Measure default" value={defaultValue} onChange={(event) => onDefaultValueChange(event.target.value)}><option value="">Not recorded</option><option value="false">No</option><option value="true">Yes</option></select></label> : variableType !== "category" && <label><span>Default</span><input aria-label="Measure default" type={variableType === "time" ? "time" : "number"} value={defaultValue} onChange={(event) => onDefaultValueChange(event.target.value)} /></label>}
    <div className="journal-variable-edit__actions">
      <button type="button" onClick={onSave} disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Save</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

function VariableManager({ variables, open, onClose }: { variables: JournalVariable[]; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editVariableType, setEditVariableType] = useState<JournalVariableType>("boolean");
  const [editUnit, setEditUnit] = useState("");
  const [editOptions, setEditOptions] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editDayPeriod, setEditDayPeriod] = useState<JournalDayPeriod>("day");
  const [editDefaultValue, setEditDefaultValue] = useState("");
  const [draft, setDraft] = useState<NewVariable>({ name: "", variableType: "boolean", unit: "", options: "", emoji: "🧪", dayPeriod: "day", defaultValue: "false" });
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
    const defaultValue = draft.defaultValue === "" ? null : draft.variableType === "boolean" ? draft.defaultValue === "true" : draft.variableType === "time" ? draft.defaultValue : Number(draft.defaultValue);
    const ok = await request("POST", { name: draft.name, variableType: draft.variableType, unit: numericTypes.has(draft.variableType) ? draft.unit || null : null, options, emoji: draft.emoji || "🧪", dayPeriod: draft.dayPeriod, defaultValue }, "new");
    if (ok) {
      setDraft({ name: "", variableType: "boolean", unit: "", options: "", emoji: "🧪", dayPeriod: "day", defaultValue: "false" });
      setCreating(false);
    }
  }

  function startEdit(variable: JournalVariable) {
    setEditingId(variable.id);
    setEditName(variable.name);
    setEditVariableType(variable.variableType);
    setEditUnit(variable.unit ?? "");
    setEditOptions(variable.options.join(", "));
    setEditEmoji(variable.emoji);
    setEditDayPeriod(variable.dayPeriod);
    setEditDefaultValue(variable.defaultValue === null ? "" : String(variable.defaultValue));
    setError(null);
  }

  async function saveEdit(variable: JournalVariable) {
    const defaultValue = editDefaultValue === "" ? null : editVariableType === "boolean" ? editDefaultValue === "true" : editVariableType === "time" || editVariableType === "category" ? editDefaultValue : Number(editDefaultValue);
    const ok = await request("PATCH", { id: variable.id, name: editName, ...(editVariableType !== variable.variableType ? { variableType: editVariableType } : {}), emoji: editEmoji || "🧪", dayPeriod: editDayPeriod, defaultValue, unit: numericTypes.has(editVariableType) ? editUnit || null : null, ...(editVariableType === "category" ? { options: splitOptions(editOptions) } : {}) }, variable.id);
    if (ok) setEditingId(null);
  }

  const categoryOptions = splitOptions(draft.options);
  const canCreate = draft.name.trim().length > 0 && (draft.variableType !== "category" || categoryOptions.length >= 2);

  if (!open) return null;

  return <section className="journal-manager" aria-labelledby="journal-manager-title">
    <div className="journal-manager__header">
      <div>
        <h3 id="journal-manager-title">Journal fields</h3>
        <p>Add the habits or context you want to compare with your health data.</p>
      </div>
      <div className="journal-manager__header-actions">
        {!creating && <button className="secondary-button" type="button" onClick={() => { setCreating(true); setError(null); }}>Add a measure</button>}
        <button className="text-link" type="button" onClick={() => { onClose(); setCreating(false); setEditingId(null); }}>Done</button>
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
        {activeVariables.map((variable) => editingId === variable.id ? <VariableEditor key={variable.id} variableType={editVariableType} name={editName} unit={editUnit} options={editOptions} emoji={editEmoji} dayPeriod={editDayPeriod} defaultValue={editDefaultValue} busy={busyId === variable.id} onNameChange={setEditName} onTypeChange={(value) => { setEditVariableType(value); setEditDefaultValue(value === "boolean" ? "false" : value === "time" || value === "scale" ? "" : "0"); }} onUnitChange={setEditUnit} onOptionsChange={setEditOptions} onEmojiChange={setEditEmoji} onDayPeriodChange={setEditDayPeriod} onDefaultValueChange={setEditDefaultValue} onSave={() => void saveEdit(variable)} onCancel={() => setEditingId(null)} /> : <div className="journal-variable-row" key={variable.id}>
          <span><strong>{variable.emoji} {variable.name}</strong><small>{typeLabels[variable.variableType]}{variable.unit ? ` · ${variable.unit}` : ""} · {journalDayPeriods.find((period) => period.id === variable.dayPeriod)?.label}{variable.defaultValue !== null ? ` · default ${String(variable.defaultValue)}` : ""}</small></span>
          <button type="button" aria-label={`Move ${variable.name} earlier`} disabled={busyId === variable.id} onClick={() => void request("PATCH", { id: variable.id, position: Math.max(0, variable.position - 15) }, variable.id)}>↑</button>
          <button type="button" aria-label={`Move ${variable.name} later`} disabled={busyId === variable.id} onClick={() => void request("PATCH", { id: variable.id, position: variable.position + 15 }, variable.id)}>↓</button>
          <button type="button" onClick={() => startEdit(variable)}>Edit</button>
          <button type="button" disabled={busyId === variable.id} title={`Remove ${variable.name} from your daily journal`} onClick={() => void request("PATCH", { id: variable.id, isActive: false }, variable.id)}>{busyId === variable.id ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Remove</button>
        </div>)}
      </div>

      {creating && <div className="journal-new-variable">
        <div className="journal-new-variable__heading"><h4>Add a tracked measure</h4><p>Leave it blank on any day you do not want to record; it will stay missing.</p></div>
        <label><span>Name</span><input placeholder="e.g. Alcohol, Vacation, Deep work" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span>Emoji</span><input aria-label="Emoji" maxLength={8} value={draft.emoji} onChange={(event) => setDraft((current) => ({ ...current, emoji: event.target.value }))} /></label>
        <label><span>Measure type</span><select aria-label="Measure type" value={draft.variableType} onChange={(event) => {
          const variableType = event.target.value as JournalVariableType;
          setDraft((current) => ({ ...current, variableType, defaultValue: variableType === "boolean" ? "false" : variableType === "time" || variableType === "scale" ? "" : "0" }));
        }}>{Object.entries(typeLabels).filter(([value]) => ["boolean", "number", "count", "time", "scale"].includes(value)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Moment</span><select aria-label="Time of day" value={draft.dayPeriod} onChange={(event) => setDraft((current) => ({ ...current, dayPeriod: event.target.value as JournalDayPeriod }))}>{journalDayPeriods.map((period) => <option value={period.id} key={period.id}>{period.label}</option>)}</select></label>
        {draft.variableType === "boolean" ? <label><span>Default</span><select aria-label="Default value" value={draft.defaultValue} onChange={(event) => setDraft((current) => ({ ...current, defaultValue: event.target.value }))}><option value="">Not recorded</option><option value="false">No</option><option value="true">Yes</option></select></label> : <label><span>Default</span><input aria-label="Default value" type={draft.variableType === "time" ? "time" : "number"} value={draft.defaultValue} onChange={(event) => setDraft((current) => ({ ...current, defaultValue: event.target.value }))} /></label>}
        {numericTypes.has(draft.variableType) && <label><span>Unit <em>(optional)</em></span><input placeholder="e.g. mg, min, drinks" value={draft.unit} onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))} /></label>}
        {draft.variableType === "category" && <label><span>Choices <em>(at least two)</em></span><input placeholder="e.g. Home, Office, Vacation" value={draft.options} onChange={(event) => setDraft((current) => ({ ...current, options: event.target.value }))} /></label>}
        {draft.variableType === "category" && categoryOptions.length < 2 && <p className="journal-manager__hint">Add at least two comma-separated choices.</p>}
        <div className="journal-new-variable__actions"><button className="primary-button" type="button" disabled={!canCreate || busyId === "new"} onClick={() => void create()}>{busyId === "new" ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Add measure</button><button className="text-link" type="button" onClick={() => setCreating(false)}>Cancel</button></div>
      </div>}

      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </section>;
}

function JournalFieldRow({ variable, value, onChange, disabled }: { variable: JournalVariable; value: DraftValue; onChange: (value: DraftValue) => void; disabled: boolean }) {
  const hint = journalFieldHint(variable);
  const label = <>{variable.name}{hint && <small>{hint}</small>}</>;
  return <div className="journal-field"><span className="journal-field__emoji" aria-hidden="true">{variable.emoji}</span>
    {variable.variableType === "boolean" || variable.variableType === "scale"
      ? <span className="journal-field__label">{label}</span>
      : <label className="journal-field__label" htmlFor={`journal-${variable.id}`}>{label}</label>}
    <Field variable={variable} value={value} onChange={onChange} disabled={disabled} />
  </div>;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function DailyJournal({ variables, entries, days, todayDate }: { variables: JournalVariable[]; entries: JournalEntry[]; days: JournalDay[]; todayDate: string }) {
  const router = useRouter();
  const activeVariables = useMemo(() => variables.filter((variable) => variable.isActive).sort((first, second) => first.position - second.position), [variables]);
  const sections = useMemo(() => journalDayPeriods.map((period) => ({
    ...period,
    variables: activeVariables.filter((variable) => (variable.dayPeriod ?? journalDayPeriod(variable.position)) === period.id),
  })).filter((period) => period.variables.length > 0), [activeVariables]);
  const availableDates = useMemo(() => Array.from({ length: 5 }, (_, index) => addDays(todayDate, -index)), [todayDate]);
  const [entryDate, setEntryDate] = useState(todayDate);
  const selectedDate = useRef(todayDate);
  const valuesForDate = (date: string) => {
    const omitted = new Set(days.find((candidate) => candidate.entryDate === date)?.omittedVariableIds ?? []);
    return Object.fromEntries(activeVariables.map((variable) => [variable.id, omitted.has(variable.id) ? null : entries.find((entry) => entry.entryDate === date && entry.variableId === variable.id)?.value ?? variable.defaultValue ?? null]));
  };
  const [values, setValues] = useState<Record<string, DraftValue>>(() => valuesForDate(todayDate));
  const drafts = useRef<Record<string, Record<string, DraftValue>>>({ [todayDate]: valuesForDate(todayDate) });
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const day = days.find((candidate) => candidate.entryDate === entryDate);
  const validated = day?.status === "validated";

  async function persist(date: string, mode: "draft" | "validate", draftValues: Record<string, DraftValue>) {
    const response = await fetch("/api/lab/entries", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryDate: date, mode, entries: activeVariables.map((variable) => ({ variableId: variable.id, value: draftValues[variable.id] ?? null })) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Your journal could not be saved.");
  }

  function queueDraft(date: string, draftValues: Record<string, DraftValue>) {
    setState("saving");
    setError(null);
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => persist(date, "draft", draftValues))
      .then(() => {
        if (date === selectedDate.current) {
          setState("saved");
          if (days.find((candidate) => candidate.entryDate === date)?.status === "validated") router.refresh();
        }
      })
      .catch((saveError) => {
        if (date === selectedDate.current) {
          setState("idle");
          setError(saveError instanceof Error ? saveError.message : "Your journal could not be saved.");
        }
      });
  }

  async function validate() {
    setSaving(true);
    setState("saving");
    setError(null);
    try {
      await saveQueue.current;
      await persist(entryDate, "validate", drafts.current[entryDate] ?? values);
      setState("saved");
      router.refresh();
    } catch (saveError) {
      setState("idle");
      setError(saveError instanceof Error ? saveError.message : "This day could not be validated.");
    } finally {
      setSaving(false);
    }
  }

  function changeDate(date: string) {
    selectedDate.current = date;
    setEntryDate(date);
    const next = drafts.current[date] ?? valuesForDate(date);
    drafts.current[date] = next;
    setValues(next);
    setState("idle");
    setError(null);
  }

  function changeValue(variableId: string, value: DraftValue) {
    const next = { ...(drafts.current[entryDate] ?? values), [variableId]: value };
    drafts.current[entryDate] = next;
    setValues(next);
    queueDraft(entryDate, next);
  }

  return <section className="checkin-card journal-card" aria-labelledby="journal-title"><header><h2 id="journal-title">Journal <span aria-hidden="true">·</span> {formatEntryDate(entryDate)}</h2><div className="journal-card__actions" role="group" aria-label="Journal actions">
    <span className={validated || state === "saved" ? "checkin-state checkin-state--saved" : "checkin-state"}>{state === "saving" ? "Saving" : validated ? "Validated" : state === "saved" ? "Draft saved" : "Draft"}</span>
    {!validated && <button className="primary-button" type="button" onClick={() => void validate()} disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} aria-hidden="true" />Saving…</> : "Validate day"}</button>}
    {!managerOpen && <button className="text-link" type="button" onClick={() => setManagerOpen(true)}>Manage journal fields</button>}
  </div></header>
    <nav className="journal-date-strip" aria-label="Journal date">{availableDates.map((date, index) => <button type="button" aria-current={date === entryDate ? "date" : undefined} onClick={() => changeDate(date)} key={date}><span>{index === 0 ? "Today" : new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(`${date}T12:00:00`))}</span><small>{date.slice(8)}</small></button>)}</nav>
    {activeVariables.length > 0 ? <div className="journal-sections">{sections.map((section) => <section className="journal-period" aria-labelledby={`journal-${section.id}-title`} key={section.id}>
      <h3 id={`journal-${section.id}-title`}>{section.label}</h3>
      <div className="journal-grid">{section.variables.map((variable) => <JournalFieldRow variable={variable} value={values[variable.id] ?? null} disabled={false} onChange={(value) => changeValue(variable.id, value)} key={variable.id} />)}</div>
    </section>)}</div> : <p className="journal-empty">Add your first tracked measure below.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {validated && <p className="journal-save-note" role="status">Changes save automatically and remain included in your relationships.</p>}
    <VariableManager variables={variables} open={managerOpen} onClose={() => setManagerOpen(false)} />
  </section>;
}

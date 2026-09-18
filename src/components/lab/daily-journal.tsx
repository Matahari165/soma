"use client";

import { CircleCheck, CircleDashed, CircleMinus, ImagePlus, LoaderCircle, PencilLine, ScanLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import {
  journalAutomaticSource,
  journalAutomaticSources,
  journalDayPeriods,
  journalDraftsForDates,
  journalEntriesForSave,
  journalValuesForDate,
  dinnerTimeForDisplay,
  isDinnerTimeVariable,
  normalizeDinnerTimeInput,
  reconcileJournalDrafts,
  journalVariableSuggestions,
  updateJournalDraft,
  type JournalCaptureMode,
  type JournalDraftsByDate,
  type JournalEntry,
  type JournalEntryValue,
  type JournalDay,
  type JournalDayPeriod,
  type JournalVariable,
  type JournalVariableType,
  type JournalTrackingCadence,
} from "@/domain/lab/journal";
import { JOURNAL_ACHIEVEMENT_WINDOW_DAYS, type JournalAchievement } from "@/domain/lab/journal-achievement";

import { localizedMetricLabel, localizedMetricUnit } from "./lab-copy";

type DraftValue = JournalEntryValue | null;
type NewVariable = { name: string; variableType: JournalVariableType; unit: string; options: string; emoji: string; dayPeriod: JournalDayPeriod; defaultValue: string; captureMode: JournalCaptureMode; automaticMetricId: string | null; trackingCadence: JournalTrackingCadence };

const typeLabels: Record<JournalVariableType, string> = {
  boolean: "Yes / No",
  count: "Counter",
  duration: "Duration",
  number: "Number",
  scale: "Scale 1–5",
  category: "Category",
  time: "Time",
};

const dayPeriodLabels: Record<JournalDayPeriod, string> = {
  context: "Day context",
  morning: "Morning",
  day: "Daytime",
  evening: "Evening",
  sleep: "Before sleep",
  other: "Other",
};

function journalVariableKey(name: string) {
  return name.trim().toLocaleLowerCase("en");
}

function journalVariableLabel(variable: Pick<JournalVariable, "name"> | Pick<NewVariable, "name">) {
  return localizedMetricLabel(`journal:${variable.name}`, variable.name);
}

function journalVariableUnit(variable: Pick<JournalVariable, "unit">) {
  if (!variable.unit) return variable.unit;
  return localizedMetricUnit(variable.unit);
}

function dayPeriodLabel(period: JournalDayPeriod) {
  return dayPeriodLabels[period];
}

const journalDisplayOrder: JournalDayPeriod[] = ["morning", "day", "evening", "context", "other"];
const editableJournalDayPeriods = journalDayPeriods.filter((period) => period.id !== "sleep");

const numericTypes = new Set<JournalVariableType>(["count", "duration", "number", "scale"]);
const textNumericTypes = new Set<JournalVariableType>(["count", "duration", "number"]);
type JournalSaveStatus = "draft" | "saving" | "saved" | "error";
export type JournalStatusTreatment = "v1" | "v2" | "v3";

export function journalStatusText({ validated, validating, saveStatus }: { validated: boolean; validating: boolean; saveStatus: JournalSaveStatus }) {
  if (validating) return "Validating…";
  if (saveStatus === "saving") return "Saving…";
  if (saveStatus === "error") return "Save failed";
  if (validated) return "Day validated";
  if (saveStatus === "saved") return "Draft saved";
  return "Local draft";
}

function splitOptions(value: string) {
  return value.split(",").map((option) => option.trim()).filter(Boolean);
}

function displayedDayPeriod(variable: JournalVariable) {
  if (journalVariableKey(variable.name) === "magnesium") return "morning";
  return variable.dayPeriod === "sleep" ? "evening" : variable.dayPeriod;
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
    captureMode: "manual",
    automaticMetricId: null,
    trackingCadence: "daily",
  };
}

function DinnerTimeInput({ inputId, value, disabled, onChange }: { inputId: string; value: DraftValue; disabled: boolean; onChange: (value: DraftValue) => void }) {
  const canonicalValue = typeof value === "string" ? value : "";
  const [displayHour = "", displayMinute = ""] = dinnerTimeForDisplay(canonicalValue).split(":");
  const [hour, setHour] = useState(displayHour);
  const [minute, setMinute] = useState(displayMinute);
  const [invalid, setInvalid] = useState(false);
  const minuteRef = useRef<HTMLInputElement>(null);
  const errorId = `${inputId}-error`;

  function commit() {
    if (!hour && !minute) {
      setInvalid(false);
      onChange(null);
      return;
    }
    const normalized = normalizeDinnerTimeInput(`${hour}:${minute}`);
    if (!normalized) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const [nextHour, nextMinute] = dinnerTimeForDisplay(normalized).split(":");
    setHour(nextHour);
    setMinute(nextMinute);
    onChange(normalized);
  }

  function digits(value: string, maximumLength: number) {
    return value.replace(/\D/g, "").slice(0, maximumLength);
  }

  return <div className={`journal-clock${invalid ? " journal-clock--invalid" : ""}`} id={inputId} role="group" aria-label="Dinner end time" aria-describedby={invalid ? errorId : undefined} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit();
  }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }}>
    <input disabled={disabled} aria-label="Dinner end time" aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} inputMode="numeric" autoComplete="off" placeholder="HH" type="text" value={hour} onChange={(event) => {
      const next = digits(event.target.value, 2);
      setHour(next);
      setInvalid(false);
      if (next.length === 2) minuteRef.current?.focus();
    }} />
    <span aria-hidden="true">:</span>
    <input ref={minuteRef} disabled={disabled} aria-label="Dinner end minutes" aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} inputMode="numeric" autoComplete="off" placeholder="MM" type="text" value={minute} onChange={(event) => { setMinute(digits(event.target.value, 2)); setInvalid(false); }} />
    {invalid && <p id={errorId} className="journal-clock__error" role="alert">Invalid time · use HH:MM between 00:00 and 23:59.</p>}
  </div>;
}

function Field({ variable, value, draftKey, onChange, onCommit, disabled = false, presentation = "default" }: { variable: JournalVariable; value: DraftValue; draftKey: string; onChange: (value: DraftValue) => void; onCommit?: () => void; disabled?: boolean; presentation?: "default" | "personal-lab" }) {
  const inputId = `journal-${variable.id}`;

  if (variable.variableType === "boolean") {
    const options = [{ label: "No", value: false }, { label: "Yes", value: true }];
    return <div className={`journal-choice${presentation === "personal-lab" ? " journal-choice--binary" : ""}`} role="group" aria-label={journalVariableLabel(variable)}>
      {options.map((option) => <button type="button" disabled={disabled} className={value === option.value ? "is-selected" : ""} aria-pressed={value === option.value} onClick={() => onChange(option.value)} key={option.label}>{option.label}</button>)}
    </div>;
  }

  if (variable.variableType === "scale") {
    return <div className="journal-choice journal-choice--scale" role="group" aria-label={`${journalVariableLabel(variable)}, 1 to 5`}>
      {[1, 2, 3, 4, 5].map((option) => <button type="button" disabled={disabled} className={value === option ? "is-selected" : ""} aria-pressed={value === option} onClick={() => onChange(value === option ? null : option)} key={option}>{option}</button>)}
    </div>;
  }

  if (variable.variableType === "category") {
    return <select disabled={disabled} id={inputId} aria-label={journalVariableLabel(variable)} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">Not recorded</option>
      {variable.options.map((option) => <option value={option} key={option}>{option}</option>)}
    </select>;
  }

  if (variable.variableType === "time") {
    if (isDinnerTimeVariable(variable)) return <DinnerTimeInput key={draftKey} inputId={inputId} value={value} disabled={disabled} onChange={onChange} />;
    return <input disabled={disabled} id={inputId} aria-label={journalVariableLabel(variable)} type="time" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />;
  }

  const nonNegative = variable.variableType === "count" || variable.variableType === "duration" || ["caffeine", "added sugar", "magnesium"].includes(journalVariableKey(variable.name));
  const input = <input disabled={disabled} id={inputId} aria-label={journalVariableLabel(variable)} type="number" min={nonNegative ? 0 : undefined} step={variable.variableType === "count" ? 1 : "any"} placeholder="—" value={typeof value === "number" || typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} onBlur={onCommit} />;
  if (presentation !== "personal-lab") return <div className="journal-number">{input}<span>{journalVariableUnit(variable)}</span></div>;

  function adjustValue(direction: -1 | 1) {
    const numericValue = typeof value === "number" ? value : Number(value);
    const baseValue = Number.isFinite(numericValue) ? numericValue : 0;
    const nextValue = baseValue + direction;
    onChange(nonNegative ? Math.max(0, nextValue) : nextValue);
  }

  return <div className="journal-number journal-number--stepper">
    <button type="button" disabled={disabled} aria-label={`Decrease ${journalVariableLabel(variable)}`} aria-controls={inputId} onClick={() => adjustValue(-1)}>−</button>
    <span className="journal-number__value">{input}<span>{journalVariableUnit(variable)}</span></span>
    <button type="button" disabled={disabled} aria-label={`Increase ${journalVariableLabel(variable)}`} aria-controls={inputId} onClick={() => adjustValue(1)}>+</button>
  </div>;
}

function VariableEditor({ variableType, name, unit, options, emoji, dayPeriod, defaultValue, captureMode, automaticMetricId, trackingCadence, busy, autoFocus = false, onNameChange, onTypeChange, onUnitChange, onOptionsChange, onEmojiChange, onDayPeriodChange, onDefaultValueChange, onCaptureModeChange, onAutomaticMetricChange, onTrackingCadenceChange, onSave, onCancel }: {
  variableType: JournalVariableType;
  name: string;
  unit: string;
  options: string;
  emoji: string;
  dayPeriod: JournalDayPeriod;
  defaultValue: string;
  captureMode: JournalCaptureMode;
  automaticMetricId: string | null;
  trackingCadence: JournalTrackingCadence;
  busy: boolean;
  autoFocus?: boolean;
  onNameChange: (value: string) => void;
  onTypeChange: (value: JournalVariableType) => void;
  onUnitChange: (value: string) => void;
  onOptionsChange: (value: string) => void;
  onEmojiChange: (value: string) => void;
  onDayPeriodChange: (value: JournalDayPeriod) => void;
  onDefaultValueChange: (value: string) => void;
  onCaptureModeChange: (value: JournalCaptureMode) => void;
  onAutomaticMetricChange: (value: string | null) => void;
  onTrackingCadenceChange: (value: JournalTrackingCadence) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return <div className="journal-variable-edit">
    <label>
      <span>Name</span>
      <input autoFocus={autoFocus} aria-label="Metric name" value={name} onChange={(event) => onNameChange(event.target.value)} />
    </label>
    <label><span>Emoji</span><input aria-label="Metric emoji" maxLength={8} value={emoji} onChange={(event) => onEmojiChange(event.target.value)} /></label>
    <label><span>Type</span><select disabled={captureMode === "automatic" && automaticMetricId !== null} aria-label="Metric type" value={variableType} onChange={(event) => onTypeChange(event.target.value as JournalVariableType)}>{Object.entries(typeLabels).filter(([value]) => ["boolean", "number", "count", "time", "scale", variableType].includes(value)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <label><span>Capture</span><select aria-label="Metric source" value={captureMode} onChange={(event) => onCaptureModeChange(event.target.value as JournalCaptureMode)}><option value="manual">Manual</option><option value="automatic">Automatic</option></select></label>
    {captureMode === "automatic" && <label><span>Health signal</span><select aria-label="Automatic health signal" value={automaticMetricId ?? ""} onChange={(event) => onAutomaticMetricChange(event.target.value || null)}><option value="">Choose a signal</option>{journalAutomaticSources.map((source) => <option value={source.id} key={source.id}>{source.label}</option>)}</select></label>}
    <label><span>Target cadence</span><select aria-label="Tracking cadence" value={trackingCadence} onChange={(event) => onTrackingCadenceChange(event.target.value as JournalTrackingCadence)}><option value="daily">Daily</option><option value="weekly">Once a week</option></select></label>
    <label><span>Timing</span><select disabled={captureMode === "automatic" && automaticMetricId !== null} aria-label="Metric timing" value={dayPeriod === "sleep" ? "evening" : dayPeriod} onChange={(event) => onDayPeriodChange(event.target.value as JournalDayPeriod)}>{editableJournalDayPeriods.map((period) => <option value={period.id} key={period.id}>{dayPeriodLabel(period.id)}</option>)}</select></label>
    {numericTypes.has(variableType) && <label>
      <span>Unit <em>(optional)</em></span>
      <input aria-label="Optional unit" placeholder="Optional" value={unit} onChange={(event) => onUnitChange(event.target.value)} />
    </label>}
    {variableType === "category" && <label>
      <span>Choices</span>
      <input aria-label="Comma-separated choices" placeholder="e.g. Home, Office" value={options} onChange={(event) => onOptionsChange(event.target.value)} />
    </label>}
    {variableType === "boolean" ? <label><span>Default value</span><select aria-label="Default metric value" value={defaultValue} onChange={(event) => onDefaultValueChange(event.target.value)}><option value="">Not recorded</option><option value="false">No</option><option value="true">Yes</option></select></label> : variableType !== "category" && <label><span>Default value</span><input aria-label="Default metric value" type={variableType === "time" ? "time" : "number"} value={defaultValue} onChange={(event) => onDefaultValueChange(event.target.value)} /></label>}
    <div className="journal-variable-edit__actions">
      <button type="button" onClick={onSave} disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Save</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}

type VariableManagerRenderArgs = {
  editorFor: (variable: JournalVariable) => ReactNode;
  isEditing: (variable: JournalVariable) => boolean;
  openEditor: (variable: JournalVariable) => void;
  tools: ReactNode;
};

function VariableManager({ variables, open, managerRef, children }: { variables: JournalVariable[]; open: boolean; managerRef: RefObject<HTMLElement | null>; children: (args: VariableManagerRenderArgs) => ReactNode }) {
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
  const [editCaptureMode, setEditCaptureMode] = useState<JournalCaptureMode>("manual");
  const [editAutomaticMetricId, setEditAutomaticMetricId] = useState<string | null>(null);
  const [editTrackingCadence, setEditTrackingCadence] = useState<JournalTrackingCadence>("daily");
  const [draft, setDraft] = useState<NewVariable>({ name: "", variableType: "boolean", unit: "", options: "", emoji: "🧪", dayPeriod: "day", defaultValue: "false", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily" });
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [lastRemoved, setLastRemoved] = useState<{ id: string; label: string } | null>(null);
  const lastFailedRequest = useRef<{ method: "POST" | "PATCH"; body: unknown; busy: string } | null>(null);
  const activeVariables = variables.filter((variable) => variable.isActive);
  const activeNames = new Set(activeVariables.map((variable) => variable.name.toLocaleLowerCase("en")));
  const suggestions = journalVariableSuggestions.filter((suggestion) => !activeNames.has(suggestion.name.toLocaleLowerCase("en")));

  async function request(method: "POST" | "PATCH", body: unknown, busy: string) {
    setBusyId(busy);
    setError(null);
    lastFailedRequest.current = { method, body, busy };
    try {
      const response = await fetch("/api/lab/variables", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "This habit could not be saved.");
      lastFailedRequest.current = null;
      router.refresh();
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "This habit could not be saved.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function retryLastRequest() {
    const failed = lastFailedRequest.current;
    if (!failed) return;
    await request(failed.method, failed.body, failed.busy);
  }

  async function confirmRemove(variable: JournalVariable) {
    const ok = await request("PATCH", { id: variable.id, isActive: false }, variable.id);
    if (ok) {
      setPendingRemoveId(null);
      setEditingId(null);
      setLastRemoved({ id: variable.id, label: journalVariableLabel(variable) });
    }
  }

  async function undoRemove() {
    if (!lastRemoved) return;
    const ok = await request("PATCH", { id: lastRemoved.id, isActive: true }, lastRemoved.id);
    if (ok) setLastRemoved(null);
  }

  async function create() {
    const options = draft.variableType === "category" ? splitOptions(draft.options) : [];
    const defaultValue = draft.captureMode === "automatic" || draft.defaultValue === "" ? null : draft.variableType === "boolean" ? draft.defaultValue === "true" : draft.variableType === "time" ? draft.defaultValue : Number(draft.defaultValue);
    const ok = await request("POST", { name: draft.name, variableType: draft.variableType, unit: numericTypes.has(draft.variableType) ? draft.unit || null : null, options, emoji: draft.emoji || "🧪", dayPeriod: draft.dayPeriod, defaultValue, captureMode: draft.captureMode, automaticMetricId: draft.automaticMetricId, trackingCadence: draft.trackingCadence }, "new");
    if (ok) {
      setDraft({ name: "", variableType: "boolean", unit: "", options: "", emoji: "🧪", dayPeriod: "day", defaultValue: "false", captureMode: "manual", automaticMetricId: null, trackingCadence: "daily" });
      setCreating(false);
    }
  }

  function startEdit(variable: JournalVariable) {
    setEditingId(variable.id);
    setPendingRemoveId(null);
    setEditName(variable.name);
    setEditVariableType(variable.variableType);
    setEditUnit(variable.unit ?? "");
    setEditOptions(variable.options.join(", "));
    setEditEmoji(variable.emoji);
    setEditDayPeriod(displayedDayPeriod(variable));
    setEditDefaultValue(variable.defaultValue === null ? "" : String(variable.defaultValue));
    setEditCaptureMode(variable.captureMode === "automatic" ? "automatic" : "manual");
    setEditAutomaticMetricId(typeof variable.automaticMetricId === "string" ? variable.automaticMetricId : null);
    setEditTrackingCadence(variable.trackingCadence ?? journalAutomaticSource(variable.automaticMetricId)?.defaultTrackingCadence ?? "daily");
    setError(null);
  }

  async function saveEdit(variable: JournalVariable) {
    const defaultValue = editCaptureMode === "automatic" || editDefaultValue === "" ? null : editVariableType === "boolean" ? editDefaultValue === "true" : editVariableType === "time" || editVariableType === "category" ? editDefaultValue : Number(editDefaultValue);
    const ok = await request("PATCH", { id: variable.id, name: editName, ...(editVariableType !== variable.variableType ? { variableType: editVariableType } : {}), emoji: editEmoji || "🧪", dayPeriod: editDayPeriod, defaultValue, unit: numericTypes.has(editVariableType) ? editUnit || null : null, ...(editVariableType === "category" ? { options: splitOptions(editOptions) } : {}), captureMode: editCaptureMode, automaticMetricId: editCaptureMode === "automatic" ? editAutomaticMetricId : null, trackingCadence: editTrackingCadence }, variable.id);
    if (ok) setEditingId(null);
  }

  function editorFor(variable: JournalVariable) {
    if (!open || editingId !== variable.id) return null;
    const editorId = `journal-variable-edit-${variable.id}`;
    return <div className="journal-variable-inline" id={editorId} aria-label={`Settings for ${journalVariableLabel(variable)}`}>
      <VariableEditor variableType={editVariableType} name={editName} unit={editUnit} options={editOptions} emoji={editEmoji} dayPeriod={editDayPeriod} defaultValue={editDefaultValue} captureMode={editCaptureMode} automaticMetricId={editAutomaticMetricId} trackingCadence={editTrackingCadence} busy={busyId === variable.id} autoFocus onNameChange={setEditName} onTypeChange={(value) => { setEditVariableType(value); setEditDefaultValue(value === "boolean" ? "false" : value === "time" || value === "scale" ? "" : "0"); }} onUnitChange={setEditUnit} onOptionsChange={setEditOptions} onEmojiChange={setEditEmoji} onDayPeriodChange={setEditDayPeriod} onDefaultValueChange={setEditDefaultValue} onCaptureModeChange={(value) => { setEditCaptureMode(value); if (value === "manual") setEditAutomaticMetricId(null); }} onAutomaticMetricChange={(value) => { setEditAutomaticMetricId(value); const source = journalAutomaticSource(value); if (source) { setEditVariableType(source.variableType); setEditDayPeriod(source.dayPeriod); setEditTrackingCadence(source.defaultTrackingCadence); setEditDefaultValue(""); } }} onTrackingCadenceChange={setEditTrackingCadence} onSave={() => void saveEdit(variable)} onCancel={() => setEditingId(null)} />
      <div className="journal-variable-inline__actions" aria-label={`Actions for ${journalVariableLabel(variable)}`}>
        <button type="button" aria-label={`Move ${journalVariableLabel(variable)} earlier`} disabled={busyId === variable.id} onClick={() => void request("PATCH", { id: variable.id, position: Math.max(0, variable.position - 15) }, variable.id)}>↑</button>
        <button type="button" aria-label={`Move ${journalVariableLabel(variable)} later`} disabled={busyId === variable.id} onClick={() => void request("PATCH", { id: variable.id, position: variable.position + 15 }, variable.id)}>↓</button>
        {pendingRemoveId === variable.id ? <span role="group" aria-label={`Confirm removal of ${journalVariableLabel(variable)}`}>
          <button type="button" disabled={busyId === variable.id} onClick={() => void confirmRemove(variable)}>{busyId === variable.id ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Confirm removal</button>
          <button type="button" onClick={() => setPendingRemoveId(null)}>Cancel</button>
        </span> : <button type="button" disabled={busyId === variable.id} onClick={() => { setLastRemoved(null); setPendingRemoveId(variable.id); }}>Remove</button>}
      </div>
    </div>;
  }

  const categoryOptions = splitOptions(draft.options);
  const canCreate = draft.name.trim().length > 0
    && (draft.variableType !== "category" || categoryOptions.length >= 2)
    && (draft.captureMode !== "automatic" || draft.automaticMetricId !== null);

  const tools = !open ? null : <section ref={managerRef} id="journal-manager" className="journal-manager" aria-label="Habit settings">
    <div className="journal-manager__header-actions">
      {!creating && <button className="secondary-button" type="button" onClick={() => { setCreating(true); setError(null); }}>Add a habit</button>}
    </div>
    {!creating && suggestions.length > 0 && <div className="journal-suggestions" aria-label="Suggested habits">
      {suggestions.map((suggestion) => <button type="button" key={suggestion.name} onClick={() => {
        setDraft(suggestionDraft(suggestion));
        setCreating(true);
        setError(null);
      }}><strong>{journalVariableLabel(suggestion)}</strong><span>{suggestion.unit ?? typeLabels[suggestion.variableType]}</span></button>)}
    </div>}
    {creating && <div className="journal-new-variable">
        <div className="journal-new-variable__heading"><h4>Add a tracked variable</h4><p>Leave it blank on days you don&apos;t want to log: absence remains absence.</p></div>
        <label><span>Name</span><input placeholder="e.g. Alcohol, Vacation, Deep work" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label><span>Emoji</span><input aria-label="Emoji" maxLength={8} value={draft.emoji} onChange={(event) => setDraft((current) => ({ ...current, emoji: event.target.value }))} /></label>
        <label><span>Capture</span><select aria-label="Metric source" value={draft.captureMode} onChange={(event) => {
          const captureMode = event.target.value as JournalCaptureMode;
          setDraft((current) => ({ ...current, captureMode, automaticMetricId: captureMode === "manual" ? null : current.automaticMetricId, defaultValue: captureMode === "automatic" ? "" : current.defaultValue }));
        }}><option value="manual">Manual</option><option value="automatic">Automatic</option></select></label>
        {draft.captureMode === "automatic" && <label><span>Health signal</span><select aria-label="Automatic health signal" value={draft.automaticMetricId ?? ""} onChange={(event) => {
          const automaticMetricId = event.target.value || null;
          const source = journalAutomaticSource(automaticMetricId);
          setDraft((current) => ({ ...current, automaticMetricId, variableType: source?.variableType ?? current.variableType, dayPeriod: source?.dayPeriod ?? current.dayPeriod, trackingCadence: source?.defaultTrackingCadence ?? current.trackingCadence, defaultValue: source ? "" : current.defaultValue }));
        }}><option value="">Choose a signal</option>{journalAutomaticSources.map((source) => <option value={source.id} key={source.id}>{source.label}</option>)}</select></label>}
        <label><span>Target cadence</span><select aria-label="Tracking cadence" value={draft.trackingCadence} onChange={(event) => setDraft((current) => ({ ...current, trackingCadence: event.target.value as JournalTrackingCadence }))}><option value="daily">Daily</option><option value="weekly">Once a week</option></select></label>
        <label><span>Metric type</span><select disabled={draft.captureMode === "automatic" && draft.automaticMetricId !== null} aria-label="Metric type" value={draft.variableType} onChange={(event) => {
          const variableType = event.target.value as JournalVariableType;
          setDraft((current) => ({ ...current, variableType, defaultValue: variableType === "boolean" ? "false" : variableType === "time" || variableType === "scale" ? "" : "0" }));
        }}>{Object.entries(typeLabels).filter(([value]) => ["boolean", "number", "count", "time", "scale"].includes(value)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Timing</span><select disabled={draft.captureMode === "automatic" && draft.automaticMetricId !== null} aria-label="Metric timing" value={draft.dayPeriod} onChange={(event) => setDraft((current) => ({ ...current, dayPeriod: event.target.value as JournalDayPeriod }))}>{editableJournalDayPeriods.map((period) => <option value={period.id} key={period.id}>{dayPeriodLabel(period.id)}</option>)}</select></label>
        {draft.captureMode === "automatic" ? <p className="journal-manager__hint">{journalAutomaticSource(draft.automaticMetricId)?.source ?? "The source"} autofills this metric when data is available. You can still adjust it in your journal.</p> : draft.variableType === "boolean" ? <label><span>Default value</span><select aria-label="Default value" value={draft.defaultValue} onChange={(event) => setDraft((current) => ({ ...current, defaultValue: event.target.value }))}><option value="">Not recorded</option><option value="false">No</option><option value="true">Yes</option></select></label> : <label><span>Default value</span><input aria-label="Default value" type={draft.variableType === "time" ? "time" : "number"} value={draft.defaultValue} onChange={(event) => setDraft((current) => ({ ...current, defaultValue: event.target.value }))} /></label>}
        {numericTypes.has(draft.variableType) && <label><span>Unit <em>(optional)</em></span><input placeholder="e.g. mg, min, drinks" value={draft.unit} onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))} /></label>}
        {draft.variableType === "category" && <label><span>Choices <em>(at least two)</em></span><input placeholder="e.g. Home, Office, Vacation" value={draft.options} onChange={(event) => setDraft((current) => ({ ...current, options: event.target.value }))} /></label>}
        {draft.variableType === "category" && categoryOptions.length < 2 && <p className="journal-manager__hint">Add at least two choices separated by commas.</p>}
        <div className="journal-new-variable__actions"><button className="primary-button" type="button" disabled={!canCreate || busyId === "new"} onClick={() => void create()}>{busyId === "new" ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Add variable</button><button className="text-link" type="button" onClick={() => setCreating(false)}>Cancel</button></div>
      </div>}

    {lastRemoved && <p className="journal-manager__hint" role="status">“{lastRemoved.label}” removed. <button type="button" onClick={() => void undoRemove()}>Undo</button></p>}
    {error && <p className="form-error" role="alert">{error} <button type="button" onClick={() => void retryLastRequest()}>Retry</button></p>}
  </section>;

  return <>{children({ editorFor, isEditing: (variable) => open && editingId === variable.id, openEditor: startEdit, tools })}</>;
}

function JournalFieldRow({ variable, value, draftKey, confirmed, skipped, dayValidated, automatic = false, achievement, activeHorizons, onChange, onCommit, feedbackToken, disabled, presentation = "default", editMode = false, editOpen = false, onEdit }: { variable: JournalVariable; value: DraftValue; draftKey: string; confirmed: boolean; skipped: boolean; dayValidated: boolean; automatic?: boolean; achievement?: JournalAchievement; activeHorizons?: readonly number[]; onChange: (value: DraftValue) => void; onCommit?: () => void; feedbackToken?: number; disabled: boolean; presentation?: "default" | "personal-lab"; editMode?: boolean; editOpen?: boolean; onEdit?: () => void }) {
  const stateLabel = confirmed ? "Recorded" : skipped ? "Skipped" : "To confirm";
  const state = confirmed ? "recorded" : skipped ? "skipped" : "pending";
  const isAutomatic = automatic || variable.captureMode === "automatic";
  const classes = ["journal-field", confirmed ? "journal-field--confirmed" : "", dayValidated ? "journal-field--day-validated" : "", isAutomatic ? "journal-field--automatic" : "", skipped ? "journal-field--skipped" : "", feedbackToken ? "journal-field--changed" : ""].filter(Boolean).join(" ");
  const canConfirmDisplayedValue = !disabled && !confirmed && !skipped && value !== null && variable.variableType !== "scale";
  const achievementLabel = achievement?.percentage === null ? "Progress —" : achievement ? `Progress ${achievement.percentage}%` : null;
  const achievementDays = achievement ? achievementWindowDays(achievement) : null;
  const label = journalVariableLabel(variable);
  const automaticDetectionLabel = isAutomatic ? "Automatic detection" : null;
  const dayValidationLabel = dayValidated ? "Day validated" : null;
  const stateIcon = confirmed ? <CircleCheck size={15} strokeWidth={1.8} aria-hidden="true" /> : skipped ? <CircleMinus size={15} strokeWidth={1.8} aria-hidden="true" /> : <CircleDashed size={15} strokeWidth={1.8} aria-hidden="true" />;
  const accessibleState = [stateLabel, dayValidationLabel, automaticDetectionLabel?.toLocaleLowerCase("en-US")].filter(Boolean).join(", ");
  const accessibleLabel = `${label}: ${accessibleState}`;
  const editorId = `journal-variable-edit-${variable.id}`;
  const observedCount = achievement?.observedPeriods ?? 0;
  const isEarlyMaturity = achievement ? observedCount < 10 : false;
  const showSupportingMeta = presentation !== "personal-lab";
  const achievementProgress = achievement && achievementLabel && achievementDays ? <span className="journal-achievement">
    <span className="journal-achievement__label">{achievementLabel} <span className="journal-achievement__window" aria-hidden="true">· {achievementDays}d</span></span>
    <span
      className="journal-achievement__bar"
      role="progressbar"
      aria-label={`${label}: ${achievementLabel} over ${achievementDays} days`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={achievement.percentage ?? undefined}
      aria-valuetext={achievement.percentage === null ? `Progress unavailable over ${achievementDays} days` : `${achievement.percentage}% over ${achievementDays} days`}
      data-state={achievement.percentage === null ? "unavailable" : "measured"}
    >
      {achievement.percentage !== null && <span className="journal-achievement__fill" style={{ width: `${Math.min(100, Math.max(0, achievement.percentage))}%` }} />}
    </span>
  </span> : null;
  const achievementMeta = presentation === "personal-lab" ? achievementProgress : showSupportingMeta && achievementLabel ? <small aria-label={`${label}: ${achievementLabel}`}>{achievementLabel}</small> : null;
  const activeBadges = showSupportingMeta && activeHorizons && activeHorizons.length > 0 ? (
    <span className="journal-effect-badges" aria-label={`Strongest effect in ${activeHorizons.map(h => `${h}d`).join(", ")}`}>
      {activeHorizons.map((h) => (
        <span key={h} className="journal-effect-badge" title={`Active correlation across ${h}-day analysis window`}>
          {h}d
        </span>
      ))}
    </span>
  ) : null;
  const headingContent = <><span className="journal-field__emoji" aria-hidden="true">{variable.emoji}</span><span className="journal-field__label"><span className="journal-field__label-row"><span className="journal-field__state-mark" data-state={state} aria-hidden="true">{stateIcon}</span><span className="journal-field__label-text">{label}{activeBadges}{automaticDetectionLabel && <span className="journal-field__automatic-indicator" role="img" aria-label={automaticDetectionLabel}><ScanLine size={12} aria-hidden="true" /></span>}</span></span>{achievementMeta}{showSupportingMeta && isEarlyMaturity && (
    <span className="journal-maturity-indicator" title={`${observedCount}/10 observations recorded to unlock statistical analysis`}>
      <span className="journal-maturity-bar">
        <span className="journal-maturity-fill" style={{ width: `${Math.min(100, (observedCount / 10) * 100)}%` }} />
      </span>
      <span className="journal-maturity-label">{observedCount}/10d</span>
    </span>
  )}</span></>;
  return <div className={classes} data-state={confirmed ? "recorded" : skipped ? "skipped" : "pending"} data-day-status={dayValidated ? "validated" : "draft"} aria-label={accessibleLabel}>
    {editMode && onEdit
      ? <button className="journal-field__heading journal-field__edit-trigger" type="button" aria-label={`Edit ${label}`} aria-expanded={editOpen} aria-controls={editorId} onClick={onEdit}>{headingContent}</button>
      : canConfirmDisplayedValue
      ? <button className="journal-field__heading journal-field__confirm-default" type="button" aria-label={`Confirm displayed value for ${label}${automaticDetectionLabel ? `, ${automaticDetectionLabel.toLocaleLowerCase("en-US")}` : ""}`} onClick={() => onChange(value)}>{headingContent}</button>
      : <div className="journal-field__heading">{headingContent}</div>}
    {feedbackToken ? <span key={`${variable.id}-${feedbackToken}`} className="journal-field__feedback" aria-hidden="true" /> : null}
    {journalVariableKey(variable.name) === "breakfast" && value === true
      ? <div className="journal-breakfast-actions"><Field variable={variable} value={value} draftKey={draftKey} onChange={onChange} onCommit={onCommit} disabled={disabled} presentation={presentation} /><Link href="/meals#meal-breakfast" aria-label="Add breakfast photo"><ImagePlus size={15} aria-hidden="true" />Add photo</Link></div>
      : <Field variable={variable} value={value} draftKey={draftKey} onChange={onChange} onCommit={onCommit} disabled={disabled} presentation={presentation} />}
  </div>;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function achievementWindowDays(achievement: JournalAchievement) {
  const start = Date.parse(`${achievement.windowStart}T12:00:00Z`);
  const end = Date.parse(`${achievement.windowEnd}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return JOURNAL_ACHIEVEMENT_WINDOW_DAYS;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

export type DailyJournalProps = {
  variables: JournalVariable[];
  entries: JournalEntry[];
  days: JournalDay[];
  achievements?: JournalAchievement[];
  todayDate: string;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  showDateNavigation?: boolean;
  availableDates?: readonly string[];
  onTodayBreakfastValidation?: (skipped: boolean) => void;
  onTodayMorningValidation?: (completed: boolean) => void;
  presentation?: "default" | "personal-lab";
  activeEffectsByVariable?: ReadonlyMap<string, readonly number[]> | Record<string, readonly number[]>;
  statusTreatment?: JournalStatusTreatment;
  onCompletionChange?: (count: number, total: number) => void;
};

export function DailyJournal({ variables, entries, days, achievements, todayDate, selectedDate: selectedDateProp, onDateChange, showDateNavigation = true, availableDates, onTodayBreakfastValidation, onTodayMorningValidation, presentation = "default", activeEffectsByVariable, statusTreatment = "v1", onCompletionChange }: DailyJournalProps) {
  const router = useRouter();
  const activeVariables = useMemo(() => variables.filter((variable) => variable.isActive).sort((first, second) => first.position - second.position), [variables]);
  const achievementsByVariable = useMemo(() => new Map((achievements ?? []).map((achievement) => [achievement.variableId, achievement])), [achievements]);
  const sections = useMemo(() => journalDisplayOrder.flatMap((periodId) => {
    const period = journalDayPeriods.find((candidate) => candidate.id === periodId);
    if (!period) return [];
    const periodVariables = activeVariables.filter((variable) => displayedDayPeriod(variable) === period.id);
    return periodVariables.length > 0 ? [{ ...period, variables: periodVariables }] : [];
  }), [activeVariables]);
  const defaultAvailableDates = useMemo(() => Array.from({ length: 5 }, (_, index) => addDays(todayDate, -index)), [todayDate]);
  const dateOptions = availableDates ?? defaultAvailableDates;
  const [internalEntryDate, setInternalEntryDate] = useState(() => {
    if (selectedDateProp !== undefined) return todayDate;
    if (typeof window !== "undefined") {
      const urlDate = new URLSearchParams(window.location.search).get("date");
      if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate) && dateOptions.includes(urlDate)) return urlDate;
    }
    return todayDate;
  });
  const entryDate = selectedDateProp ?? internalEntryDate;
  const selectedDateRef = useRef(entryDate);
  const initialDrafts = useMemo(() => journalDraftsForDates(dateOptions, activeVariables, entries, days), [activeVariables, dateOptions, days, entries]);
  const [draftsByDate, setDraftsByDate] = useState<JournalDraftsByDate>(initialDrafts);
  const drafts = useRef<JournalDraftsByDate>(initialDrafts);
  const pendingSavesByDate = useRef<Record<string, number>>({});
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [validatingDate, setValidatingDate] = useState<string | null>(null);
  const [validatedDate, setValidatedDate] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<JournalSaveStatus>("draft");
  const [error, setError] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const managerTriggerRef = useRef<HTMLButtonElement>(null);
  const managerRef = useRef<HTMLElement>(null);
  const [feedback, setFeedback] = useState<{ fieldId: string; token: number } | null>(null);
  const [completionRevision, setCompletionRevision] = useState(0);
  const [recordedByDate, setRecordedByDate] = useState<Record<string, Set<string>>>(() => Object.fromEntries(dateOptions.map((date) => [date, new Set(entries.filter((entry) => entry.entryDate === date).map((entry) => entry.variableId))])));
  const [skippedByDate, setSkippedByDate] = useState<Record<string, Set<string>>>(() => Object.fromEntries(dateOptions.map((date) => [date, new Set(days.find((day) => day.entryDate === date)?.omittedVariableIds ?? [])])));
  const [manualOverrideKeys, setManualOverrideKeys] = useState<Set<string>>(() => new Set());
  const feedbackSequence = useRef(0);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNumericFeedback = useRef(new Set<string>());
  const day = days.find((candidate) => candidate.entryDate === entryDate);
  const validated = day?.status === "validated" || validatedDate === entryDate;
  const validating = validatingDate === entryDate;
  const values = draftsByDate[entryDate] ?? journalValuesForDate(activeVariables, entries, days, entryDate);
  const automaticIdsByDate = useMemo(() => {
    const result: Record<string, Set<string>> = {};
    for (const entry of entries) {
      if (entry.source !== "automatic") continue;
      (result[entry.entryDate] ??= new Set()).add(entry.variableId);
    }
    return result;
  }, [entries]);
  const automaticIds = useMemo(() => new Set([...automaticIdsByDate[entryDate] ?? []].filter((id) => !manualOverrideKeys.has(`${entryDate}:${id}`))), [automaticIdsByDate, entryDate, manualOverrideKeys]);
  const recorded = useMemo(() => new Set([...(recordedByDate[entryDate] ?? []), ...automaticIds]), [automaticIds, recordedByDate, entryDate]);
  const skipped = useMemo(() => new Set([...(skippedByDate[entryDate] ?? [])].filter((id) => !automaticIds.has(id))), [automaticIds, skippedByDate, entryDate]);
  const completionCount = useMemo(() => activeVariables.reduce((count, variable) => count + (recorded.has(variable.id) ? 1 : 0), 0), [activeVariables, recorded]);

  useEffect(() => {
    onCompletionChange?.(completionCount, activeVariables.length);
  }, [activeVariables.length, completionCount, completionRevision, entryDate, onCompletionChange]);

  useEffect(() => () => {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
  }, []);

  useEffect(() => {
    const pendingDates = new Set(Object.entries(pendingSavesByDate.current).filter(([, count]) => count > 0).map(([date]) => date));
    const next = reconcileJournalDrafts(initialDrafts, drafts.current, pendingDates);
    drafts.current = next;
    setDraftsByDate(next);
  }, [initialDrafts]);

  useEffect(() => {
    if (selectedDateRef.current === entryDate) return;
    selectedDateRef.current = entryDate;
    setSaveStatus("draft");
    setError(null);
    pendingNumericFeedback.current.clear();
  }, [entryDate]);

  function triggerFeedback(fieldId: string) {
    feedbackSequence.current += 1;
    setFeedback({ fieldId, token: feedbackSequence.current });
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    feedbackTimeout.current = setTimeout(() => setFeedback(null), 520);
  }

  function commitField(fieldId: string) {
    if (!pendingNumericFeedback.current.delete(fieldId)) return;
    triggerFeedback(fieldId);
  }

  async function persist(date: string, mode: "draft" | "validate", draftValues: Record<string, DraftValue>, changedVariableId?: string) {
    const automaticIdsForDate = automaticIdsByDate[date] ?? new Set<string>();
    const included = mode === "validate" ? new Set([
      ...(recordedByDate[date] ?? []),
      ...(skippedByDate[date] ?? []),
    ].filter((id) => !automaticIdsForDate.has(id) || manualOverrideKeys.has(`${date}:${id}`))) : undefined;
    const entriesToSave = journalEntriesForSave(activeVariables.map((variable) => variable.id), draftValues, mode, changedVariableId, included);
    const response = await fetch("/api/lab/entries", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryDate: date, mode, entries: entriesToSave }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Le journal n’a pas pu être enregistré.");
  }

  function queueDraft(date: string, variableId: string, draftValues: Record<string, DraftValue>) {
    pendingSavesByDate.current[date] = (pendingSavesByDate.current[date] ?? 0) + 1;
    setSaveStatus("saving");
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => persist(date, "draft", draftValues, variableId))
      .then(() => {
        const breakfast = activeVariables.find((variable) => variable.id === variableId && variable.variableType === "boolean" && journalVariableKey(variable.name) === "breakfast");
        const dayIsValidated = days.some((candidate) => candidate.entryDate === date && candidate.status === "validated") || validatedDate === date;
        if (date === todayDate && breakfast && dayIsValidated) onTodayBreakfastValidation?.(draftValues[breakfast.id] === false);
        if (date === selectedDateRef.current && pendingSavesByDate.current[date] === 1) {
          setSaveStatus("saved");
          setError(null);
          if (days.find((candidate) => candidate.entryDate === date)?.status === "validated") router.refresh();
        }
      })
      .catch((saveError) => {
        if (date === selectedDateRef.current) {
          setSaveStatus("error");
          setError(saveError instanceof Error ? saveError.message : "Le journal n’a pas pu être enregistré.");
        }
      })
      .finally(() => {
        const remaining = (pendingSavesByDate.current[date] ?? 1) - 1;
        if (remaining > 0) pendingSavesByDate.current[date] = remaining;
        else delete pendingSavesByDate.current[date];
      });
  }

  async function validate() {
    const date = selectedDateRef.current;
    pendingSavesByDate.current[date] = (pendingSavesByDate.current[date] ?? 0) + 1;
    setValidatingDate(date);
    setSaveStatus("saving");
    try {
      await saveQueue.current;
      await persist(date, "validate", drafts.current[date] ?? journalValuesForDate(activeVariables, entries, days, date));
      if (date === selectedDateRef.current) {
        setValidatedDate(date);
        setSaveStatus("saved");
        setError(null);
      }
      if (date === todayDate) {
        const breakfast = activeVariables.find((variable) => variable.variableType === "boolean" && journalVariableKey(variable.name) === "breakfast");
        const explicitlyRecorded = breakfast ? (recordedByDate[date] ?? new Set<string>()).has(breakfast.id) : false;
        onTodayBreakfastValidation?.(Boolean(breakfast && explicitlyRecorded && drafts.current[date]?.[breakfast.id] === false));
        const morningIds = activeVariables.filter((variable) => variable.dayPeriod === "morning").map((variable) => variable.id);
        const morningRecorded = morningIds.some((id) => (recordedByDate[date] ?? new Set<string>()).has(id) || (skippedByDate[date] ?? new Set<string>()).has(id));
        onTodayMorningValidation?.(morningIds.length > 0 && morningRecorded);
      }
      router.refresh();
    } catch (saveError) {
      if (date === selectedDateRef.current) {
        setSaveStatus("error");
        setError(saveError instanceof Error ? saveError.message : "Cette journée n’a pas pu être validée.");
      }
    } finally {
      const remaining = (pendingSavesByDate.current[date] ?? 1) - 1;
      if (remaining > 0) pendingSavesByDate.current[date] = remaining;
      else delete pendingSavesByDate.current[date];
      setValidatingDate(null);
    }
  }

  function changeDate(date: string) {
    // La validation d’une autre date ne bloque jamais la navigation.
    if (!dateOptions.includes(date)) return;
    selectedDateRef.current = date;
    if (selectedDateProp === undefined) setInternalEntryDate(date);
    onDateChange?.(date);
    if (!drafts.current[date]) {
      const next = { ...drafts.current, [date]: journalValuesForDate(activeVariables, entries, days, date) };
      drafts.current = next;
      setDraftsByDate(next);
    }
    setSaveStatus("draft");
    setError(null);
    pendingNumericFeedback.current.clear();
  }

  function changeValue(variableId: string, value: DraftValue) {
    const date = selectedDateRef.current;
    const variable = activeVariables.find((candidate) => candidate.id === variableId);
    const next = updateJournalDraft(drafts.current, date, variableId, value);
    drafts.current = next;
    setDraftsByDate(next);
    setRecordedByDate((current) => {
      const nextRecorded = new Set(current[date] ?? []);
      if (value === null) nextRecorded.delete(variableId);
      else nextRecorded.add(variableId);
      return { ...current, [date]: nextRecorded };
    });
    setSkippedByDate((current) => {
      const nextSkipped = new Set(current[date] ?? []);
      if (value === null) nextSkipped.add(variableId);
      else nextSkipped.delete(variableId);
      return { ...current, [date]: nextSkipped };
    });
    if (automaticIdsByDate[date]?.has(variableId)) {
      setManualOverrideKeys((current) => new Set(current).add(`${date}:${variableId}`));
    }
    if (variable && textNumericTypes.has(variable.variableType)) pendingNumericFeedback.current.add(variableId);
    else if (variable) triggerFeedback(variableId);
    setCompletionRevision((current) => current + 1);
    queueDraft(date, variableId, next[date]);
  }

  function confirmPeriodDefaults(periodVariables: JournalVariable[]) {
    for (const variable of periodVariables) {
      const displayedValue = values[variable.id] ?? null;
      if (!recorded.has(variable.id) && !skipped.has(variable.id) && displayedValue !== null) changeValue(variable.id, displayedValue);
    }
  }

  const isPersonalLab = presentation === "personal-lab";
  const statusClass = ["checkin-state", "journal-save-status", validated || saveStatus === "saved" ? "checkin-state--saved" : "", saveStatus === "error" ? "checkin-state--error" : ""].filter(Boolean).join(" ");
  const statusText = journalStatusText({ validated, validating, saveStatus });
  const personalLabIndexes: Record<string, string> = { morning: "01", day: "02", evening: "03", context: "04" };
  const placeValidationInMorning = isPersonalLab && sections.some((section) => section.id === "morning");
  const emptyCount = activeVariables.filter((variable) => (values[variable.id] ?? null) === null).length;
  const validationSummary = validated ? null : emptyCount === 0 ? "Ready" : `${emptyCount} to log`;
  // Non-blocking: only the date being validated disables its button.
  const validationDescription = emptyCount === 0 ? "All variables are logged." : `${emptyCount} empty variable${emptyCount > 1 ? "s" : ""} will remain blank.`;
  const validationAction = !validated ? <span className="journal-validation-action"><button className={`primary-button${isPersonalLab ? " primary-button--validate" : ""}`} type="button" onClick={() => void validate()} disabled={validating} aria-label={`Validate day. ${validationDescription}`}>{validating ? <><LoaderCircle className="spin" size={16} aria-hidden="true" />Validating…</> : "Validate day"}</button>{validationSummary && <small aria-live="polite">{validationSummary}</small>}</span> : null;
  function retryJournalSave() {
    const date = selectedDateRef.current;
    const draftValues = drafts.current[date] ?? journalValuesForDate(activeVariables, entries, days, date);
    setError(null);
    setSaveStatus("saving");
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => persist(date, "draft", draftValues))
      .then(() => {
        if (date === selectedDateRef.current) {
          setSaveStatus("saved");
          setError(null);
        }
      })
      .catch((saveError) => {
        if (date === selectedDateRef.current) {
          setSaveStatus("error");
          setError(saveError instanceof Error ? saveError.message : "The journal could not be saved.");
        }
      });
  }
  return <VariableManager key={managerOpen ? "open" : "closed"} variables={variables} open={managerOpen} managerRef={managerRef}>
    {({ editorFor, isEditing, openEditor, tools }) => {
      const managerTrigger = <button ref={managerTriggerRef} className="journal-manager-trigger" type="button" aria-label={managerOpen ? "Done editing habits" : "Edit habits"} aria-expanded={managerOpen} aria-controls="journal-manager" onClick={() => {
        if (managerOpen) {
          setManagerOpen(false);
          managerTriggerRef.current?.focus();
        } else {
          setManagerOpen(true);
        }
      }}>{managerOpen ? "Done" : <><PencilLine size={14} aria-hidden="true" />Edit habits</>}</button>;
      return <section className={`checkin-card journal-card${isPersonalLab ? " journal-card--personal-lab" : ""} journal-card--status-${statusTreatment}`} data-managing={managerOpen ? "true" : undefined} data-status-treatment={statusTreatment} aria-labelledby="journal-title"><header className="journal-card__header"><div className="journal-card__heading"><h2 id="journal-title">Journal</h2></div><div className="journal-card__actions" role="group" aria-label="Journal actions"><span className={statusClass} data-draft={saveStatus === "draft" && !validating && !validated ? "true" : undefined} aria-live="polite" aria-atomic="true">
        {validating || saveStatus === "saving" ? <LoaderCircle className="journal-save-status__icon spin" size={14} aria-hidden="true" /> : saveStatus === "error" ? <span className="journal-save-status__icon journal-save-status__icon--error" aria-hidden="true">!</span> : null}
        <span>{statusText}</span>
      </span>
      {!placeValidationInMorning && validationAction}
      {!placeValidationInMorning && managerTrigger}
    </div></header>
      {tools}
      {showDateNavigation && <nav className="journal-date-strip" aria-label="Journal date">{dateOptions.map((date, index) => <button type="button" aria-current={date === entryDate ? "date" : undefined} onClick={() => changeDate(date)} key={date}><span>{index === 0 ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "")}</span><small>{date.slice(8)}</small></button>)}</nav>}
      {activeVariables.length > 0 ? <div className="journal-sections">{sections.map((section) => {
        const completedCount = section.variables.filter((variable) => recorded.has(variable.id)).length;
        const complete = completedCount === section.variables.length;
        const canConfirmDefaults = section.variables.some((variable) => !recorded.has(variable.id) && !skipped.has(variable.id) && (values[variable.id] ?? null) !== null);
        const sectionLabel = dayPeriodLabel(section.id);
        const sectionIndex = isPersonalLab ? personalLabIndexes[section.id] : undefined;
        return <section className={`journal-period${complete ? " journal-period--complete" : ""}`} aria-labelledby={`journal-${section.id}-title`} aria-label={`${sectionLabel}${complete ? ", complete" : ""}`} key={section.id} data-period={section.id} data-complete={complete ? "true" : "false"}>
        <header className={`journal-period__header${canConfirmDefaults ? " journal-period__header--actionable" : ""}`}><div className={`journal-period__header-row${placeValidationInMorning && section.id === "morning" ? " journal-period__header-row--morning" : ""}`}><h3 id={`journal-${section.id}-title`}>{canConfirmDefaults ? <button type="button" aria-label={`Confirm all displayed values for ${sectionLabel}`} onClick={() => confirmPeriodDefaults(section.variables)}>{sectionIndex && <span className="journal-period__index" aria-hidden="true">{sectionIndex}</span>}<span>{sectionLabel}</span></button> : <>{sectionIndex && <span className="journal-period__index" aria-hidden="true">{sectionIndex}</span>}<span>{sectionLabel}</span></>}</h3>{placeValidationInMorning && section.id === "morning" ? <div className="journal-period__header-actions">{validationAction}{managerTrigger}</div> : null}</div></header>
        <div className="journal-grid">{section.variables.map((variable) => <div className="journal-field-stack" key={variable.id}>
          <JournalFieldRow variable={variable} value={values[variable.id] ?? null} draftKey={entryDate} confirmed={recorded.has(variable.id)} skipped={skipped.has(variable.id)} dayValidated={validated} automatic={automaticIds.has(variable.id)} achievement={achievementsByVariable.get(variable.id)} activeHorizons={activeEffectsByVariable instanceof Map ? activeEffectsByVariable.get(variable.id) : (activeEffectsByVariable as Record<string, number[]> | undefined)?.[variable.id]} feedbackToken={feedback?.fieldId === variable.id ? feedback.token : undefined} onCommit={() => commitField(variable.id)} disabled={false} presentation={presentation} editMode={managerOpen} editOpen={isEditing(variable)} onEdit={() => openEditor(variable)} onChange={(value) => changeValue(variable.id, value)} />
          {editorFor(variable)}
        </div>)}</div>
      </section>;
      })}</div> : <p className="journal-empty">Add your first tracked variable below.</p>}
      {error && <p className="form-error" role="alert">{error} <button type="button" onClick={retryJournalSave}>Retry</button></p>}
      {validated && <p className="journal-save-note" role="status">Changes are saved automatically and remain included in your relations.</p>}
    </section>;
    }}
  </VariableManager>;
}

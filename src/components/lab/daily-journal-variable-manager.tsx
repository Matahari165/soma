import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode, type RefObject } from "react";

import {
  isRetiredBedtimeJournalVariable,
  journalAutomaticSource,
  journalAutomaticSources,
  journalVariableSuggestions,
  type JournalCaptureMode,
  type JournalDayPeriod,
  type JournalVariable,
  type JournalVariableType,
  type JournalTrackingCadence,
} from "@/domain/lab/journal";

import {
  dayPeriodLabel,
  displayedDayPeriod,
  journalVariableLabel,
  numericTypes,
  splitOptions,
  suggestionDraft,
  type NewVariable,
  typeLabels,
  editableJournalDayPeriods,
} from "./daily-journal-shared";

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

export function VariableManager({ variables, open, managerRef, children }: { variables: JournalVariable[]; open: boolean; managerRef: RefObject<HTMLElement | null>; children: (args: VariableManagerRenderArgs) => ReactNode }) {
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
  const activeVariables = variables.filter((variable) => variable.isActive && !isRetiredBedtimeJournalVariable(variable));
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

  const tools = !open ? null : <section ref={managerRef} id="journal-manager" className="journal-manager animate-surface-enter" aria-label="Habit settings">
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

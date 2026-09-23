"use client";

import { CircleCheck, CircleDashed, CircleMinus, ImagePlus, LoaderCircle, Minus, PencilLine, Plus, ScanLine } from "lucide-react";
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
  isRetiredBedtimeJournalVariable,
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

function QuantityStepper({
  variable,
  value,
  inputId,
  disabled,
  nonNegative,
  onChange,
  onCommit,
}: {
  variable: JournalVariable;
  value: DraftValue;
  inputId: string;
  disabled: boolean;
  nonNegative: boolean;
  onChange: (value: DraftValue) => void;
  onCommit?: () => void;
}) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : null;
  const isValueDefined = numericValue !== null && Number.isFinite(numericValue);
  const baseValue = isValueDefined ? numericValue : 0;
  const isMinusDisabled = disabled || (nonNegative && baseValue <= 0);
  const isPlusDisabled = disabled;

  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerDownRef = useRef(false);

  const stopHold = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopHold();
    };
  }, []);

  const adjustValue = (delta: number) => {
    const currentRaw = valueRef.current;
    const currentNum = typeof currentRaw === "number" ? currentRaw : typeof currentRaw === "string" && currentRaw.trim() !== "" ? Number(currentRaw) : null;
    const currentBase = currentNum !== null && Number.isFinite(currentNum) ? currentNum : 0;
    const nextValue = currentBase + delta;
    const finalValue = nonNegative ? Math.max(0, nextValue) : nextValue;
    onChange(finalValue);
    return finalValue;
  };

  const startHold = (direction: -1 | 1) => {
    if (disabled) return;
    if (direction === -1 && nonNegative && baseValue <= 0) return;

    stopHold();
    adjustValue(direction);

    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        const currentRaw = valueRef.current;
        const currentNum = typeof currentRaw === "number" ? currentRaw : typeof currentRaw === "string" && currentRaw.trim() !== "" ? Number(currentRaw) : null;
        const currentBase = currentNum !== null && Number.isFinite(currentNum) ? currentNum : 0;
        if (direction === -1 && nonNegative && currentBase <= 0) {
          stopHold();
          return;
        }
        adjustValue(direction);
      }, 80);
    }, 350);
  };

  const handleMouseDown = (e: React.MouseEvent, direction: -1 | 1) => {
    if (e.button !== 0) return;
    pointerDownRef.current = true;
    startHold(direction);
  };

  const handleTouchStart = (direction: -1 | 1) => {
    pointerDownRef.current = true;
    startHold(direction);
  };

  const handlePointerUp = () => {
    stopHold();
    setTimeout(() => {
      pointerDownRef.current = false;
    }, 0);
  };

  const handleClick = (direction: -1 | 1) => {
    if (pointerDownRef.current) {
      return;
    }
    adjustValue(direction);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      adjustValue(step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const step = e.shiftKey ? -10 : -1;
      adjustValue(step);
    }
  };

  const unit = journalVariableUnit(variable);

  return (
    <div
      className="flex items-center gap-1.5 font-mono text-xs stitch-stepper journal-number--stepper"
      role="group"
      aria-label={journalVariableLabel(variable)}
    >
      <button
        type="button"
        disabled={isMinusDisabled}
        aria-label={`Decrease ${journalVariableLabel(variable)}`}
        aria-controls={inputId}
        onMouseDown={(e) => handleMouseDown(e, -1)}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={() => handleTouchStart(-1)}
        onTouchEnd={handlePointerUp}
        onTouchCancel={handlePointerUp}
        onClick={() => handleClick(-1)}
        className={`w-7 h-7 rounded border border-hairline flex items-center justify-center stepper-btn transition-transform active:scale-90 ${
          isMinusDisabled
            ? "opacity-30 cursor-not-allowed"
            : "text-content-secondary hover:text-content-primary hover:bg-surface-elevated"
        }`}
      >
        <Minus size={13} className="lucide lucide-minus" aria-hidden="true" />
      </button>
      <div className="stitch-stepper__value journal-number__value">
        <input
          disabled={disabled}
          id={inputId}
          role="spinbutton"
          aria-valuenow={isValueDefined ? numericValue : undefined}
          aria-valuemin={nonNegative ? 0 : undefined}
          aria-label={journalVariableLabel(variable)}
          type="number"
          min={nonNegative ? 0 : undefined}
          step={variable.variableType === "count" ? 1 : "any"}
          placeholder="—"
          value={typeof value === "number" || typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onCommit}
          className="bg-transparent text-center font-mono text-xs text-content-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {unit && (
          <span className="stitch-stepper__unit select-none">
            {unit}
          </span>
        )}
      </div>
      <button
        type="button"
        disabled={isPlusDisabled}
        aria-label={`Increase ${journalVariableLabel(variable)}`}
        aria-controls={inputId}
        onMouseDown={(e) => handleMouseDown(e, 1)}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={() => handleTouchStart(1)}
        onTouchEnd={handlePointerUp}
        onTouchCancel={handlePointerUp}
        onClick={() => handleClick(1)}
        className={`w-7 h-7 rounded border border-hairline flex items-center justify-center stepper-btn transition-transform active:scale-90 ${
          isPlusDisabled
            ? "opacity-30 cursor-not-allowed"
            : "text-content-secondary hover:text-content-primary hover:bg-surface-elevated"
        }`}
      >
        <Plus size={13} className="lucide lucide-plus" aria-hidden="true" />
      </button>
    </div>
  );
}

function Field({ variable, value, draftKey, onChange, onCommit, disabled = false, presentation = "default", confirmed = false }: { variable: JournalVariable; value: DraftValue; draftKey: string; onChange: (value: DraftValue) => void; onCommit?: () => void; disabled?: boolean; presentation?: "default" | "personal-lab"; confirmed?: boolean }) {
  const inputId = `journal-${variable.id}`;

  if (variable.variableType === "boolean") {
    if (presentation === "personal-lab") {
      const containerClass = "inline-flex w-28 p-0.5 rounded bg-surface-card border border-hairline font-mono text-xs overflow-hidden relative journal-choice journal-choice--binary";
      if (confirmed && value === true) {
        return (
          <div className={containerClass} role="group" aria-label={journalVariableLabel(variable)}>
            <button
              type="button"
              disabled={disabled}
              className="w-full py-1 text-center rounded bg-surface-elevated text-sage border border-sage/20 font-medium transition-all duration-200 cubic-bezier(0.16, 1, 0.3, 1) interactive-press active:scale-[0.96]"
              onClick={() => onChange(null)}
              aria-label={`Reset ${journalVariableLabel(variable)}`}
            >
              Yes
            </button>
          </div>
        );
      }
      if (confirmed && value === false) {
        return (
          <div className={containerClass} role="group" aria-label={journalVariableLabel(variable)}>
            <button
              type="button"
              disabled={disabled}
              className="w-full py-1 text-center rounded bg-surface-elevated text-content-secondary border border-hairline font-medium transition-all duration-200 cubic-bezier(0.16, 1, 0.3, 1) interactive-press active:scale-[0.96]"
              onClick={() => onChange(null)}
              aria-label={`Reset ${journalVariableLabel(variable)}`}
            >
              No
            </button>
          </div>
        );
      }
      return (
        <div className={containerClass} role="group" aria-label={journalVariableLabel(variable)}>
          <button
            type="button"
            disabled={disabled}
            className="w-1/2 py-1 text-center rounded transition-all duration-200 text-content-secondary hover:text-content-primary interactive-press active:scale-[0.94]"
            onClick={() => onChange(true)}
          >
            Yes
          </button>
          <button
            type="button"
            disabled={disabled}
            className="w-1/2 py-1 text-center rounded transition-all duration-200 text-content-secondary hover:text-content-primary interactive-press active:scale-[0.94]"
            onClick={() => onChange(false)}
          >
            No
          </button>
        </div>
      );
    }
    if (confirmed && typeof value === "boolean") {
      return <div className="journal-choice" role="group" aria-label={journalVariableLabel(variable)} style={{ gridTemplateColumns: "1fr" }}>
        <button type="button" disabled={disabled} className="is-selected" aria-label={`Reset ${journalVariableLabel(variable)}`} onClick={() => onChange(null)}>{value ? "Yes" : "No"}</button>
      </div>;
    }
    const options = [{ label: "Yes", value: true }, { label: "No", value: false }];
    return <div className="journal-choice" role="group" aria-label={journalVariableLabel(variable)}>
      {options.map((option) => <button type="button" disabled={disabled} onClick={() => onChange(option.value)} key={option.label}>{option.label}</button>)}
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

  if (presentation !== "personal-lab") {
    const input = <input disabled={disabled} id={inputId} aria-label={journalVariableLabel(variable)} type="number" min={nonNegative ? 0 : undefined} step={variable.variableType === "count" ? 1 : "any"} placeholder="—" value={typeof value === "number" || typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} onBlur={onCommit} />;
    return <div className="journal-number">{input}<span>{journalVariableUnit(variable)}</span></div>;
  }

  return (
    <QuantityStepper
      variable={variable}
      value={value}
      inputId={inputId}
      disabled={disabled}
      nonNegative={nonNegative}
      onChange={onChange}
      onCommit={onCommit}
    />
  );
}

function VariableEditor({ variableType, name, unit, options, dayPeriod, defaultValue, captureMode, automaticMetricId, trackingCadence, busy, autoFocus = false, onNameChange, onTypeChange, onUnitChange, onOptionsChange, onDayPeriodChange, onDefaultValueChange, onCaptureModeChange, onAutomaticMetricChange, onTrackingCadenceChange, onSave, onCancel }: {
  variableType: JournalVariableType;
  name: string;
  unit: string;
  options: string;
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
      <VariableEditor variableType={editVariableType} name={editName} unit={editUnit} options={editOptions} dayPeriod={editDayPeriod} defaultValue={editDefaultValue} captureMode={editCaptureMode} automaticMetricId={editAutomaticMetricId} trackingCadence={editTrackingCadence} busy={busyId === variable.id} autoFocus onNameChange={setEditName} onTypeChange={(value) => { setEditVariableType(value); setEditDefaultValue(value === "boolean" ? "false" : value === "time" || value === "scale" ? "" : "0"); }} onUnitChange={setEditUnit} onOptionsChange={setEditOptions} onDayPeriodChange={setEditDayPeriod} onDefaultValueChange={setEditDefaultValue} onCaptureModeChange={(value) => { setEditCaptureMode(value); if (value === "manual") setEditAutomaticMetricId(null); }} onAutomaticMetricChange={(value) => { setEditAutomaticMetricId(value); const source = journalAutomaticSource(value); if (source) { setEditVariableType(source.variableType); setEditDayPeriod(source.dayPeriod); setEditTrackingCadence(source.defaultTrackingCadence); setEditDefaultValue(""); } }} onTrackingCadenceChange={setEditTrackingCadence} onSave={() => void saveEdit(variable)} onCancel={() => setEditingId(null)} />
      <div className="journal-variable-inline__actions" role="group" aria-label={`Order and removal for ${journalVariableLabel(variable)}`}>
        <button type="button" aria-label={`Move ${journalVariableLabel(variable)} earlier`} disabled={busyId === variable.id || activeVariables[0]?.id === variable.id} onClick={() => void request("PATCH", { id: variable.id, position: Math.max(0, variable.position - 15) }, variable.id)}>↑ Earlier</button>
        <button type="button" aria-label={`Move ${journalVariableLabel(variable)} later`} disabled={busyId === variable.id || activeVariables.at(-1)?.id === variable.id} onClick={() => void request("PATCH", { id: variable.id, position: variable.position + 15 }, variable.id)}>↓ Later</button>
        {pendingRemoveId === variable.id ? <span role="group" aria-label={`Confirm removal of ${journalVariableLabel(variable)}`}>
          <button className="journal-variable-remove" type="button" disabled={busyId === variable.id} onClick={() => void confirmRemove(variable)}>{busyId === variable.id ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : null}Remove habit</button>
          <button type="button" onClick={() => setPendingRemoveId(null)}>Cancel</button>
        </span> : <button className="journal-variable-remove" type="button" disabled={busyId === variable.id} onClick={() => { setLastRemoved(null); setPendingRemoveId(variable.id); }}>Remove habit</button>}
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
  const isPersonalLab = presentation === "personal-lab";
  if (isPersonalLab) {
    const adherencePct = achievement?.percentage ?? 0;
    const windowDays = achievement ? achievementWindowDays(achievement) : 28;
    const canConfirm = !disabled && !editMode && !confirmed && (variable.variableType === "boolean" || value !== null);
    const confirmValue = () => onChange(value === null ? true : value);
    const confirmationLabel = `Confirm ${variable.variableType === "boolean" ? value === false ? "No" : "Yes" : "displayed value"} for ${journalVariableLabel(variable)}`;
    const heading = <>
      <div className="flex items-center gap-2">
        {confirmed ? <CircleCheck size={15} aria-hidden="true" /> : skipped ? <CircleMinus size={15} aria-hidden="true" /> : <CircleDashed size={15} aria-hidden="true" />}
        <span className="journal-habit-name text-content-primary truncate">{variable.name}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-mono text-content-secondary">{adherencePct}% · {windowDays}d</span>
        <div className="w-20 h-1 bg-hairline-light rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${adherencePct > 50 ? 'bg-sage' : 'bg-content-secondary'} transition-bar`} style={{ width: `${adherencePct}%` }} />
        </div>
      </div>
    </>;
    return (
      <div className={`journal-field-row py-3.5 flex items-center justify-between gap-4 group${confirmed ? " journal-field-row--confirmed" : ""}`} data-state={confirmed ? "recorded" : skipped ? "skipped" : "pending"} onClick={(event) => {
        if (canConfirm && !(event.target as HTMLElement).closest("button, a, input, select, textarea")) confirmValue();
      }}>
        {canConfirm || editMode && onEdit ? <button type="button" className="space-y-1.5 flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={canConfirm ? confirmationLabel : `Edit ${journalVariableLabel(variable)}`} onClick={canConfirm ? confirmValue : onEdit}>{heading}</button> : <div className="space-y-1.5 flex-1 min-w-0">{heading}</div>}
        <div className="shrink-0">
          <Field variable={variable} value={value} draftKey={draftKey} onChange={onChange} onCommit={onCommit} disabled={disabled} presentation={presentation} confirmed={confirmed} />
        </div>
      </div>
    );
  }

  const stateLabel = confirmed ? "Recorded" : skipped ? "Skipped" : "To confirm";
  const state = confirmed ? "recorded" : skipped ? "skipped" : "pending";
  const isAutomatic = automatic || variable.captureMode === "automatic";
  const classes = [
    "journal-field",
    confirmed ? "journal-field--confirmed" : "",
    dayValidated ? "journal-field--day-validated" : "",
    isAutomatic ? "journal-field--automatic" : "",
    skipped ? "journal-field--skipped" : "",
    feedbackToken ? "journal-field--changed" : "",
  ].filter(Boolean).join(" ");
  const canConfirmDisplayedValue = !disabled && !editMode && !confirmed && variable.variableType !== "scale" && (value !== null || variable.variableType === "boolean");
  const achievementLabel = achievement?.percentage === null ? "Progress —" : achievement ? `Progress ${achievement.percentage}%` : null;
  const label = journalVariableLabel(variable);
  const automaticDetectionLabel = isAutomatic ? "Automatic detection" : null;
  const dayValidationLabel = dayValidated ? "Day validated" : null;
  const stateIcon = confirmed ? <CircleCheck size={15} strokeWidth={1.8} aria-hidden="true" /> : skipped ? <CircleMinus size={15} strokeWidth={1.8} aria-hidden="true" /> : <CircleDashed size={15} strokeWidth={1.8} aria-hidden="true" />;
  const accessibleState = [stateLabel, dayValidationLabel, automaticDetectionLabel?.toLocaleLowerCase("en-US")].filter(Boolean).join(", ");
  const accessibleLabel = `${label}: ${accessibleState}`;
  const editorId = `journal-variable-edit-${variable.id}`;
  const observedCount = achievement?.observedPeriods ?? 0;
  const isEarlyMaturity = achievement ? observedCount < 10 : false;
  const showSupportingMeta = !isPersonalLab;
  const achievementMeta = showSupportingMeta && achievementLabel ? <small aria-label={`${label}: ${achievementLabel}`}>{achievementLabel}</small> : null;
  const activeBadges = showSupportingMeta && activeHorizons && activeHorizons.length > 0 ? (
    <span className="journal-effect-badges" aria-label={`Strongest effect in ${activeHorizons.map(h => `${h}d`).join(", ")}`}>
      {activeHorizons.map((h) => (
        <span key={h} className="journal-effect-badge" title={`Active correlation across ${h}-day analysis window`}>
          {h}d
        </span>
      ))}
    </span>
  ) : null;

  const headingContent = (
    <>
      <span className="journal-field__emoji" aria-hidden="true">{variable.emoji}</span>
      <span className="journal-field__label">
        <span className="journal-field__label-row">
          <span className="journal-field__state-mark" data-state={state} aria-hidden="true">{stateIcon}</span>
          <span className="journal-field__label-text">
            {label}
            {activeBadges}
            {automaticDetectionLabel && (
              <span className="journal-field__automatic-indicator" role="img" aria-label={automaticDetectionLabel}>
                <ScanLine size={12} aria-hidden="true" />
              </span>
            )}
          </span>
        </span>
        {achievementMeta}
        {showSupportingMeta && isEarlyMaturity && (
          <span className="journal-maturity-indicator" title={`${observedCount}/10 observations recorded to unlock statistical analysis`}>
            <span className="journal-maturity-bar">
              <span className="journal-maturity-fill" style={{ width: `${Math.min(100, (observedCount / 10) * 100)}%` }} />
            </span>
            <span className="journal-maturity-label">{observedCount}/10d</span>
          </span>
        )}
      </span>
    </>
  );

  return <div className={classes} data-state={confirmed ? "recorded" : skipped ? "skipped" : "pending"} data-day-status={dayValidated ? "validated" : "draft"} aria-label={accessibleLabel} onClick={(event) => {
    if (canConfirmDisplayedValue && !(event.target as HTMLElement).closest("button, a, input, select, textarea")) onChange(value === null ? true : value);
  }}>
    {editMode && onEdit
      ? <button className="journal-field__heading journal-field__edit-trigger" type="button" aria-label={`Edit ${label}`} aria-expanded={editOpen} aria-controls={editorId} onClick={onEdit}>{headingContent}</button>
      : canConfirmDisplayedValue
      ? <button className="journal-field__heading journal-field__confirm-default" type="button" aria-label={`Confirm ${variable.variableType === "boolean" ? value === false ? "No" : "Yes" : "displayed value"} for ${label}${automaticDetectionLabel ? `, ${automaticDetectionLabel.toLocaleLowerCase("en-US")}` : ""}`} onClick={() => onChange(value === null ? true : value)}>{headingContent}</button>
      : <div className="journal-field__heading">{headingContent}</div>}
    {feedbackToken ? <span key={`${variable.id}-${feedbackToken}`} className="journal-field__feedback" aria-hidden="true" /> : null}
    {journalVariableKey(variable.name) === "breakfast" && value === true
      ? <div className="journal-breakfast-actions"><Field variable={variable} value={value} draftKey={draftKey} onChange={onChange} onCommit={onCommit} disabled={disabled} presentation={presentation} confirmed={confirmed} /><Link href="/meals#meal-breakfast" aria-label="Add breakfast photo"><ImagePlus size={15} aria-hidden="true" />Add photo</Link></div>
      : <Field variable={variable} value={value} draftKey={draftKey} onChange={onChange} onCommit={onCommit} disabled={disabled} presentation={presentation} confirmed={confirmed} />}
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
  const activeVariables = useMemo(() => variables.filter((variable) => variable.isActive && !isRetiredBedtimeJournalVariable(variable)).sort((first, second) => first.position - second.position), [variables]);
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
      const adherenceRate = activeVariables.length > 0
        ? Math.round((completionCount / activeVariables.length) * 100)
        : 0;

      const managerTrigger = <button ref={managerTriggerRef} className="journal-manager-trigger" type="button" aria-label={managerOpen ? "Done editing habits" : "Edit habits"} aria-expanded={managerOpen} aria-controls="journal-manager" onClick={() => {
        if (managerOpen) {
          setManagerOpen(false);
          managerTriggerRef.current?.focus();
        } else {
          setManagerOpen(true);
        }
      }}>{managerOpen ? "Done" : <><PencilLine size={14} aria-hidden="true" />Edit habits</>}</button>;

      const headerElement = isPersonalLab ? (
        <div className="journal-workspace-header pb-4 space-y-2.5">
          <div className="journal-workspace-header__row flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h1 className="workspace-panel-title font-serif text-content-primary font-normal" id="journal-title">Daily Protocol</h1>
            </div>
            <div className="journal-workspace-header__actions flex items-center gap-3">
              <button className="inline-flex min-h-9 min-w-9 items-center justify-center p-2 text-content-secondary border border-hairline hover:border-hairline-light hover:text-content-primary bg-transparent hover:bg-surface-elevated rounded transition-all duration-150 interactive-press active:scale-[0.97]" type="button" aria-label={managerOpen ? "Done editing protocol" : "Edit protocol"} title={managerOpen ? "Done editing protocol" : "Edit protocol"} aria-expanded={managerOpen} aria-controls="journal-manager" onClick={() => {
                if (managerOpen) {
                  setManagerOpen(false);
                  managerTriggerRef.current?.focus();
                } else {
                  setManagerOpen(true);
                }
              }} ref={managerTriggerRef}>
                <PencilLine size={14} aria-hidden="true" />
              </button>
              <button className={`journal-header-validate inline-flex min-h-9 items-center justify-center px-2.5 py-1 text-xs font-sans rounded transition-colors duration-150 ${validating ? "text-content-tertiary cursor-not-allowed" : "text-content-secondary hover:text-content-primary"}`} type="button" onClick={() => void validate()} disabled={validating}>
                {validating ? 'Validating…' : 'Validate day'}
              </button>
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden bg-hairline-light border border-hairline">
            <div className="h-full bg-sage rounded-full transition-bar" style={{ width: `${adherenceRate}%` }} />
          </div>
        </div>
      ) : (
        <header className="journal-card__header">
          <div className="journal-card__heading"><h2 id="journal-title">Journal</h2></div>
          <div className="journal-card__actions" role="group" aria-label="Journal actions">
            <span className={statusClass} data-draft={saveStatus === "draft" && !validating && !validated ? "true" : undefined} aria-live="polite" aria-atomic="true">
              {validating || saveStatus === "saving" ? <LoaderCircle className="journal-save-status__icon spin" size={14} aria-hidden="true" /> : saveStatus === "error" ? <span className="journal-save-status__icon journal-save-status__icon--error" aria-hidden="true">!</span> : null}
              <span>{statusText}</span>
            </span>
            {!placeValidationInMorning && validationAction}
            {!placeValidationInMorning && managerTrigger}
          </div>
        </header>
      );

      const periodNames: Record<string, string> = {
        morning: "Morning Phase",
        day: "Daytime Phase",
        evening: "Evening Phase",
        context: "Day Context & Modifiers",
      };

      return <section className={isPersonalLab ? "space-y-9" : `checkin-card journal-card journal-card--status-${statusTreatment}`} data-managing={managerOpen ? "true" : undefined} data-status-treatment={statusTreatment} aria-labelledby="journal-title">
        {headerElement}
        {tools}
        {showDateNavigation && <nav className="journal-date-strip" aria-label="Journal date">{dateOptions.map((date, index) => <button type="button" aria-current={date === entryDate ? "date" : undefined} onClick={() => changeDate(date)} key={date}><span>{index === 0 ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "")}</span><small>{date.slice(8)}</small></button>)}</nav>}
        {activeVariables.length > 0 ? <div className={isPersonalLab ? "space-y-12" : "journal-sections"}>{sections.map((section) => {
          const completedCount = section.variables.filter((variable) => recorded.has(variable.id)).length;
          const complete = completedCount === section.variables.length;
          const canConfirmDefaults = section.variables.some((variable) => !recorded.has(variable.id) && !skipped.has(variable.id) && (values[variable.id] ?? null) !== null);
          const sectionLabel = dayPeriodLabel(section.id);
          const sectionIndex = isPersonalLab ? personalLabIndexes[section.id] : undefined;
          const sectionDisplayName = isPersonalLab ? (periodNames[section.id] ?? sectionLabel) : sectionLabel;

          if (isPersonalLab) {
            const completedText = `${completedCount} sur ${section.variables.length}`;
            return (
              <section className="space-y-4" key={section.id} data-purpose={`${section.id}-habits`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-content-secondary font-medium">{sectionDisplayName}</span>
                  <span className={`text-[11px] font-mono ${complete ? 'text-sage' : 'text-content-secondary'}`}>
                    {completedText}
                  </span>
                </div>
                <div className="divide-y divide-hairline border-t border-b border-hairline">
                  {section.variables.map((variable) => (
                    <div className="journal-field-stack" key={variable.id}>
                      <JournalFieldRow variable={variable} value={values[variable.id] ?? null} draftKey={entryDate} confirmed={recorded.has(variable.id)} skipped={skipped.has(variable.id)} dayValidated={validated} automatic={automaticIds.has(variable.id)} achievement={achievementsByVariable.get(variable.id)} activeHorizons={activeEffectsByVariable instanceof Map ? activeEffectsByVariable.get(variable.id) : (activeEffectsByVariable as Record<string, number[]> | undefined)?.[variable.id]} feedbackToken={feedback?.fieldId === variable.id ? feedback.token : undefined} onCommit={() => commitField(variable.id)} disabled={false} presentation={presentation} editMode={managerOpen} editOpen={isEditing(variable)} onEdit={() => openEditor(variable)} onChange={(value) => changeValue(variable.id, value)} />
                      {editorFor(variable)}
                    </div>
                  ))}
                </div>
              </section>
            );
          }

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

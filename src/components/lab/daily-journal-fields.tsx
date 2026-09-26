import { CircleCheck, CircleDashed, CircleMinus, ImagePlus, Minus, Plus, ScanLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { dinnerTimeForDisplay, isDinnerTimeVariable, normalizeDinnerTimeInput, type JournalVariable } from "@/domain/lab/journal";
import type { JournalAchievement } from "@/domain/lab/journal-achievement";

import {
  achievementWindowDays,
  journalVariableKey,
  journalVariableLabel,
  journalVariableUnit,
  type DraftValue,
} from "./daily-journal-shared";

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

  function selectTime(nextHour: string, nextMinute: string) {
    setHour(nextHour);
    setMinute(nextMinute);
    setInvalid(false);
    if (!nextHour || !nextMinute) {
      if (!nextHour && !nextMinute) onChange(null);
      return;
    }
    const normalized = normalizeDinnerTimeInput(`${nextHour}:${nextMinute}`);
    if (normalized) onChange(normalized);
  }

  const minuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));
  // Keep a previously recorded exact minute until the user chooses a new time.
  if (minute && !minuteOptions.includes(minute)) minuteOptions.push(minute);
  minuteOptions.sort();

  return <div className={`journal-clock${invalid ? " journal-clock--invalid" : ""}`} id={inputId} role="group" aria-label="Dinner end time" aria-describedby={invalid ? errorId : undefined} onBlur={(event) => {
    if (event.target instanceof HTMLSelectElement) return;
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) commit();
  }} onKeyDown={(event) => { if (event.target instanceof HTMLSelectElement) return; if (event.key === "Enter") { event.preventDefault(); commit(); } }}>
    <div className="journal-clock__desktop">
    <input disabled={disabled} aria-label="Dinner end time" aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} inputMode="numeric" autoComplete="off" placeholder="HH" type="text" value={hour} onChange={(event) => {
      const next = digits(event.target.value, 2);
      setHour(next);
      setInvalid(false);
      if (next.length === 2) minuteRef.current?.focus();
    }} />
    <span aria-hidden="true">:</span>
    <input ref={minuteRef} disabled={disabled} aria-label="Dinner end minutes" aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} inputMode="numeric" autoComplete="off" placeholder="MM" type="text" value={minute} onChange={(event) => { setMinute(digits(event.target.value, 2)); setInvalid(false); }} />
    </div>
    <div className="journal-clock__mobile">
      <select disabled={disabled} aria-label="Dinner end hour" value={hour} onChange={(event) => selectTime(event.target.value, minute)}>
        <option value="">HH</option>
        {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select disabled={disabled} aria-label="Dinner end minute" value={minute} onChange={(event) => selectTime(hour, event.target.value)}>
        <option value="">MM</option>
        {minuteOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
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
export function JournalFieldRow({ variable, value, draftKey, confirmed, skipped, dayValidated, automatic = false, achievement, activeHorizons, onChange, onCommit, feedbackToken, disabled, presentation = "default", editMode = false, editOpen = false, onEdit }: { variable: JournalVariable; value: DraftValue; draftKey: string; confirmed: boolean; skipped: boolean; dayValidated: boolean; automatic?: boolean; achievement?: JournalAchievement; activeHorizons?: readonly number[]; onChange: (value: DraftValue) => void; onCommit?: () => void; feedbackToken?: number; disabled: boolean; presentation?: "default" | "personal-lab"; editMode?: boolean; editOpen?: boolean; onEdit?: () => void }) {
  const isPersonalLab = presentation === "personal-lab";
  if (isPersonalLab) {
    const adherencePct = achievement?.percentage ?? 0;
    const windowDays = achievement ? achievementWindowDays(achievement) : 28;
    const canConfirm = !disabled && !editMode && !confirmed && (variable.variableType === "boolean" || value !== null);
    const confirmValue = () => onChange(value === null ? true : value);
    const confirmationLabel = `Confirm ${variable.variableType === "boolean" ? value === false ? "No" : "Yes" : "displayed value"} for ${journalVariableLabel(variable)}`;
    const heading = <>
      <div className="flex items-center gap-2">
        <span key={`row-mark-${variable.id}-${feedbackToken ?? "idle"}`} className="journal-field-row__state-icon" aria-hidden="true">
          {confirmed ? <CircleCheck size={15} /> : skipped ? <CircleMinus size={15} /> : <CircleDashed size={15} />}
        </span>
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
      <div className={`journal-field-row py-3.5 flex items-center justify-between gap-4 group${confirmed ? " journal-field-row--confirmed" : ""}${feedbackToken ? " journal-field-row--changed" : ""}`} data-state={confirmed ? "recorded" : skipped ? "skipped" : "pending"} onClick={(event) => {
        if (canConfirm && !(event.target as HTMLElement).closest("button, a, input, select, textarea")) confirmValue();
      }}>
        {canConfirm || editMode && onEdit ? <button type="button" className="space-y-1.5 flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={canConfirm ? confirmationLabel : `Edit ${journalVariableLabel(variable)}`} onClick={canConfirm ? confirmValue : onEdit}>{heading}</button> : <div className="space-y-1.5 flex-1 min-w-0">{heading}</div>}
        <div className="shrink-0">
          <Field variable={variable} value={value} draftKey={draftKey} onChange={onChange} onCommit={onCommit} disabled={disabled} presentation={presentation} confirmed={confirmed} />
        </div>
        {feedbackToken ? <span key={`row-feedback-${variable.id}-${feedbackToken}`} className="journal-field-row__feedback" aria-hidden="true" /> : null}
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

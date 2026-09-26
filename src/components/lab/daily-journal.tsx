"use client";

import { Check, LoaderCircle, PencilLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  isRetiredBedtimeJournalVariable,
  journalDayPeriods,
  journalDraftsForDates,
  journalEntriesForSave,
  journalValuesForDate,
  reconcileJournalDrafts,
  updateJournalDraft,
  type JournalDay,
  type JournalDraftsByDate,
  type JournalEntry,
  type JournalVariable,
} from "@/domain/lab/journal";
import type { JournalAchievement } from "@/domain/lab/journal-achievement";

import { JournalFieldRow } from "./daily-journal-fields";
import styles from "./daily-journal-feedback.module.css";
import {
  addDays,
  dayPeriodLabel,
  displayedDayPeriod,
  journalDisplayOrder,
  journalStatusText,
  journalVariableKey,
  textNumericTypes,
  type DraftValue,
  type JournalSaveStatus,
  type JournalStatusTreatment,
} from "./daily-journal-shared";
import { VariableManager } from "./daily-journal-variable-manager";

export { journalStatusText };
export type { JournalStatusTreatment };

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
  const [validatedDates, setValidatedDates] = useState<Set<string>>(() => new Set());
  const [saveStatus, setSaveStatus] = useState<JournalSaveStatus>("draft");
  const [error, setError] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const managerTriggerRef = useRef<HTMLButtonElement>(null);
  const managerRef = useRef<HTMLElement>(null);
  const [feedback, setFeedback] = useState<{ fieldId: string; token: number } | null>(null);
  const [completionNotice, setCompletionNotice] = useState<{ date: string } | null>(null);
  const [completionRevision, setCompletionRevision] = useState(0);
  const [recordedByDate, setRecordedByDate] = useState<Record<string, Set<string>>>(() => Object.fromEntries(dateOptions.map((date) => [date, new Set(entries.filter((entry) => entry.entryDate === date).map((entry) => entry.variableId))])));
  const recordedByDateRef = useRef(recordedByDate);
  const [skippedByDate, setSkippedByDate] = useState<Record<string, Set<string>>>(() => Object.fromEntries(dateOptions.map((date) => [date, new Set(days.find((day) => day.entryDate === date)?.omittedVariableIds ?? [])])));
  const [manualOverrideKeys, setManualOverrideKeys] = useState<Set<string>>(() => new Set());
  const manualOverrideKeysRef = useRef(manualOverrideKeys);
  const feedbackSequence = useRef(0);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionNoticeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNumericFeedback = useRef(new Set<string>());
  const day = days.find((candidate) => candidate.entryDate === entryDate);
  const validated = day?.status === "validated" || validatedDates.has(entryDate);
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

  function isDateFullyRecorded(date: string, dateRecorded: ReadonlySet<string>, overrides: ReadonlySet<string>) {
    return activeVariables.length > 0 && activeVariables.every((variable) => dateRecorded.has(variable.id) || (automaticIdsByDate[date]?.has(variable.id) === true && !overrides.has(`${date}:${variable.id}`)));
  }

  useEffect(() => {
    onCompletionChange?.(completionCount, activeVariables.length);
  }, [activeVariables.length, completionCount, completionRevision, entryDate, onCompletionChange]);

  useEffect(() => () => {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    if (completionNoticeTimeout.current) clearTimeout(completionNoticeTimeout.current);
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
    clearCompletionNotice();
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

  function clearCompletionNotice() {
    if (completionNoticeTimeout.current) clearTimeout(completionNoticeTimeout.current);
    completionNoticeTimeout.current = null;
    setCompletionNotice(null);
  }

  function announceCompletion(date: string) {
    if (presentation !== "personal-lab") return;
    if (completionNoticeTimeout.current) clearTimeout(completionNoticeTimeout.current);
    setCompletionNotice({ date });
    completionNoticeTimeout.current = setTimeout(() => {
      setCompletionNotice((current) => current?.date === date ? null : current);
      completionNoticeTimeout.current = null;
    }, 3600);
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
    if (mode === "validate" && !result.preview && result.status !== "validated") {
      throw new Error("La validation n’a pas été confirmée par le serveur.");
    }
  }

  function queueDraft(date: string, variableId: string, draftValues: Record<string, DraftValue>) {
    pendingSavesByDate.current[date] = (pendingSavesByDate.current[date] ?? 0) + 1;
    setSaveStatus("saving");
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => persist(date, "draft", draftValues, variableId))
      .then(() => {
        const breakfast = activeVariables.find((variable) => variable.id === variableId && variable.variableType === "boolean" && journalVariableKey(variable.name) === "breakfast");
        const dayIsValidated = days.some((candidate) => candidate.entryDate === date && candidate.status === "validated") || validatedDates.has(date);
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
      setValidatedDates((current) => new Set(current).add(date));
      if (date === selectedDateRef.current) {
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
    clearCompletionNotice();
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
    const currentRecordedByDate = recordedByDateRef.current;
    const currentDateRecorded = currentRecordedByDate[date] ?? new Set<string>();
    const wasFullyRecorded = isDateFullyRecorded(date, currentDateRecorded, manualOverrideKeysRef.current);
    const nextRecorded = new Set(currentDateRecorded);
    if (value === null) nextRecorded.delete(variableId);
    else nextRecorded.add(variableId);
    const nextRecordedByDate = { ...currentRecordedByDate, [date]: nextRecorded };
    recordedByDateRef.current = nextRecordedByDate;
    setRecordedByDate(nextRecordedByDate);
    const nextManualOverrideKeys = new Set(manualOverrideKeysRef.current);
    if (automaticIdsByDate[date]?.has(variableId)) nextManualOverrideKeys.add(`${date}:${variableId}`);
    manualOverrideKeysRef.current = nextManualOverrideKeys;
    setManualOverrideKeys(nextManualOverrideKeys);
    const isNowFullyRecorded = isDateFullyRecorded(date, nextRecorded, nextManualOverrideKeys);
    if (!wasFullyRecorded && isNowFullyRecorded) announceCompletion(date);
    else if (!isNowFullyRecorded && presentation === "personal-lab") clearCompletionNotice();
    const next = updateJournalDraft(drafts.current, date, variableId, value);
    drafts.current = next;
    setDraftsByDate(next);
    setSkippedByDate((current) => {
      const nextSkipped = new Set(current[date] ?? []);
      if (value === null) nextSkipped.add(variableId);
      else nextSkipped.delete(variableId);
      return { ...current, [date]: nextSkipped };
    });
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
        <div className="journal-workspace-header pb-4 max-sm:pb-2 space-y-2.5">
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
              {validated ? <span className="journal-header-validated inline-flex min-h-9 items-center gap-1.5 px-2.5 text-xs" role="status"><Check size={13} aria-hidden="true" />Validated</span> : <button className={`journal-header-validate inline-flex min-h-9 items-center justify-center px-2.5 py-1 text-xs font-sans rounded transition-colors duration-150 ${validating ? "text-content-tertiary cursor-not-allowed" : "text-content-secondary hover:text-content-primary"}`} type="button" onClick={() => void validate()} disabled={validating}>
                {validating ? 'Validating…' : 'Validate day'}
              </button>}
            </div>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden bg-hairline-light border border-hairline">
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

      return <section className={isPersonalLab ? "space-y-0 max-sm:space-y-3" : `checkin-card journal-card journal-card--status-${statusTreatment}`} data-managing={managerOpen ? "true" : undefined} data-status-treatment={statusTreatment} aria-labelledby="journal-title">
        {headerElement}
        {tools}
        {showDateNavigation && <nav className="journal-date-strip" aria-label="Journal date">{dateOptions.map((date, index) => <button type="button" aria-current={date === entryDate ? "date" : undefined} onClick={() => changeDate(date)} key={date}><span>{index === 0 ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "")}</span><small>{date.slice(8)}</small></button>)}</nav>}
        {activeVariables.length > 0 ? <div className={isPersonalLab ? "space-y-6" : "journal-sections"}>{sections.map((section) => {
          const completedCount = section.variables.filter((variable) => recorded.has(variable.id)).length;
          const complete = completedCount === section.variables.length;
          const canConfirmDefaults = section.variables.some((variable) => !recorded.has(variable.id) && !skipped.has(variable.id) && (values[variable.id] ?? null) !== null);
          const sectionLabel = dayPeriodLabel(section.id);
          const sectionIndex = isPersonalLab ? personalLabIndexes[section.id] : undefined;
          const sectionDisplayName = isPersonalLab ? (periodNames[section.id] ?? sectionLabel) : sectionLabel;

          if (isPersonalLab) {
            return (
              <section key={section.id} data-purpose={`${section.id}-habits`} aria-label={sectionDisplayName}>
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
        {isPersonalLab && completionNotice?.date === entryDate && typeof document !== "undefined" && createPortal(<div className={`journal-completion-notice ${styles.completionToast}`} role="status" aria-live="polite" aria-atomic="true"><Check size={16} aria-hidden="true" /><span>All habits are filled in.</span></div>, document.body)}
      </section>;
    }}
  </VariableManager>;
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PersonalLabJournal } from "@/services/personal-lab";

import { DailyJournal } from "./daily-journal";
import { breakfastIsExplicitlySkipped } from "./meal-quick-capture";
import MealJournal from "../meal-journal";
import type { MealDesignVariant } from "./meal-card-variants";
import MealSupplements from "../meal-supplements";
import styles from "./personal-lab-journal-workspace.module.css";

const designVariants: ReadonlyArray<{ id: MealDesignVariant; label: string }> = [
  { id: "v1", label: "Row" },
  { id: "v2", label: "Grid" },
  { id: "v3", label: "Split" },
];

export const JOURNAL_PROGRESS_EVENT = "soma:journal-progress";

function dateFromUrl() {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("date");
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
}

export function PersonalLabDateStrip({
  dates,
  selectedDate,
  todayDate,
  completedDates = new Set<string>(),
  disabled = false,
  progressByDate,
  onDateChange,
}: {
  dates: readonly string[];
  selectedDate: string;
  todayDate: string;
  completedDates?: ReadonlySet<string>;
  disabled?: boolean;
  progressByDate?: Record<string, { count: number; total: number }>;
  onDateChange: (date: string) => void;
}) {
  const initialStart = Math.max(0, Math.min(dates.length - 3, dates.indexOf(selectedDate) - 1));
  const [mobileStart, setMobileStart] = useState(initialStart);
  const selectedIndex = dates.indexOf(selectedDate);
  const mobileWindowStart = selectedIndex >= 0 && (selectedIndex < mobileStart || selectedIndex >= mobileStart + 3)
    ? Math.max(0, Math.min(dates.length - 3, selectedIndex - 1))
    : mobileStart;

  function renderDate(date: string) {
    const isSelected = date === selectedDate;
    const isToday = date === todayDate;
    const isCompleted = completedDates.has(date);
    const progress = progressByDate?.[date];
    const progressLabel = progress ? `${progress.count}/${progress.total}` : null;
    const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
    return (
      <button
        key={date}
        type="button"
        disabled={disabled}
        aria-current={isSelected ? "date" : undefined}
        onClick={() => onDateChange(date)}
        className={`${isSelected ? "is-selected" : ""} personal-lab-day-strip__day flex flex-col items-center justify-center py-1.5 px-2 rounded transition-all duration-150 relative interactive-press active:scale-[0.96]`}
      >
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-content-secondary">
          <span className={`${isSelected ? "text-content-primary " : ""}personal-lab-day-strip__label`} data-mobile-label={isToday ? "Today" : weekday}>{isToday ? `Today, ${monthDay}` : weekday}</span>
          {!isSelected && <span className={isCompleted ? "text-sage text-[10px]" : "text-content-tertiary text-[10px]"} aria-hidden="true">{isCompleted ? "✓" : "•"}</span>}
        </div>
        {progressLabel && <span className={`${isSelected ? "text-sage-muted" : "text-content-tertiary"} text-[10px] font-mono mt-0.5`}>{progressLabel}</span>}
        <span className="sr-only">{formatDate(date)}</span>
      </button>
    );
  }

  return (
    <section className="w-full bg-surface-card/40 personal-lab-day-strip overflow-hidden" data-purpose="timeline-selector" aria-label="Shared day between meals and journal">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-3 w-full min-w-0">
        <div className="personal-lab-day-strip__desktop personal-lab-day-strip__days" role="group" aria-label="Available days">
          {dates.map(renderDate)}
        </div>
        <div className="personal-lab-day-strip__mobile" role="group" aria-label="Available days">
          <button type="button" className="personal-lab-day-strip__arrow" aria-label="Show previous days" disabled={disabled || mobileWindowStart === 0} onClick={() => setMobileStart(Math.max(0, mobileWindowStart - 3))}>‹</button>
          <div className="personal-lab-day-strip__mobile-days">{dates.slice(mobileWindowStart, mobileWindowStart + 3).map(renderDate)}</div>
          <button type="button" className="personal-lab-day-strip__arrow" aria-label="Show next days" disabled={disabled || mobileWindowStart >= dates.length - 3} onClick={() => setMobileStart(Math.min(Math.max(0, dates.length - 3), mobileWindowStart + 3))}>›</button>
        </div>
      </div>
    </section>
  );
}

export function PersonalLabJournalWorkspace({
  data,
  recentDatesFirst = false,
  selectedDate: controlledSelectedDate,
  onDateChange: controlledOnDateChange,
  availableDates: controlledDates,
  showVariantSwitcher = false,
  hideAddMealButton = false,
}: {
  data: PersonalLabJournal;
  recentDatesFirst?: boolean;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  availableDates?: readonly string[];
  showVariantSwitcher?: boolean;
  hideAddMealButton?: boolean;
}) {
  const defaultDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(data.todayDate, index - 6)), [data.todayDate]);
  const dates = controlledDates ?? defaultDates;
  const [internalSelectedDate, setInternalSelectedDate] = useState(() => {
    return data.todayDate;
  });
  const selectedDate = controlledSelectedDate ?? internalSelectedDate;
  const onDateChange = controlledOnDateChange ?? setInternalSelectedDate;
  useEffect(() => {
    if (controlledSelectedDate !== undefined) return;
    const urlDate = dateFromUrl();
    if (!urlDate || !dates.includes(urlDate)) return;
    const apply = window.setTimeout(() => setInternalSelectedDate((current) => current === urlDate ? current : urlDate), 0);
    return () => window.clearTimeout(apply);
  }, [controlledSelectedDate, dates]);
  // Lien profond / refresh : sans contrôle parent, la date lue en URL fait foi
  // à l’initialisation et chaque changement est répercuté en ?date= pour le retour arrière.
  useEffect(() => {
    if (controlledSelectedDate !== undefined || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return;
    const urlDate = dateFromUrl();
    if (urlDate && dates.includes(urlDate) && urlDate !== selectedDate) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("date") === selectedDate) return;
    url.searchParams.set("date", selectedDate);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [dates, selectedDate, controlledSelectedDate]);
  useEffect(() => {
    if (controlledSelectedDate !== undefined) return;
    function onPopState() {
      const urlDate = dateFromUrl();
      if (urlDate && dates.includes(urlDate)) setInternalSelectedDate(urlDate);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [controlledSelectedDate, dates]);
  const [breakfastDisabled, setBreakfastDisabled] = useState(() => breakfastIsExplicitlySkipped({ todayDate: data.todayDate, variables: data.journal.variables, entries: data.journal.entries, days: data.journal.days }));
  const activeDate = dates.includes(selectedDate) ? selectedDate : data.todayDate;
  const completedDates = useMemo(() => new Set(data.journal.days.filter((day) => day.status === "validated").map((day) => day.entryDate)), [data.journal.days]);
  const activeVariables = useMemo(() => data.journal.variables.filter((variable) => variable.isActive), [data.journal.variables]);
  const progressForDate = useMemo(() => {
    const activeIds = new Set(activeVariables.map((variable) => variable.id));
    const omittedIds = new Set(data.journal.days.find((day) => day.entryDate === activeDate)?.omittedVariableIds ?? []);
    const recordedIds = new Set(data.journal.entries
      .filter((entry) => entry.entryDate === activeDate && activeIds.has(entry.variableId) && !omittedIds.has(entry.variableId))
      .map((entry) => entry.variableId));
    return { count: recordedIds.size, total: activeVariables.length };
  }, [activeDate, activeVariables, data.journal.days, data.journal.entries]);
  const [designVariant, setDesignVariant] = useState<MealDesignVariant>("v1");
  const [journalProgressOverride, setJournalProgressOverride] = useState<{ date: string; count: number; total: number } | null>(null);
  const journalProgress = journalProgressOverride?.date === activeDate ? journalProgressOverride : progressForDate;
  const handleCompletionChange = useCallback((count: number, total: number) => {
    setJournalProgressOverride({ date: activeDate, count, total });
  }, [activeDate]);

  useEffect(() => {
    const detail = { date: activeDate, count: journalProgress.count, total: journalProgress.total };
    const emit = () => window.dispatchEvent(new CustomEvent(JOURNAL_PROGRESS_EVENT, { detail }));
    // The hero mounts before this workspace, so the first synchronous event
    // can race the hero's listener. The deferred retry makes the initial
    // progress visible even when the journal resolves through Suspense.
    emit();
    const retry = window.setTimeout(emit, 0);
    return () => window.clearTimeout(retry);
  }, [activeDate, journalProgress.count, journalProgress.total]);

  const progressByDate = useMemo(() => {
    const activeIds = new Set(activeVariables.map((variable) => variable.id));
    const result: Record<string, { count: number; total: number }> = {};
    for (const d of dates) {
      const omittedIds = new Set(data.journal.days.find((day) => day.entryDate === d)?.omittedVariableIds ?? []);
      const recordedIds = new Set(
        data.journal.entries
          .filter((entry) => entry.entryDate === d && activeIds.has(entry.variableId) && !omittedIds.has(entry.variableId))
          .map((entry) => entry.variableId)
      );
      result[d] = { count: recordedIds.size, total: activeVariables.length };
    }
    return result;
  }, [activeVariables, data.journal.days, data.journal.entries, dates]);

  const effectiveProgressByDate = useMemo(() => {
    if (!journalProgressOverride || journalProgressOverride.date !== activeDate) {
      return progressByDate;
    }
    return {
      ...progressByDate,
      [activeDate]: { count: journalProgressOverride.count, total: journalProgressOverride.total },
    };
  }, [activeDate, journalProgressOverride, progressByDate]);

  const sharedDateNavigation = (
    <PersonalLabDateStrip
      dates={recentDatesFirst ? [...dates].reverse() : dates}
      selectedDate={activeDate}
      todayDate={data.todayDate}
      completedDates={completedDates}
      progressByDate={effectiveProgressByDate}
      onDateChange={onDateChange}
    />
  );
  const disabledSlots = activeDate === data.todayDate && breakfastDisabled ? ["breakfast"] as const : [];

  const activeEffectsByVariable = useMemo(() => {
    const rawMatrix = "matrix" in data ? (data as unknown as { matrix?: { meaningfulRelations?: Array<{ predictorId: string; period: unknown }> } }).matrix : undefined;
    const map = new Map<string, Array<15 | 30 | 90>>();
    if (!rawMatrix?.meaningfulRelations) return map;
    for (const rel of rawMatrix.meaningfulRelations) {
      if (typeof rel.predictorId === "string" && rel.predictorId.startsWith("journal:")) {
        const id = rel.predictorId.slice("journal:".length);
        const period = Number(rel.period);
        if (period === 15 || period === 30 || period === 90) {
          const list = map.get(id) ?? [];
          if (!list.includes(period as 15 | 30 | 90)) {
            list.push(period as 15 | 30 | 90);
            list.sort((a, b) => a - b);
            map.set(id, list);
          }
        }
      }
    }
    return map;
  }, [data]);

  return <div className="personal-lab-workspace w-full max-w-full overflow-x-clip" data-design-variant={designVariant}>
    {sharedDateNavigation}
    {showVariantSwitcher ? <div className={styles.controlRow}>
      <fieldset className={styles.variantSwitcher}>
        <legend>Local comparison</legend>
        <div className={styles.variantButtons} role="group" aria-label="Visual variants">
          {designVariants.map((variant) => <button key={variant.id} type="button" title={`Layout ${variant.label}`} aria-pressed={designVariant === variant.id} onClick={() => setDesignVariant(variant.id)}>{variant.label}</button>)}
        </div>
      </fieldset>
    </div> : null}
    <div className={`personal-lab-workbench ${styles.stitchWorkbench} max-w-[1360px] mx-auto px-6 py-8 w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-start`}>
      <div key={`meal-${activeDate}`} className={`personal-lab-meal-column ${styles.stitchMealColumn} lg:col-span-5 lg:order-2 space-y-7 animate-date-fade animate-stagger-1`} data-purpose="nutrition-journal">
        <MealJournal date={data.todayDate} today={data.todayDate} className="meal-journal-lab" variant="lab" selectedDate={activeDate} onDateChange={onDateChange} showDateNavigation={false} publishMealTotals disabledSlots={disabledSlots} hideAddMealButton={hideAddMealButton} allowTargetEditing designVariant="v1" />
      </div>
      <div key={`journal-${activeDate}`} className={`personal-lab-journal-column ${styles.stitchProtocolColumn} lg:col-span-7 lg:order-1 space-y-9 animate-date-fade`} id="daily-journal" data-purpose="daily-protocol-journal">
        <DailyJournal presentation="personal-lab" variables={data.journal.variables} entries={data.journal.entries} days={data.journal.days} achievements={data.journal.achievements} todayDate={data.todayDate} selectedDate={activeDate} onDateChange={onDateChange} showDateNavigation={false} availableDates={dates} onTodayBreakfastValidation={setBreakfastDisabled} activeEffectsByVariable={activeEffectsByVariable} statusTreatment={designVariant} onCompletionChange={handleCompletionChange} />
        <MealSupplements date={activeDate} initialDefinitions={data.supplements.definitions} initialEntries={data.supplements.entries} initialError={data.supplements.error} compact />
      </div>
    </div>
  </div>;
}

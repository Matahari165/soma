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

function sharedDateLabel(date: string, todayDate: string) {
  const offset = Math.round((new Date(`${todayDate}T12:00:00Z`).getTime() - new Date(`${date}T12:00:00Z`).getTime()) / 86_400_000);
  if (offset === 0) return "Today";
  if (offset === 1) return "Yesterday";
  if (offset === 2) return "2 days ago";
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${date}T12:00:00`));
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
}

export function PersonalLabDateStrip({ dates, selectedDate, todayDate, completedDates = new Set<string>(), disabled = false, onDateChange }: { dates: readonly string[]; selectedDate: string; todayDate: string; completedDates?: ReadonlySet<string>; disabled?: boolean; onDateChange: (date: string) => void }) {
  return <nav className="personal-lab-day-strip" aria-label="Shared day between meals and journal">
    <div className="personal-lab-day-strip__days" role="group" aria-label="Available days">
      {dates.map((date) => <button key={date} type="button" disabled={disabled} aria-current={date === selectedDate ? "date" : undefined} onClick={() => onDateChange(date)}>
        <span>{sharedDateLabel(date, todayDate)}</span>
        <small>{new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`))}{completedDates.has(date) ? <span className="personal-lab-day-strip__check" aria-hidden="true">✓</span> : null}</small>
        <span className="sr-only">{formatDate(date)}</span>
      </button>)}
    </div>
  </nav>;
}

export function PersonalLabJournalWorkspace({
  data,
  recentDatesFirst = false,
  selectedDate: controlledSelectedDate,
  onDateChange: controlledOnDateChange,
  availableDates: controlledDates,
  showVariantSwitcher = false,
}: {
  data: PersonalLabJournal;
  recentDatesFirst?: boolean;
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  availableDates?: readonly string[];
  showVariantSwitcher?: boolean;
}) {
  const defaultDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(data.todayDate, index - 6)), [data.todayDate]);
  const dates = controlledDates ?? defaultDates;
  const [internalSelectedDate, setInternalSelectedDate] = useState(() => {
    const urlDate = controlledSelectedDate === undefined ? dateFromUrl() : null;
    if (urlDate && (controlledDates ?? defaultDates).includes(urlDate)) return urlDate;
    return data.todayDate;
  });
  const selectedDate = controlledSelectedDate ?? internalSelectedDate;
  const onDateChange = controlledOnDateChange ?? setInternalSelectedDate;
  // Lien profond / refresh : sans contrôle parent, la date lue en URL fait foi
  // à l’initialisation et chaque changement est répercuté en ?date= pour le retour arrière.
  useEffect(() => {
    if (controlledSelectedDate !== undefined || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("date") === selectedDate) return;
    url.searchParams.set("date", selectedDate);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [selectedDate, controlledSelectedDate]);
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
    window.dispatchEvent(new CustomEvent(JOURNAL_PROGRESS_EVENT, {
      detail: { date: activeDate, count: journalProgress.count, total: journalProgress.total },
    }));
  }, [activeDate, journalProgress.count, journalProgress.total]);

  const sharedDateNavigation = <PersonalLabDateStrip dates={recentDatesFirst ? [...dates].reverse() : dates} selectedDate={activeDate} todayDate={data.todayDate} completedDates={completedDates} onDateChange={onDateChange} />;
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

  return <div className="personal-lab-workspace" data-design-variant={designVariant}>
    {sharedDateNavigation}
    {showVariantSwitcher ? <div className={styles.controlRow}>
      <fieldset className={styles.variantSwitcher}>
        <legend>Local comparison</legend>
        <div className={styles.variantButtons} role="group" aria-label="Visual variants">
          {designVariants.map((variant) => <button key={variant.id} type="button" title={`Layout ${variant.label}`} aria-pressed={designVariant === variant.id} onClick={() => setDesignVariant(variant.id)}>{variant.label}</button>)}
        </div>
      </fieldset>
    </div> : null}
    <div className="personal-lab-workbench">
      <div className="personal-lab-meal-column">
        <MealJournal date={data.todayDate} today={data.todayDate} className="meal-journal-lab" variant="lab" selectedDate={activeDate} onDateChange={onDateChange} showDateNavigation={false} publishMealTotals disabledSlots={disabledSlots} designVariant="v1" />
      </div>
      <div className="personal-lab-journal-column" id="daily-journal">
        <DailyJournal presentation="personal-lab" variables={data.journal.variables} entries={data.journal.entries} days={data.journal.days} achievements={data.journal.achievements} todayDate={data.todayDate} selectedDate={activeDate} onDateChange={onDateChange} showDateNavigation={false} availableDates={dates} onTodayBreakfastValidation={setBreakfastDisabled} activeEffectsByVariable={activeEffectsByVariable} statusTreatment={designVariant} onCompletionChange={handleCompletionChange} />
        <MealSupplements date={activeDate} initialDefinitions={data.supplements.definitions} initialEntries={data.supplements.entries} initialError={data.supplements.error} compact />
      </div>
    </div>
  </div>;
}

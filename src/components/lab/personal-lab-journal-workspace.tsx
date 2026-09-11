"use client";

import { useCallback, useMemo, useState } from "react";
import type { PersonalLabJournal } from "@/services/personal-lab";

import { DailyJournal } from "./daily-journal";
import { breakfastIsExplicitlySkipped } from "./meal-quick-capture";
import MealJournal from "../meal-journal";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function sharedDateLabel(date: string, todayDate: string) {
  const offset = Math.round((new Date(`${todayDate}T12:00:00Z`).getTime() - new Date(`${date}T12:00:00Z`).getTime()) / 86_400_000);
  if (offset === 0) return "Aujourd’hui";
  if (offset === 1) return "Hier";
  if (offset === 2) return "Avant-hier";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "");
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
}

export function PersonalLabDateStrip({ dates, selectedDate, todayDate, completedDates = new Set<string>(), disabled = false, onDateChange }: { dates: readonly string[]; selectedDate: string; todayDate: string; completedDates?: ReadonlySet<string>; disabled?: boolean; onDateChange: (date: string) => void }) {
  return <nav className="personal-lab-day-strip" aria-label="Jour partagé entre les repas et le journal">
    <div className="personal-lab-day-strip__days" role="group" aria-label="Jours disponibles">
      {dates.map((date) => <button key={date} type="button" disabled={disabled} aria-current={date === selectedDate ? "date" : undefined} onClick={() => onDateChange(date)}>
        <span>{sharedDateLabel(date, todayDate)}</span>
        <small>{new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "")}{completedDates.has(date) ? <span className="personal-lab-day-strip__check" aria-hidden="true">✓</span> : null}</small>
        <span className="sr-only">{formatDate(date)}</span>
      </button>)}
    </div>
  </nav>;
}

export function PersonalLabJournalWorkspace({ data }: { data: PersonalLabJournal }) {
  const dates = useMemo(() => Array.from({ length: 6 }, (_, index) => addDays(data.todayDate, index - 5)), [data.todayDate]);
  const [selectedDate, setSelectedDate] = useState(data.todayDate);
  const [breakfastDisabled, setBreakfastDisabled] = useState(() => breakfastIsExplicitlySkipped({ todayDate: data.todayDate, variables: data.journal.variables, entries: data.journal.entries, days: data.journal.days }));
  const onDateChange = useCallback((date: string) => setSelectedDate(date), []);
  const activeDate = dates.includes(selectedDate) ? selectedDate : data.todayDate;
  const completedDates = useMemo(() => new Set(data.journal.days.filter((day) => day.status === "validated").map((day) => day.entryDate)), [data.journal.days]);

  const sharedDateNavigation = <PersonalLabDateStrip dates={dates} selectedDate={activeDate} todayDate={data.todayDate} completedDates={completedDates} onDateChange={onDateChange} />;
  const disabledSlots = activeDate === data.todayDate && breakfastDisabled ? ["breakfast"] as const : [];

  return <div className="personal-lab-workspace">
    {sharedDateNavigation}
    <div className="personal-lab-workbench">
      <div className="personal-lab-journal-column" id="daily-journal">
        <DailyJournal presentation="personal-lab" variables={data.journal.variables} entries={data.journal.entries} days={data.journal.days} achievements={data.journal.achievements} todayDate={data.todayDate} selectedDate={activeDate} onDateChange={onDateChange} showDateNavigation={false} availableDates={dates} onTodayBreakfastValidation={setBreakfastDisabled} />
      </div>
      <div className="personal-lab-meal-column">
        <MealJournal date={data.todayDate} today={data.todayDate} className="meal-journal-lab" variant="lab" selectedDate={activeDate} onDateChange={onDateChange} showDateNavigation={false} publishMealTotals disabledSlots={disabledSlots} />
      </div>
    </div>
  </div>;
}

"use client";

import { useState } from "react";

import type { PersonalLabJournal } from "@/services/personal-lab";

import { DailyJournal } from "./daily-journal";
import { breakfastIsExplicitlySkipped, morningJournalIsConfirmed, MealQuickCapture } from "./meal-quick-capture";

export function PersonalLabJournalWorkspace({ data }: { data: PersonalLabJournal }) {
  const initialBreakfastDisabled = breakfastIsExplicitlySkipped({ todayDate: data.todayDate, variables: data.journal.variables, entries: data.journal.entries, days: data.journal.days });
  const [breakfastDisabled, setBreakfastDisabled] = useState(initialBreakfastDisabled);
  const initialMorningJournalCompleted = morningJournalIsConfirmed({ todayDate: data.todayDate, variables: data.journal.variables, entries: data.journal.entries, days: data.journal.days });
  const [morningJournalCompleted, setMorningJournalCompleted] = useState(initialMorningJournalCompleted);

  return <>
    <MealQuickCapture todayDate={data.todayDate} variables={data.journal.variables} entries={data.journal.entries} days={data.journal.days} breakfastDisabledOverride={breakfastDisabled} morningJournalCompletedOverride={morningJournalCompleted} />
    <div id="daily-journal"><DailyJournal variables={data.journal.variables} entries={data.journal.entries} days={data.journal.days} todayDate={data.todayDate} onTodayBreakfastValidation={setBreakfastDisabled} onTodayMorningValidation={setMorningJournalCompleted} /></div>
  </>;
}

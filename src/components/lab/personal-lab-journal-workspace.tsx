"use client";

import { useState } from "react";
import type { PersonalLabJournal } from "@/services/personal-lab";

import { DailyJournal } from "./daily-journal";
import { breakfastIsExplicitlySkipped } from "./meal-quick-capture";
import MealJournal from "../meal-journal";

export function PersonalLabJournalWorkspace({ data }: { data: PersonalLabJournal }) {
  const [breakfastDisabled, setBreakfastDisabled] = useState(() => breakfastIsExplicitlySkipped({ todayDate: data.todayDate, variables: data.journal.variables, entries: data.journal.entries, days: data.journal.days }));

  return <>
    <MealJournal date={data.todayDate} today={data.todayDate} className="meal-journal-home" disabledSlots={breakfastDisabled ? ["breakfast"] : []} />
    <div id="daily-journal"><DailyJournal variables={data.journal.variables} entries={data.journal.entries} days={data.journal.days} todayDate={data.todayDate} onTodayBreakfastValidation={setBreakfastDisabled} /></div>
  </>;
}

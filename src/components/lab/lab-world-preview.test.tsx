import { Suspense, type ReactElement } from "react";
import { describe, expect, it } from "vitest";

import type { PersonalLabJournal, PersonalLabOverview } from "@/services/personal-lab";
import { LabWorldJournalPreview, LabWorldPreview } from "./lab-world-preview";
import { LabWorldWorkspace } from "./lab-world-workspace";
import { PersonalLabJournalWorkspace } from "./personal-lab-journal-workspace";

function overview(): PersonalLabOverview {
  return {
    todayDate: "2026-09-15",
    overnightFingerprint: null,
    greetingName: "Jérémy",
    timeZone: "Europe/Zurich",
    today: {
      sleepMinutes: null,
      sleepRegularity: null,
      recoveryScore: null,
      effortScore: null,
      effortCoverage: null,
      caloriesKcal: null,
      calorieTarget: null,
      averageSleepMinutes: null,
      averageSleepRegularity: null,
      averageRecoveryScore: null,
      averageEffortScore: null,
      averageCaloriesKcal: null,
      history: [],
      deepWorkMinutes: null,
      calendarDeepWorkMinutes: null,
      deepWorkSource: "missing",
      focus: null,
      energy: null,
      activity: null,
    },
  };
}

function journal(): PersonalLabJournal {
  return {
    todayDate: "2026-09-15",
    journal: { variables: [], entries: [], days: [], achievements: [] },
    supplements: { definitions: [], entries: [], error: null },
  };
}

describe("LabWorldPreview progressive rendering", () => {
  it("does not wait for the journal before returning the overview shell", async () => {
    let resolveJournal: ((value: PersonalLabJournal) => void) | undefined;
    let journalSettled = false;
    const journalPromise = new Promise<PersonalLabJournal>((resolve) => {
      resolveJournal = (value) => {
        journalSettled = true;
        resolve(value);
      };
    });

    const shell = await LabWorldPreview({ stream: { overview: Promise.resolve(overview()), journal: journalPromise } });

    expect(shell).toMatchObject({ type: LabWorldWorkspace });
    expect(journalSettled).toBe(false);
    const capture = (shell as ReactElement<{ capture: ReactElement }>).props.capture;
    expect(capture.type).toBe(Suspense);
    expect(resolveJournal).toBeTypeOf("function");
  });

  it("keeps the complete journal workspace in the suspended child", async () => {
    const data = journal();
    const child = await LabWorldJournalPreview({ stream: { journal: Promise.resolve(data) } });
    expect(child).toMatchObject({ type: PersonalLabJournalWorkspace, props: { data } });
  });
});

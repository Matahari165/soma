import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LabWorldWorkspace } from "./lab-world-workspace";
import type { PersonalLabJournal, PersonalLabOverview } from "@/services/personal-lab";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("LabWorldWorkspace day navigation and radar display", () => {
  const mockOverview: PersonalLabOverview = {
    todayDate: "2026-09-12",
    overnightFingerprint: null,
    today: {
      sleepMinutes: 480,
      sleepRegularity: 80,
      recoveryScore: 75,
      effortScore: 70,
      caloriesKcal: 2200,
      averageSleepMinutes: 470,
      averageSleepRegularity: 75,
      averageRecoveryScore: 70,
      averageEffortScore: 65,
      averageCaloriesKcal: 2100,
      history: [
        { date: "2026-09-06", sleepMinutes: 450, recoveryScore: 65, effortScore: 60, caloriesKcal: 1900 },
        { date: "2026-09-07", sleepMinutes: 460, recoveryScore: 68, effortScore: 62, caloriesKcal: 2000 },
        { date: "2026-09-08", sleepMinutes: 470, recoveryScore: 72, effortScore: 65, caloriesKcal: 2050 },
        { date: "2026-09-09", sleepMinutes: 490, recoveryScore: 78, effortScore: 68, caloriesKcal: 2150 },
        { date: "2026-09-10", sleepMinutes: 500, recoveryScore: 82, effortScore: 72, caloriesKcal: 2250 },
        { date: "2026-09-11", sleepMinutes: 520, recoveryScore: 88, effortScore: 76, caloriesKcal: 2400 },
        { date: "2026-09-12", sleepMinutes: 480, recoveryScore: 75, effortScore: 70, caloriesKcal: 2200 },
      ],
      deepWorkMinutes: 120,
      calendarDeepWorkMinutes: 120,
      deepWorkSource: "calendar",
      focus: 4,
      energy: 4,
    },
  };

  const mockJournal: PersonalLabJournal = {
    todayDate: "2026-09-12",
    journal: {
      variables: [],
      entries: [],
      days: [],
      achievements: [],
    },
  };

  it("renders today's date and today's radar by default", () => {
    const html = renderToStaticMarkup(
      <LabWorldWorkspace
        overview={mockOverview}
        journal={mockJournal}
        effects={<div id="effects-test" />}
      />
    );

    expect(html).toContain("samedi 12 septembre");
    expect(html).toContain("8h 00");
    expect(html).toMatch(/2[\s\u202f]200 kcal/);
    expect(html).toContain('class="radar-value"');
    expect(html).toContain('aria-label="Jour précédent"');
  });

  it("renders previous day's date and star graph when a past day is selected", () => {
    const html = renderToStaticMarkup(
      <LabWorldWorkspace
        overview={mockOverview}
        journal={mockJournal}
        initialSelectedDate="2026-09-11"
        effects={<div id="effects-test" />}
      />
    );

    expect(html).toContain("vendredi 11 septembre");
    expect(html).toContain("8h 40");
    expect(html).toContain("88");
    expect(html).toMatch(/2[\s\u202f]400 kcal/);
    expect(html).toContain('class="radar-value"');
  });

  it("renders previous day controls in the arrival header", () => {
    const html = renderToStaticMarkup(
      <LabWorldWorkspace
        overview={mockOverview}
        journal={mockJournal}
        effects={<div id="effects-test" />}
      />
    );

    expect(html).toContain('aria-label="Navigation des jours"');
    expect(html).toContain('aria-label="Jour précédent"');
    expect(html).toContain('aria-label="Jour suivant"');
  });
});

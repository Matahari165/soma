import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LabWorldWorkspace } from "./lab-world-workspace";
import { PersonalLabJournalWorkspace } from "./personal-lab-journal-workspace";
import type { PersonalLabJournal, PersonalLabOverview } from "@/services/personal-lab";
import { arrivalMessageFor } from "@/domain/lab/arrival-message";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("LabWorldWorkspace day navigation and home goal display", () => {
  const mockOverview: PersonalLabOverview = {
    todayDate: "2026-09-12",
    overnightFingerprint: null,
    greetingName: "Alex",
    timeZone: "Europe/Paris",
    today: {
      sleepMinutes: 480,
      sleepRegularity: 80,
      recoveryScore: 75,
      effortScore: 70,
      caloriesKcal: 2200,
      calorieTarget: 2500,
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
        { date: "2026-09-11", sleepMinutes: 520, recoveryScore: 88, effortScore: 76, caloriesKcal: 2400, calorieTarget: 2500 },
        { date: "2026-09-12", sleepMinutes: 480, recoveryScore: 75, effortScore: 70, caloriesKcal: 2200 },
      ],
      deepWorkMinutes: 120,
      calendarDeepWorkMinutes: 120,
      deepWorkSource: "calendar",
      focus: 4,
      energy: 4,
      activity: null,
    },
  };

  const mockJournal: PersonalLabJournal = {
    todayDate: "2026-09-12",
    supplements: { definitions: [], entries: [], error: null },
    journal: {
      variables: [],
      entries: [],
      days: [],
      achievements: [],
    },
  };

  it("renders today's date and today's rings by default", () => {
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
    expect(html).toContain('data-home-rings=""');
    expect(html).not.toContain('aria-label="Previous day"');
  });

  it("publishes meals before daily protocol in the shared capture source order", () => {
    const html = renderToStaticMarkup(<PersonalLabJournalWorkspace data={mockJournal} recentDatesFirst />);

    expect(html.indexOf('data-purpose="nutrition-journal"')).toBeLessThan(html.indexOf('id="daily-journal"'));
  });

  it("keeps the homepage add-meal control out of both shared journal paths", () => {
    const homepageHtml = renderToStaticMarkup(<PersonalLabJournalWorkspace data={mockJournal} hideAddMealButton />);
    const defaultHtml = renderToStaticMarkup(<PersonalLabJournalWorkspace data={mockJournal} />);

    expect(homepageHtml).not.toContain('aria-label="Add a meal"');
    expect(defaultHtml).not.toContain('aria-label="Add a meal"');
  });

  it("renders previous day's date and rings when a past day is selected", () => {
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
    expect(html).toContain('data-home-rings=""');
  });

  it("keeps date navigation in the shared day strip instead of the arrival header", () => {
    const html = renderToStaticMarkup(
      <LabWorldWorkspace
        overview={mockOverview}
        journal={mockJournal}
        effects={<div id="effects-test" />}
      />
    );

    expect(html).not.toContain('aria-label="Day navigation"');
    expect(html).not.toContain('aria-label="Previous day"');
    expect(html).not.toContain('aria-label="Next day"');
    expect(html).toContain('aria-label="Jours disponibles"');
  });

  it("renders the personalized arrival message and marked activity note", () => {
    const activity = { kind: "run" as const, distanceKm: 7.2, durationMinutes: 44 };
    const html = renderToStaticMarkup(
      <LabWorldWorkspace
        overview={mockOverview}
        journal={mockJournal}
        effects={<div id="effects-test" />}
        personalization={{
          name: "Alex Vance",
          timeZone: "Europe/Paris",
          activity,
          initialMessage: arrivalMessageFor({ name: "Alex Vance", timeZone: "Europe/Paris", now: new Date("2026-09-12T20:00:00+02:00"), activity }),
        }}
      />
    );

    expect(html).toMatch(/Alex/);
    expect(html).toContain("Run recorded · 7.2 km · 44 min");
  });
});

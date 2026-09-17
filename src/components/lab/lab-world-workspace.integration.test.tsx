// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PersonalLabJournal, PersonalLabOverview } from "@/services/personal-lab";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./lab-theme", () => ({ useLabTheme: () => "observatory" }));
vi.mock("./arrival-backdrops", () => ({ ArrivalBackdrop: () => <div data-testid="arrival-backdrop" /> }));
vi.mock("./personal-lab", () => ({ PersonalLabJournalLoading: () => <div data-testid="journal-loading" /> }));
vi.mock("./observatory-radar", () => ({
  OBSERVATORY_RADAR_PRESENTATION: { size: 250, shiftX: -24, shiftY: -24, backdrop: "mont-nuages-user" },
  ObservatoryRadar: ({ data, date }: { data: { caloriesKcal: number | null }; date?: string }) => <div data-testid="radar" data-date={date ?? "today"} data-calories={String(data.caloriesKcal)} />,
}));
vi.mock("./lab-arrival", () => ({
  LabArrival: ({ date, selectedDate, availableDates, onDateChange, radar }: { date: string; selectedDate?: string; availableDates?: readonly string[]; onDateChange?: (date: string) => void; radar?: ReactNode }) => {
    const currentIndex = selectedDate && availableDates ? availableDates.indexOf(selectedDate) : -1;
    const previousDate = currentIndex > 0 ? availableDates?.[currentIndex - 1] : undefined;
    return <div data-testid="arrival" data-date={selectedDate}>
      <time>{date}</time>
      <button type="button" data-testid="arrival-previous" onClick={() => previousDate && onDateChange?.(previousDate)}>previous</button>
      {radar}
    </div>;
  },
}));
vi.mock("./personal-lab-journal-workspace", () => ({
  PersonalLabJournalWorkspace: ({ selectedDate, onDateChange, hideAddMealButton }: { selectedDate?: string; onDateChange?: (date: string) => void; hideAddMealButton?: boolean }) => <div data-testid="journal" data-date={selectedDate} data-hide-add={String(hideAddMealButton)}>
    <button type="button" data-testid="journal-select-yesterday" onClick={() => onDateChange?.("2026-09-11")}>journal yesterday</button>
  </div>,
}));

import { LabWorldWorkspace } from "./lab-world-workspace";

const mockOverview: PersonalLabOverview = {
  todayDate: "2026-09-12",
  overnightFingerprint: null,
  greetingName: "Jérémy",
  timeZone: "Europe/Paris",
  today: {
    sleepMinutes: 480,
    sleepRegularity: 80,
    recoveryScore: 75,
    effortScore: 70,
    effortCoverage: null,
    caloriesKcal: 2200,
    calorieTarget: 3000,
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
    deepWorkMinutes: null,
    calendarDeepWorkMinutes: null,
    deepWorkSource: "missing",
    focus: null,
    energy: null,
    activity: null,
  },
};

const mockJournal: PersonalLabJournal = {
  todayDate: "2026-09-12",
  supplements: { definitions: [], entries: [], error: null },
  journal: { variables: [], entries: [], days: [], achievements: [] },
};

describe("homepage streamed date ownership", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, "", "/");
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
  });

  it("keeps the streamed journal, hero, radar, URL, and homepage Add control on one date", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(<LabWorldWorkspace overview={mockOverview} journalPromise={Promise.resolve(mockJournal)} />);
    });

    expect(container.querySelector("[data-testid=arrival]")?.getAttribute("data-date")).toBe("2026-09-12");
    expect(container.querySelector("[data-testid=journal]")?.getAttribute("data-date")).toBe("2026-09-12");
    expect(container.querySelector("[data-testid=journal]")?.getAttribute("data-hide-add")).toBe("true");
    expect(container.querySelector("[data-testid=radar]")?.getAttribute("data-date")).toBe("2026-09-12");
    expect(container.querySelector("[data-testid=radar]")?.getAttribute("data-calories")).toBe("2200");

    await act(async () => {
      (container.querySelector("[data-testid=arrival-previous]") as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector("[data-testid=arrival-previous]") as HTMLButtonElement).click();
    });

    expect(container.querySelector("[data-testid=arrival]")?.getAttribute("data-date")).toBe("2026-09-10");
    expect(container.querySelector("[data-testid=journal]")?.getAttribute("data-date")).toBe("2026-09-10");
    expect(container.querySelector("[data-testid=radar]")?.getAttribute("data-date")).toBe("2026-09-10");
    expect(container.querySelector("[data-testid=radar]")?.getAttribute("data-calories")).toBe("2250");
    expect(new URL(window.location.href).searchParams.get("date")).toBe("2026-09-10");

    await act(async () => {
      (container.querySelector("[data-testid=journal-select-yesterday]") as HTMLButtonElement).click();
    });

    expect(container.querySelector("[data-testid=arrival]")?.getAttribute("data-date")).toBe("2026-09-11");
    expect(container.querySelector("[data-testid=journal]")?.getAttribute("data-date")).toBe("2026-09-11");
    expect(container.querySelector("[data-testid=radar]")?.getAttribute("data-date")).toBe("2026-09-11");
    expect(container.querySelector("[data-testid=radar]")?.getAttribute("data-calories")).toBe("2400");
    expect(new URL(window.location.href).searchParams.get("date")).toBe("2026-09-11");

    window.history.replaceState(null, "", "/");
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(container.querySelector("[data-testid=arrival]")?.getAttribute("data-date")).toBe("2026-09-12");
    expect(container.querySelector("[data-testid=journal]")?.getAttribute("data-date")).toBe("2026-09-12");
    expect(container.querySelector("[data-testid=radar]")?.getAttribute("data-date")).toBe("2026-09-12");
    expect(new URL(window.location.href).searchParams.get("date")).toBe("2026-09-12");

    await act(async () => root.unmount());
  });
});

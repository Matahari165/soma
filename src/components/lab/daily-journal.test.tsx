// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultJournalVariables, type JournalVariable } from "@/domain/lab/journal";

import { DailyJournal, journalStatusText } from "./daily-journal";
import { PersonalLabDateStrip } from "./personal-lab-journal-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const todayDate = "2026-08-26";
const variables: JournalVariable[] = defaultJournalVariables.map((variable, index) => ({ ...variable, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, isActive: true, options: [...variable.options] }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("journal motion states", () => {
  it("keeps save and validation language distinct", () => {
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "draft" })).toBe("Local draft");
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "saving" })).toBe("Saving…");
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "saved" })).toBe("Draft saved");
    expect(journalStatusText({ validated: true, validating: false, saveStatus: "saved" })).toBe("Day validated");
    expect(journalStatusText({ validated: false, validating: true, saveStatus: "saving" })).toBe("Validating…");
    expect(journalStatusText({ validated: false, validating: false, saveStatus: "error" })).toBe("Save failed");
    expect(journalStatusText({ validated: true, validating: false, saveStatus: "error" })).toBe("Save failed");
  });

  it("renders a stable draft status with an accessible live region", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, { variables, entries: [], days: [], todayDate }));

    expect(html).toContain('class="checkin-state journal-save-status"');
    expect(html).toContain('class="journal-card__header"');
    expect(html).toContain('class="journal-card__heading"');
    expect(html.indexOf("Local draft")).toBeLessThan(html.indexOf("Validate day"));
    expect(html.indexOf("Validate day")).toBeLessThan(html.indexOf("Edit habits"));
    expect(html).toContain('aria-label="Edit habits"');
    expect(html).not.toContain('id="journal-manager"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(">Local draft</span>");
    expect(html).toContain("Validate day");
    expect(html).not.toContain('button type="button">—</button>');
    expect(html).not.toContain(">To confirm<");
    expect(html).not.toContain("0/2 recorded");
    expect(html).toContain('data-complete="false"');
    expect(html).toContain('aria-label="Confirm displayed value for Alcohol"');
    expect(html).toContain('aria-label="Confirm No for Vacation"');
    expect(html).toContain('aria-label="Confirm all displayed values for Morning"');
    expect(html).toContain('aria-label="Confirm all displayed values for Day context"');
    expect(html).toContain('class="journal-field__automatic-indicator" role="img" aria-label="Automatic detection"');
    expect(html).toContain('>Breakfast<');
    expect(html).toContain('>Added sugar<');
    expect(html).not.toContain('data-period="sleep"');
    expect(html.indexOf("Magnesium")).toBeLessThan(html.indexOf('data-period="day"'));
    expect(html).toContain(">Magnesium<");
  });

  it("does not present a saved draft as a validated day", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [],
      days: [{ entryDate: todayDate, status: "validated", validatedAt: `${todayDate}T08:00:00.000Z`, omittedVariableIds: [] }],
      todayDate,
    }));

    expect(html).toContain(">Day validated</span>");
    expect(html).not.toContain("journal-save-status__icon--success");
    expect(html).not.toContain(">Draft saved</span>");
    expect(html).not.toContain("Validate day");
  });

  it("can hide its local date strip when the workspace provides a shared one", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, { variables, entries: [], days: [], todayDate, showDateNavigation: false, selectedDate: todayDate }));

    expect(html).not.toContain('class="journal-date-strip"');
  });

  it("marks an explicit false entry as recorded", () => {
    const vacation = variables.find((variable) => variable.name === "Vacation");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: vacation ? [{ variableId: vacation.id, entryDate: todayDate, value: false }] : [],
      days: [],
      todayDate,
    }));

    expect(html).toContain('data-state="recorded"');
    expect(html).not.toContain("1/2 recorded");
    expect(html).toContain('aria-label="Vacation: Recorded"');
    expect(html).not.toContain('aria-label="Confirm displayed value for Vacation"');
  });

  it("keeps historical sleep-start entries out of the journal", () => {
    const bedtime: JournalVariable = { id: "00000000-0000-4000-8000-999999999999", name: "Bedtime", variableType: "time", unit: null, options: [], position: 78, isActive: true, emoji: "🌘", defaultValue: null, dayPeriod: "evening", captureMode: "automatic", automaticMetricId: "bedtime", trackingCadence: "daily" };
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables: [...variables, bedtime],
      entries: [{ variableId: bedtime.id, entryDate: todayDate, value: "22:40", source: "automatic" }],
      days: [],
      todayDate,
    }));

    expect(html).not.toContain('aria-label="Bedtime: Recorded, automatic detection"');
    expect(html).not.toContain('>Bedtime<');
  });

  it("shows the achievement percentage without changing the field state", () => {
    const vacation = variables.find((variable) => variable.name === "Vacation");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [],
      days: [],
      achievements: vacation ? [{ variableId: vacation.id, percentage: 75, successPeriods: 3, observedPeriods: 4, cadence: "daily" as const, windowStart: "2026-08-23", windowEnd: todayDate }] : [],
      todayDate,
    }));

    expect(html).toContain("Progress 75%");
    expect(html).toContain('data-state="pending"');
  });

  it("shows the 28-day achievement bar in Personal Lab without replacing the habit state", () => {
    const vacation = variables.find((variable) => variable.name === "Vacation");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [],
      days: [],
      achievements: vacation ? [{ variableId: vacation.id, percentage: 75, successPeriods: 21, observedPeriods: 28, cadence: "daily" as const, windowStart: "2026-07-30", windowEnd: todayDate }] : [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).toContain("75% · 28d");
    expect(html).toContain('style="width:75%"');
  });

  it("keeps an unavailable 28-day achievement distinct from zero", () => {
    const vacation = variables.find((variable) => variable.name === "Vacation");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [],
      days: [],
      achievements: vacation ? [{ variableId: vacation.id, percentage: null, successPeriods: 0, observedPeriods: 0, cadence: "daily" as const, windowStart: "2026-07-30", windowEnd: todayDate }] : [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).toContain("0% · 28d");
  });

  it("offers the breakfast photo shortcut only after Breakfast is set to yes", () => {
    const breakfast = variables.find((variable) => variable.name === "Breakfast");
    const withBreakfast = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: breakfast ? [{ variableId: breakfast.id, entryDate: todayDate, value: true }] : [],
      days: [],
      todayDate,
    }));
    const withoutBreakfast = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: breakfast ? [{ variableId: breakfast.id, entryDate: todayDate, value: false }] : [],
      days: [],
      todayDate,
    }));

    expect(withBreakfast).toContain('href="/meals#meal-breakfast"');
    expect(withBreakfast).toContain('aria-label="Add breakfast photo"');
    expect(withoutBreakfast).not.toContain('href="/meals#meal-breakfast"');
  });

  it("does not offer to reconfirm a recorded numeric value", () => {
    const alcohol = variables.find((variable) => variable.name === "Alcohol");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: alcohol ? [{ variableId: alcohol.id, entryDate: todayDate, value: 0 }] : [],
      days: [],
      todayDate,
    }));

    expect(html).toContain('aria-label="Alcohol: Recorded"');
    expect(html).not.toContain('aria-label="Confirm displayed value for Alcohol"');
  });

  it("marks a fully recorded period without displaying a counter", () => {
    const dayVariables = variables.filter((variable) => variable.dayPeriod === "day");
    const addedSugar = dayVariables.find((variable) => variable.name === "Added sugar");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [...dayVariables.flatMap((variable) => variable.defaultValue === null ? [] : [{ variableId: variable.id, entryDate: todayDate, value: variable.defaultValue }]), ...(addedSugar ? [{ variableId: addedSugar.id, entryDate: todayDate, value: 0 as const }] : []), ...(variables.find((variable) => variable.name === "Running") ? [{ variableId: variables.find((variable) => variable.name === "Running")!.id, entryDate: todayDate, value: true as const, source: "automatic" as const }] : [])],
      days: [],
      todayDate,
    }));

    expect(html).toContain('class="journal-period journal-period--complete"');
    expect(html).toContain('aria-label="Daytime, complete"');
    expect(html).not.toContain("3/3 recorded");
  });

  it("places Personal Lab validation in the Daily Protocol ribbon header", () => {
    const addedSugar = variables.find((variable) => variable.name === "Added sugar");
    const html = renderToStaticMarkup(createElement(DailyJournal, { variables, entries: addedSugar ? [{ variableId: addedSugar.id, entryDate: todayDate, value: 5 }] : [], days: [], todayDate, presentation: "personal-lab", showDateNavigation: false }));
    const actionsStart = html.indexOf('journal-workspace-header__actions');
    const actionsEnd = html.indexOf('class="w-full h-2', actionsStart);

    expect(html).toContain("Daily Protocol");
    expect(html.slice(actionsStart, actionsEnd)).toContain("Validate day");
    expect(html.indexOf("Daily Protocol")).toBeLessThan(html.indexOf("Validate day"));
  });

  it("keeps phase names accessible while omitting visible phase headings in Personal Lab", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [],
      days: [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).not.toContain(" sur ");
    expect(html).not.toContain("Logged");
    expect(html).not.toContain("Completed");
    const container = document.createElement("div");
    container.innerHTML = html;
    const groups = Array.from(container.querySelectorAll<HTMLElement>('[data-purpose$="-habits"]'));
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Morning Phase", "Daytime Phase", "Evening Phase", "Day Context & Modifiers",
    ]);
    expect(groups.every((group) => group.firstElementChild?.classList.contains("divide-y"))).toBe(true);
    expect(html).toContain("space-y-0 max-sm:space-y-3");
  });

  it("does not announce completion for a date that was already complete on load", () => {
    const habits = variables.filter((variable) => variable.variableType === "boolean").slice(0, 2);
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables: habits,
      entries: habits.map((habit) => ({ variableId: habit.id, entryDate: todayDate, value: true })),
      days: [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).not.toContain("journal-completion-notice");
  });

  it("announces a completed Personal Lab journal after interaction, clears on correction/date change, and auto-hides", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const firstDate = todayDate;
    const otherDate = "2026-08-25";
    const habits: JournalVariable[] = [
      { id: "00000000-0000-4000-8000-000000000101", name: "Habit one", emoji: "✓", variableType: "boolean", unit: null, options: [], position: 0, isActive: true, defaultValue: null, dayPeriod: "morning" },
      { id: "00000000-0000-4000-8000-000000000102", name: "Habit two", emoji: "✓", variableType: "boolean", unit: null, options: [], position: 1, isActive: true, defaultValue: null, dayPeriod: "morning" },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<DailyJournal
      variables={habits}
      entries={[
        { variableId: habits[0].id, entryDate: firstDate, value: true },
        ...habits.map((habit) => ({ variableId: habit.id, entryDate: otherDate, value: true })),
      ]}
      days={[{ entryDate: firstDate, status: "draft", validatedAt: null, omittedVariableIds: [habits[1].id] }]}
      todayDate={firstDate}
      availableDates={[firstDate, otherDate]}
      presentation="personal-lab"
    />));

    try {
      expect(document.querySelector(".journal-completion-notice")).toBeNull();

      const dateButtons = container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Journal date"] button');
      await act(async () => dateButtons[1]?.click());
      expect(document.querySelector(".journal-completion-notice")).toBeNull();
      await act(async () => container.querySelector<HTMLButtonElement>('nav[aria-label="Journal date"] button:first-of-type')?.click());
      expect(document.querySelector(".journal-completion-notice")).toBeNull();

      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Confirm Yes for Habit two"]')?.click());
      const notice = document.querySelector<HTMLElement>(".journal-completion-notice");
      expect(container.querySelector(".journal-field-row--changed .journal-field-row__feedback")).not.toBeNull();
      expect(notice?.textContent).toBe("All habits are filled in.");
      expect(notice?.getAttribute("role")).toBe("status");
      expect(notice?.getAttribute("aria-live")).toBe("polite");
      expect(notice?.textContent).not.toMatch(/saved|validated/i);

      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Reset Habit two"]')?.click());
      expect(document.querySelector(".journal-completion-notice")).toBeNull();

      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Confirm Yes for Habit two"]')?.click());
      expect(document.querySelector(".journal-completion-notice")).not.toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(3600); });
      expect(document.querySelector(".journal-completion-notice")).toBeNull();

      const updatedDateButtons = container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Journal date"] button');
      await act(async () => updatedDateButtons[1]?.click());
      expect(document.querySelector(".journal-completion-notice")).toBeNull();
      await act(async () => container.querySelector<HTMLButtonElement>('nav[aria-label="Journal date"] button:first-of-type')?.click());
      expect(document.querySelector(".journal-completion-notice")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    }
  });

  it("renders Yes then No buttons when boolean is unrecorded in Personal Lab", () => {
    const unrecordedBoolean: JournalVariable = {
      id: "00000000-0000-4000-8000-999999999999",
      name: "Custom Habit",
      emoji: "⚡",
      variableType: "boolean",
      unit: null,
      options: [],
      position: 0,
      dayPeriod: "morning",
      defaultValue: null,
      isActive: true,
    };
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables: [unrecordedBoolean],
      entries: [],
      days: [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    const yesIdx = html.indexOf(">Yes</button>");
    const noIdx = html.indexOf(">No</button>");
    expect(yesIdx).toBeGreaterThan(-1);
    expect(noIdx).toBeGreaterThan(-1);
    expect(yesIdx).toBeLessThan(noIdx);
    expect(html).toContain("w-28");
    expect(html).toContain("w-1/2");
  });

  it("keeps both answers visible until a boolean default is recorded", () => {
    const vacation = variables.find((variable) => variable.name === "Vacation");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables: vacation ? [vacation] : [],
      entries: [],
      days: [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).toContain(">Yes</button>");
    expect(html).toContain(">No</button>");
    expect(html).toContain(`Confirm No for Vacation`);
  });

  it("renders single sage pill without checkmark and full width when boolean is true in Personal Lab", () => {
    const vacation = variables.find((variable) => variable.name === "Vacation");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables: vacation ? [vacation] : [],
      entries: vacation ? [{ variableId: vacation.id, entryDate: todayDate, value: true }] : [],
      days: [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).toContain("text-sage");
    expect(html).toContain("w-28");
    expect(html).toContain("w-full");
    expect(html).toContain("Yes");
    expect(html).not.toContain(">No</button>");
    // No checkmark or cross svg icon in Yes/No selector
    const binaryGroupStart = html.indexOf('journal-choice--binary');
    const binaryGroupEnd = html.indexOf('</div>', binaryGroupStart);
    const binaryHtml = html.slice(binaryGroupStart, binaryGroupEnd);
    expect(binaryHtml).not.toContain("<svg");
  });

  it("renders single crossless pill and full width when boolean is false in Personal Lab", () => {
    const vacation = variables.find((variable) => variable.name === "Vacation");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables: vacation ? [vacation] : [],
      entries: vacation ? [{ variableId: vacation.id, entryDate: todayDate, value: false }] : [],
      days: [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).toContain("text-content-secondary");
    expect(html).toContain("w-28");
    expect(html).toContain("w-full");
    expect(html).toContain("No");
    expect(html).not.toContain(">Yes</button>");
    // No checkmark or cross svg icon in Yes/No selector
    const binaryGroupStart = html.indexOf('journal-choice--binary');
    const binaryGroupEnd = html.indexOf('</div>', binaryGroupStart);
    const binaryHtml = html.slice(binaryGroupStart, binaryGroupEnd);
    expect(binaryHtml).not.toContain("<svg");
  });

  it("renders stepper with stitch-stepper class, Minus and Plus icons, and ARIA spinbutton in Personal Lab", () => {
    const addedSugar = variables.find((variable) => variable.name === "Added sugar");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables: addedSugar ? [addedSugar] : [],
      entries: [],
      days: [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).toContain("stitch-stepper");
    expect(html).not.toContain('class="journal-number"');
    expect(html).toContain("[appearance:textfield]");
    expect(html).toContain("lucide-minus");
    expect(html).toContain("lucide-plus");
    expect(html).toContain('role="spinbutton"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain("Decrease Added sugar");
    expect(html).toContain("Increase Added sugar");
    // Since unrecorded value is 0 (or null treated as 0), decrease button is disabled
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Decrease Added sugar"/);
    expect(html).toContain("opacity-30 cursor-not-allowed");
  });

  it("enables minus button in stepper when non-negative value is greater than zero", () => {
    const addedSugar = variables.find((variable) => variable.name === "Added sugar");
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables: addedSugar ? [addedSugar] : [],
      entries: addedSugar ? [{ variableId: addedSugar.id, entryDate: todayDate, value: 5 }] : [],
      days: [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).toContain('aria-valuenow="5"');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Decrease Added sugar"/);
  });

  it("keeps Personal Lab phases compact", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [],
      days: [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).toContain("space-y-6");
  });

  it("applies enhanced typography and button styles in Personal Lab", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [],
      days: [],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).toContain("journal-habit-name text-content-primary truncate");
    expect(html).toContain("journal-header-validate");
    expect(html).toContain("text-content-secondary hover:text-content-primary");
    expect(html).toContain('aria-label="Edit protocol"');
    expect(html).toContain("text-content-secondary border border-hairline");
    expect(html).not.toContain("Edit protocol</button>");
  });

  it("shows the validated state in the Personal Lab header", () => {
    const html = renderToStaticMarkup(createElement(DailyJournal, {
      variables,
      entries: [],
      days: [{ entryDate: todayDate, status: "validated", validatedAt: `${todayDate}T08:00:00.000Z`, omittedVariableIds: [] }],
      todayDate,
      presentation: "personal-lab",
      showDateNavigation: false,
    }));

    expect(html).toContain('class="journal-header-validated');
    expect(html).toContain('role="status"');
    expect(html).toContain("Validated</span>");
    expect(html).not.toContain('journal-header-validate ');
  });

  it("renders date strip without pulsing green dot for selected date", () => {
    const html = renderToStaticMarkup(createElement(PersonalLabDateStrip, {
      dates: [todayDate],
      selectedDate: todayDate,
      todayDate,
      onDateChange: () => {},
    }));

    expect(html).not.toContain("animate-pulse");
    expect(html).toContain("is-selected personal-lab-day-strip__day");
  });
});

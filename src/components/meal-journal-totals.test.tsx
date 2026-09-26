// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MEAL_TOTALS_EVENT, MEAL_TOTALS_REQUEST_EVENT, type MealJournalData } from "@/domain/meal-record";
import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import { MealJournal } from "./meal-journal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

it("keeps the server total until the journal has actually loaded, then publishes the confirmed total", async () => {
  const date = "2026-09-24";
  let resolveLoad!: (value: MealJournalData) => void;
  const loading = new Promise<MealJournalData>((resolve) => { resolveLoad = resolve; });
  const received: Array<number | null> = [];
  const listener = (event: Event) => received.push((event as CustomEvent<{ calories: number | null }>).detail.calories);
  window.addEventListener(MEAL_TOTALS_EVENT, listener);
  const container = document.createElement("div");
  const root = createRoot(container);

  try {
    await act(async () => root.render(<MealJournal date={date} today={date} variant="lab" publishMealTotals api={{ load: () => loading }} />));
    await act(async () => window.dispatchEvent(new Event(MEAL_TOTALS_REQUEST_EVENT)));
    expect(received).toEqual([]);

    await act(async () => resolveLoad({ date, meals: { lunch: {
      id: "confirmed-lunch", date, slot: "lunch", note: "", photos: [], status: "confirmed",
      analysis: { ingredients: [], calories: { low: 400, likely: 500, high: 600 }, proteinGrams: { low: 20, likely: 25, high: 30 } },
      mouthHeat: null, stomachLoad: null,
    } } }));
    expect(received).toContain(500);
    expect(received).not.toContain(null);
  } finally {
    await act(async () => root.unmount());
    window.removeEventListener(MEAL_TOTALS_EVENT, listener);
  }
});

it("reloads a returned controlled date and ignores the previous date's late meal read", async () => {
  const today = "2026-09-24";
  const previousDay = "2026-09-23";
  const pendingLoads = new Map<string, Array<(value: MealJournalData) => void>>();
  const api = {
    load: vi.fn((date: string) => new Promise<MealJournalData>((resolve) => {
      pendingLoads.set(date, [...(pendingLoads.get(date) ?? []), resolve]);
    })),
  };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ targets: DEFAULT_NUTRITION_TARGETS, persisted: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const initialData: MealJournalData = { date: today, meals: { lunch: {
    id: "confirmed-today", date: today, slot: "lunch", note: "SSR today", photos: [], status: "confirmed",
    analysis: null, mouthHeat: null, stomachLoad: null,
  } } };
  const container = document.createElement("div");
  const root = createRoot(container);

  try {
    await act(async () => root.render(<MealJournal date={today} selectedDate={today} today={today} variant="lab" showDateNavigation={false} initialData={initialData} api={api} initialTargetsFresh initialTargetsPersisted initialTargetsDate={today} initialTargets={DEFAULT_NUTRITION_TARGETS} />));
    expect(api.load).not.toHaveBeenCalled();

    await act(async () => root.render(<MealJournal date={today} selectedDate={previousDay} today={today} variant="lab" showDateNavigation={false} initialData={initialData} api={api} initialTargetsFresh initialTargetsPersisted initialTargetsDate={today} initialTargets={DEFAULT_NUTRITION_TARGETS} />));
    expect(api.load).toHaveBeenCalledWith(previousDay);

    await act(async () => root.render(<MealJournal date={today} selectedDate={today} today={today} variant="lab" showDateNavigation={false} initialData={initialData} api={api} initialTargetsFresh initialTargetsPersisted initialTargetsDate={today} initialTargets={DEFAULT_NUTRITION_TARGETS} />));
    expect(api.load).toHaveBeenLastCalledWith(today);
    expect(container.textContent).toContain("Loading meals…");

    await act(async () => pendingLoads.get(previousDay)?.[0]({ date: previousDay, meals: { lunch: {
      id: "stale-yesterday", date: previousDay, slot: "lunch", note: "Stale yesterday", photos: [], status: "confirmed",
      analysis: null, mouthHeat: null, stomachLoad: null,
    } } }));
    expect(container.textContent).toContain("Loading meals…");

    await act(async () => pendingLoads.get(today)?.[0]({ date: today, meals: { lunch: {
      id: "fresh-returned-today", date: today, slot: "lunch", note: "Fresh today", photos: [], status: "confirmed",
      analysis: null, mouthHeat: null, stomachLoad: null,
    } } }));
    expect(container.textContent).not.toContain("Loading meals…");
    expect(Array.from(container.querySelectorAll("textarea")).some((textarea) => textarea.value === "Fresh today")).toBe(true);
    expect(Array.from(container.querySelectorAll("textarea")).some((textarea) => textarea.value === "Stale yesterday")).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});

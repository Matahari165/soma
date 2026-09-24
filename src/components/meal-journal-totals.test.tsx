// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MEAL_TOTALS_EVENT, MEAL_TOTALS_REQUEST_EVENT, type MealJournalData } from "@/domain/meal-record";
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

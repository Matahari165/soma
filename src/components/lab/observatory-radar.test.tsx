import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ObservatoryRadar } from "./observatory-radar";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const data = { sleepMinutes: 460, recoveryScore: 70, effortScore: 75, caloriesKcal: 1800, averageSleepMinutes: 480, averageRecoveryScore: 60, averageEffortScore: 75, averageCaloriesKcal: 2000 };
it("compares each value with its own 30-day average, including equality", () => {
  const html = renderToStaticMarkup(<ObservatoryRadar data={data} />);
  expect(html).toContain("7h 40 ↓");
  expect(html).toContain("70 ↑");
  expect(html).toContain("15.8 ↔");
  expect(html).toContain("kcal ↓");
  expect(html).toContain('class="radar-value"');
});
it("does not invent a zero or close the radar when a measure is absent", () => {
  const html = renderToStaticMarkup(<ObservatoryRadar data={{...data, caloriesKcal:null, averageRecoveryScore:null}} />);
  expect(html).not.toContain('class="radar-value"');
  expect(html).toContain("— kcal");
  expect(html).toContain("Moyenne indisponible");
  expect(html).not.toContain("70 ↑");
});

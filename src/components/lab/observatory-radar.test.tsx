import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { OBSERVATORY_RADAR_PRESENTATION, ObservatoryRadar } from "./observatory-radar";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const data = { sleepMinutes: 460, recoveryScore: 70, effortScore: 75, caloriesKcal: 1800, averageSleepMinutes: 480, averageRecoveryScore: 60, averageEffortScore: 75, averageCaloriesKcal: 2000 };
it("compares each value with its own 30-day average, including equality", () => {
  const html = renderToStaticMarkup(<ObservatoryRadar data={data} />);
  expect(html).toContain("7h 40 ↓");
  expect(html).toContain("70 ↑");
  expect(html).toContain("15.8 ↔");
  expect(html).toMatch(/↓ 1[\s\u202f]800 kcal/);
  expect(html).toContain('class="radar-value"');
});
it("does not invent a zero or close the radar when a measure is absent", () => {
  const html = renderToStaticMarkup(<ObservatoryRadar data={{...data, caloriesKcal:null, effortScore:null, averageRecoveryScore:null}} />);
  expect(html).not.toContain('<polygon className="radar-value"');
  expect(html).toContain("— kcal");
  expect(html).toContain("Moyenne indisponible");
  expect(html).not.toContain("70 ↑");
});

it("renders radar metrics for a specific past date", () => {
  const pastData = {
    sleepMinutes: 510,
    recoveryScore: 85,
    effortScore: 60,
    caloriesKcal: 2300,
    averageSleepMinutes: 480,
    averageRecoveryScore: 60,
    averageEffortScore: 75,
    averageCaloriesKcal: 2000,
  };
  const html = renderToStaticMarkup(<ObservatoryRadar data={pastData} date="2026-09-11" />);
  expect(html).toContain("8h 30 ↑");
  expect(html).toContain("85 ↑");
  expect(html).toContain("12.6 ↓");
  expect(html).toMatch(/↑ 2[\s\u202f]300 kcal/);
  expect(html).toContain('class="radar-value"');
});

it("scales label offsets proportionally with the radius prop", () => {
  const html = renderToStaticMarkup(<ObservatoryRadar data={data} radius={380} />);
  expect(html).toContain('class="radar-number"');
});

it("uses the approved fixed local presentation without exposing controls", () => {
  expect(OBSERVATORY_RADAR_PRESENTATION).toEqual({
    size: 180,
    shiftY: -24,
    shiftX: 28,
    backdrop: "mont-nuages-user",
  });
});

it("forwards the shift values as an inline transform on the figure", () => {
  const html = renderToStaticMarkup(<ObservatoryRadar data={data} shiftX={12} shiftY={-20} />);
  expect(html).toContain("translate(12px, -20px)");
});

it("renders no transform by default", () => {
  const html = renderToStaticMarkup(<ObservatoryRadar data={data} />);
  expect(html).not.toContain("translate(");
});

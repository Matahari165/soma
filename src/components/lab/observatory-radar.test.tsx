// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { MEAL_TOTALS_EVENT } from "@/domain/meal-record";
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
  expect(html).not.toContain('<line className="radar-value"');
  expect(html).toContain("— kcal");
  expect(html).toContain("Moyenne indisponible");
  expect(html).not.toContain("70 ↑");
});

it("does not bridge across an absent interior axis", () => {
  const html = renderToStaticMarkup(<ObservatoryRadar data={{ ...data, recoveryScore: null }} />);

  expect(html).not.toContain('<polygon className="radar-value"');
  expect((html.match(/class="radar-point"/g) ?? []).length).toBe(3);
  expect((html.match(/class="radar-value-segment"/g) ?? []).length).toBe(2);
  expect(html).toContain("Récupération : —");
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

it("caps every plotted metric at its target while keeping the real values visible", () => {
  const html = renderToStaticMarkup(<ObservatoryRadar data={{
    ...data,
    sleepMinutes: 600,
    recoveryScore: 120,
    effortScore: 140,
    caloriesKcal: 3000,
  }} radius={180} />);
  expect(html).toContain('points="330,100 510,280 330,460 150,280"');
  expect(html).toContain("10h 00 ↑");
  expect(html).toMatch(/↑ 3[\s\u202f]000 kcal/);
  expect(html).toContain("Objectif : 8 h 30");
});

it("uses the personal calorie target received from the meal journal", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<ObservatoryRadar data={{ ...data, caloriesKcal: 2500 }} radius={180} />));
  await act(async () => window.dispatchEvent(new CustomEvent(MEAL_TOTALS_EVENT, {
    detail: { date: "2026-09-12", isToday: true, calories: 2500, calorieTarget: 3000, calorieProgress: 83 },
  })));
  expect(container.querySelector(".radar-value")?.getAttribute("points")).toContain("180,280");
  expect(container.querySelector("svg")?.getAttribute("aria-label")).toMatch(/Objectif : 3[\s\u202f]000 kcal/);
  await act(async () => root.unmount());
});

it("uses the approved fixed local presentation without exposing controls", () => {
  expect(OBSERVATORY_RADAR_PRESENTATION).toEqual({
    size: 250,
    shiftY: -24,
    shiftX: -24,
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

it("keeps explicit zeroes measured and ignores invalid runtime numbers", () => {
  const html = renderToStaticMarkup(<ObservatoryRadar data={{
    ...data,
    sleepMinutes: 0,
    recoveryScore: 0,
    effortScore: 0,
    caloriesKcal: 0,
    averageSleepMinutes: undefined,
    averageRecoveryScore: Number.NaN,
    averageEffortScore: Number.POSITIVE_INFINITY,
  }} />);

  expect((html.match(/class="radar-point"/g) ?? []).length).toBe(4);
  expect(html).toContain("0h 00");
  expect(html).toContain("Récupération : 0");
  expect(html).toContain("Effort : 0.0");
  expect(html).not.toContain("NaN");
  expect(html).not.toContain("Infinity");
});

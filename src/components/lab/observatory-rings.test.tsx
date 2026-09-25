import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ObservatoryRings } from "./observatory-rings";

it("shows the four home measures with their current values", () => {
  const html = renderToStaticMarkup(<ObservatoryRings date="2026-09-25" data={{
    sleepMinutes: 489,
    recoveryScore: 59,
    effortScore: 19,
    caloriesKcal: 1200,
    calorieTarget: 2400,
  }} />);
  expect(html).toContain("Sommeil");
  expect(html).toContain("8h 09");
  expect(html).toContain("Récupération");
  expect(html).toContain("Effort");
  expect(html).toContain("Calories");
  expect(html).toContain("50 % de l’objectif");
  expect((html.match(/stroke-dasharray="/g) ?? []).length).toBe(4);
});

it("leaves missing measurements and a missing calorie goal unfilled", () => {
  const html = renderToStaticMarkup(<ObservatoryRings data={{
    sleepMinutes: null,
    recoveryScore: null,
    effortScore: null,
    caloriesKcal: 1200,
    calorieTarget: null,
  }} />);
  expect(html).toContain("Objectif indisponible");
  expect(html).toContain("Donnée indisponible");
  expect(html).not.toContain("0 % de l’objectif");
  expect((html.match(/stroke-dasharray="1 2.8"/g) ?? []).length).toBe(4);
});

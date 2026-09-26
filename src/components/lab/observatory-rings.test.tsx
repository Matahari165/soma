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
  expect(html).toContain("Strain : 19, objectif 100");
  expect(html).toContain("Calories");
  expect(html).toContain("50 % de l’objectif");
  expect(html).toMatch(/data-ring-value="sleep"[^>]*><textPath[^>]*>8h09<\/textPath><\/text>/);
  expect(html).toMatch(/data-ring-value="recovery"[^>]*><textPath[^>]*>59<\/textPath><\/text>/);
  expect(html).toMatch(/data-ring-value="effort"[^>]*><textPath[^>]*>19<\/textPath><\/text>/);
  expect(html).toMatch(/data-ring-value="calories"[^>]*><textPath[^>]*>1200<\/textPath><\/text>/);
  expect(html).not.toContain("<figcaption");
  expect(html).not.toContain("OBJECTIFS");
  expect((html.match(/startOffset="0%"/g) ?? []).length).toBe(4);
  expect((html.match(/d="M 160 /g) ?? []).length).toBe(4);
  expect((html.match(/rotate\(-90 160 160\)/g) ?? []).length).toBe(4);
});

it("shows a visible second lap after a goal is exceeded", () => {
  const html = renderToStaticMarkup(<ObservatoryRings data={{
    sleepMinutes: 1020,
    recoveryScore: 125,
    effortScore: 0,
    caloriesKcal: 0,
    calorieTarget: 2400,
  }} />);
  expect(html).toContain("200 % de l’objectif");
  expect(html).toContain("125 % de l’objectif");
  expect(html).toContain('data-ring="sleep" data-turns="2"');
  expect(html).toContain('data-lap-end="sleep"');
  expect(html).toContain('stroke-dasharray="25 100"');
});

it("leaves missing measurements and a missing calorie goal unfilled", () => {
  const html = renderToStaticMarkup(<ObservatoryRings data={{
    sleepMinutes: null,
    recoveryScore: null,
    effortScore: null,
    caloriesKcal: 1200,
    calorieTarget: null,
  }} />);
  expect(html).toContain("progression indisponible");
  expect(html).toContain("objectif —");
  expect(html).not.toContain("0 % de l’objectif");
  expect((html.match(/stroke-dasharray="1 2.8"/g) ?? []).length).toBe(4);
});

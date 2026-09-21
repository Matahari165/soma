// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { ActivityRadar, type ActivityRadarDimension } from "./activity-radar";

const dimensions: ActivityRadarDimension[] = [
  { id: "zoneMinutes", label: "Minutes en zone", normalizedValue: 0.4, valueLabel: "21 min" },
  { id: "exerciseMinutes", label: "Durée d’exercice", normalizedValue: 0.3, valueLabel: "22 min" },
  { id: "activeEnergyKcal", label: "Calories actives", normalizedValue: 0.6, valueLabel: "425 kcal" },
  { id: "steps", label: "Pas", normalizedValue: 0.7, valueLabel: "7 198 pas" },
  { id: "weeklyLoad", label: "Charge hebdomadaire", normalizedValue: 0.5, valueLabel: "382 points" },
];

it("relie les points mesurés du radar complet", () => {
  const html = renderToStaticMarkup(<ActivityRadar dimensions={dimensions} />);

  expect(html).toContain("valueArea");
  expect((html.match(/class="[^"]*point/g) ?? []).length).toBe(5);
});

it("garde les points partiels sans relier une mesure absente", () => {
  const html = renderToStaticMarkup(<ActivityRadar dimensions={[
    ...dimensions.slice(0, 4),
    { ...dimensions[4], normalizedValue: null, valueLabel: undefined },
  ]} />);

  expect(html).not.toContain("valueArea");
  expect((html.match(/valueSegment/g) ?? []).length).toBeGreaterThan(0);
  expect((html.match(/class="[^"]*point/g) ?? []).length).toBe(4);
  expect(html).toContain(">Charge hebdomadaire<");
  expect(html).toContain(">—<");
  expect(html).not.toContain('cx="210" cy="210"');
});

it("ne relie pas deux axes en traversant une mesure absente", () => {
  const html = renderToStaticMarkup(<ActivityRadar dimensions={[
    dimensions[0],
    { ...dimensions[1], normalizedValue: null, valueLabel: undefined },
    ...dimensions.slice(2),
  ]} />);

  expect(html).not.toContain("valueArea");
  expect((html.match(/class="[^"]*point/g) ?? []).length).toBe(4);
});

it("keeps an explicit zero at the center as a measured point", () => {
  const html = renderToStaticMarkup(<ActivityRadar dimensions={[
    { ...dimensions[0], normalizedValue: 0, valueLabel: "0 min" },
    ...dimensions.slice(1),
  ]} />);

  expect(html).toContain('cx="210" cy="210"');
  expect(html).toContain("0 min");
});

it("keeps the source for the detail instead of the radar label", () => {
  const html = renderToStaticMarkup(<ActivityRadar dimensions={[{ ...dimensions[0], sourceLabel: "Google Health" }]} interactive onSelect={() => undefined} />);
  expect(html).not.toContain("Google Health");
});

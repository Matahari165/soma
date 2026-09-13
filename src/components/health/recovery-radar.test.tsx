// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { RecoveryRadar } from "./recovery-radar";

const dimensions = [
  { key: "hrv", label: "VFC nocturne", score: 68, weight: 40 },
  { key: "restingHeartRate", label: "FC au repos", score: 83, weight: 30 },
  { key: "sleep", label: "Sommeil", score: 75, weight: 30 },
] as const;

it("draws a calm 100% reference triangle behind the measured 68/83/75 shape", () => {
  const html = renderToStaticMarkup(<RecoveryRadar dimensions={dimensions} />);

  expect((html.match(/data-testid="recovery-radar-grid"/g) ?? []).length).toBe(4);
  expect((html.match(/data-testid="recovery-radar-axis"/g) ?? []).length).toBe(3);
  expect(html).toContain('data-radar-reference="100" data-grid-ratio="1"');
  expect(html).toContain('points="320.00,96.00 453.37,327.00 186.63,327.00"');
  expect(html).toContain('data-testid="recovery-radar-value" points="320.00,145.28 430.70,313.91 219.97,307.75"');
  expect((html.match(/data-testid="recovery-radar-label"/g) ?? []).length).toBe(3);
  expect(html).toContain(">Sommeil<");
  expect(html).toContain(">75<");
  expect(html).toContain("VFC nocturne");
});

it("keeps a missing score unavailable instead of plotting it at zero", () => {
  const html = renderToStaticMarkup(
    <RecoveryRadar dimensions={[
      dimensions[0],
      { ...dimensions[1], score: null },
      dimensions[2],
    ]} />,
  );

  expect(html).not.toContain('data-testid="recovery-radar-value"');
  expect(html).toMatch(/data-dimension-value="restingHeartRate"[^>]*>—<\/text>/);
  expect(html).toContain("FC au repos : indisponible");
  expect(html).not.toContain('cx="320" cy="404"');
});

it("exposes a complete textual description and keyboard focus", () => {
  const html = renderToStaticMarkup(<RecoveryRadar dimensions={dimensions} />);

  expect(html).toContain('role="img"');
  expect(html).toContain("Graphique radar de récupération");
  expect(html).toContain("Pondération 40");
  expect(html).toContain("VFC nocturne : 68 sur 100");
  expect(html).toContain("tabindex=\"0\"");
});

it("does not invent a radar structure when fewer than three dimensions are supplied", () => {
  const html = renderToStaticMarkup(<RecoveryRadar dimensions={dimensions.slice(0, 2)} />);

  expect((html.match(/data-testid="recovery-radar-grid"/g) ?? []).length).toBe(0);
  expect((html.match(/data-testid="recovery-radar-axis"/g) ?? []).length).toBe(0);
  expect((html.match(/data-testid="recovery-radar-label"/g) ?? []).length).toBe(2);
  expect(html).not.toContain('data-testid="recovery-radar-value"');
});

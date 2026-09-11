import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnimatedMetricReading, AnimatedValueText, formatAnimatedValue } from "./animated-value";

describe("animated health values", () => {
  it("keeps the final value available to assistive technology", () => {
    const html = renderToStaticMarkup(createElement(AnimatedMetricReading, { value: 468, format: "duration" }));

    expect(html).toContain('aria-hidden="true">7h 48m');
    expect(html).toContain('class="sr-only">7h 48m</span>');
  });

  it("formats missing values without starting a counter", () => {
    const html = renderToStaticMarkup(createElement(AnimatedValueText, { value: null, suffix: "%" }));

    expect(html).toContain('aria-hidden="true">—%</span>');
    expect(html).toContain('class="sr-only">Indisponible</span>');
  });

  it("preserves the sleep duration display while values are interpolated", () => {
    expect(formatAnimatedValue(510, "duration")).toBe("8h 30m");
    expect(formatAnimatedValue(84.4, "number")).toBe("84");
    expect(formatAnimatedValue(91.25, "decimal", 1)).toBe("91.3");
  });

  it("keeps an explicit positive sign when the metric needs direction", () => {
    const html = renderToStaticMarkup(createElement(AnimatedMetricReading, { value: 0.42, format: "decimal", decimals: 2, showPlus: true }));

    expect(html).toContain('aria-hidden="true">+0.42</span>');
    expect(html).toContain('class="sr-only">+0.42</span>');
  });
});

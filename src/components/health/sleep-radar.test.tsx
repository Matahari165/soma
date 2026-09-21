// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { SleepRadar } from "./sleep-radar";

it("keeps the health source in the opened detail instead of the radar label", () => {
  const html = renderToStaticMarkup(<SleepRadar dimensions={[{
    id: "duration",
    label: "Duration",
    normalizedValue: .9,
    valueLabel: "7 h 40",
    sourceLabel: "Google Health",
  }]} interactive onSelect={() => undefined} />);

  expect(html).toContain("7 h 40");
  expect(html).not.toContain("Google Health");
});

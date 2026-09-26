import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { calculateActiveHours } from "@/domain/health/active-hours";
import { ActiveHoursTimeline } from "./active-hours-timeline";

describe("active hours display", () => {
  it("does not show missing observations as zero activity", () => {
    const summary = calculateActiveHours({ date: "2026-09-26", timeZone: "UTC", now: "2026-09-26T02:15:00Z", records: [] });
    const markup = renderToStaticMarkup(createElement(ActiveHoursTimeline, { summary, importedAt: null }));
    expect(markup).toContain("<strong>—</strong> / 2 heures écoulées");
    expect(markup).toContain("2 heures inconnues");
    expect(markup).toContain("Données manquantes");
    expect(markup).toContain("En cours");
    expect(markup).not.toContain("03h");
  });
  it("excludes sleeping hours and describes the two validation routes", () => {
    const summary = calculateActiveHours({ date: "2026-09-26", timeZone: "UTC", now: "2026-09-26T09:15:00Z", records: [], sleepIntervals: [{ startTime: "2026-09-26T00:00:00Z", endTime: "2026-09-26T08:00:00Z" }] });
    const markup = renderToStaticMarkup(createElement(ActiveHoursTimeline, { summary, importedAt: null }));
    expect(markup).not.toContain("00h");
    expect(markup).toContain("08h");
    expect(markup).toContain("100 pas ou 1 minute");
    expect(markup).toContain("<details");
    expect(markup).toContain("mesure expérimentale");
  });
});

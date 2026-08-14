import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecoveryTrend, SleepRegularity, WeeklyEffort } from "./widgets";

describe("dashboard widget empty and partial states", () => {
  it("renders useful empty states for a new account", () => {
    const effort = renderToStaticMarkup(createElement(WeeklyEffort, { data: { current: 0, targetMin: 0, targetMax: 0, days: [] } }));
    const recovery = renderToStaticMarkup(createElement(RecoveryTrend, { data: [] }));
    const regularity = renderToStaticMarkup(createElement(SleepRegularity, { data: { bedtime: "—", wakeTime: "—", consistency: null } }));

    expect(effort).toContain("No activity data yet");
    expect(effort).not.toContain("0–0");
    expect(recovery).toContain("No recovery data yet");
    expect(regularity).toContain("Sleep baseline pending");
    expect(regularity).not.toContain("0%");
  });

  it("supports recovery trends shorter than seven readings", () => {
    const oneReading = renderToStaticMarkup(createElement(RecoveryTrend, { data: [{ label: "Fri", value: 64 }] }));
    const fourReadings = renderToStaticMarkup(createElement(RecoveryTrend, { data: [
      { label: "Tue", value: 48 },
      { label: "Wed", value: 55 },
      { label: "Thu", value: 60 },
      { label: "Fri", value: 67 },
    ] }));

    expect(oneReading).toContain("Latest recovery score: 64 out of 100");
    expect(fourReadings).toContain("Recovery trend from 48 to 67");
    expect(fourReadings).not.toContain("Latest recovery:");
  });

  it("does not invent a weekly target or sleep regularity score", () => {
    const effort = renderToStaticMarkup(createElement(WeeklyEffort, { data: { current: 18, targetMin: 0, targetMax: 0, days: [{ label: "F", value: 18, today: true }] } }));
    const regularity = renderToStaticMarkup(createElement(SleepRegularity, { data: { bedtime: "10:42 PM", wakeTime: "6:48 AM", consistency: null } }));

    expect(effort).toContain("target building");
    expect(effort).not.toContain("of 0–0");
    expect(regularity).toContain("At least three complete nights");
    expect(regularity).not.toContain("0%");
  });

  it("uses the full widget as the single path to its detail page", () => {
    const effort = renderToStaticMarkup(createElement(WeeklyEffort, { data: { current: 18, targetMin: 12, targetMax: 24, days: [{ label: "F", value: 18, today: true }] } }));
    const recovery = renderToStaticMarkup(createElement(RecoveryTrend, { data: [{ label: "Thu", value: 60 }, { label: "Fri", value: 67 }] }));
    const regularity = renderToStaticMarkup(createElement(SleepRegularity, { data: { bedtime: "10:42 PM", wakeTime: "6:48 AM", consistency: 82 } }));

    expect(effort).toContain('href="/activity"');
    expect(recovery).toContain('href="/recovery"');
    expect(regularity).toContain('href="/sleep"');
    expect(recovery).not.toContain("Explore");
  });
});

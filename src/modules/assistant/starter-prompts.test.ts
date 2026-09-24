import { describe, expect, it } from "vitest";

import { selectStarterPrompts } from "./starter-prompts";

const emptySignals = { hasGoals: false, hasRunning: false, hasEffort: false, hasSleep: false, hasRecovery: false, hasMeals: false };

describe("assistant starter prompts", () => {
  it("always returns three distinct questions without inventing recorded data", () => {
    const prompts = selectStarterPrompts(emptySignals);
    expect(prompts).toHaveLength(3);
    expect(prompts.map((prompt) => prompt.id)).toEqual(["overview", "missing", "next-step"]);
  });

  it("uses only observed domains and keeps confirmed goals in view", () => {
    const prompts = selectStarterPrompts({ ...emptySignals, hasGoals: true, hasRunning: true, hasMeals: true });
    expect(prompts.map((prompt) => prompt.id)).toEqual(["goals", "running", "nutrition"]);
  });

  it("rotates the available observations deterministically", () => {
    const signals = { ...emptySignals, hasGoals: true, hasRunning: true, hasEffort: true, hasSleep: true, hasMeals: true };
    expect(selectStarterPrompts(signals, 0).map((prompt) => prompt.id)).toEqual(["goals", "running", "effort"]);
    expect(selectStarterPrompts(signals, 2).map((prompt) => prompt.id)).toEqual(["goals", "sleep", "nutrition"]);
    expect(selectStarterPrompts(signals, 2)).toEqual(selectStarterPrompts(signals, 2));
  });

  it("anchors a question to a recorded day without inventing a performance judgment", () => {
    const prompts = selectStarterPrompts({ ...emptySignals, hasRunning: true }, 0, { running: "2026-09-23" });
    expect(prompts[0].text).toContain("23 septembre");
    expect(prompts[0].text).not.toMatch(/bonne|mauvaise|prêt/);
  });
});

// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { readHomeAssistantDraft, saveHomeAssistantDraft } from "./home-assistant-draft";

afterEach(() => { sessionStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });

it("keeps an unchanged draft briefly and removes expired or invalid browser data", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-10T09:00:00Z"));
  saveHomeAssistantDraft(" Question avec espaces  ");
  expect(readHomeAssistantDraft()).toBe(" Question avec espaces  ");
  vi.advanceTimersByTime(30 * 60_000 + 1);
  expect(readHomeAssistantDraft()).toBeNull();
  sessionStorage.setItem("soma:home-assistant-draft", "not json");
  expect(readHomeAssistantDraft()).toBeNull();
  sessionStorage.setItem("soma:home-assistant-draft", JSON.stringify({ text: "q".repeat(4001), savedAt: Date.now() }));
  expect(readHomeAssistantDraft()).toBeNull();
});

it("leaves typing functional when browser storage refuses access", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
  expect(() => saveHomeAssistantDraft("Question")).not.toThrow();
});

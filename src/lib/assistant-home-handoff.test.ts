// @vitest-environment jsdom

import { beforeEach, expect, it } from "vitest";

import { consumeHomeAssistantMessage, saveHomeAssistantMessage } from "./assistant-home-handoff";

beforeEach(() => sessionStorage.clear());

it("hands a private first message to the assistant only once", () => {
  expect(saveHomeAssistantMessage("  Bonjour Soma  ")).toBe(true);
  expect(consumeHomeAssistantMessage()).toBe("Bonjour Soma");
  expect(consumeHomeAssistantMessage()).toBeNull();
});

it("rejects an expired or oversized pending message", () => {
  expect(saveHomeAssistantMessage("x".repeat(4_001))).toBe(false);
  sessionStorage.setItem("soma:home-assistant-message", JSON.stringify({ text: "Ancienne question", createdAt: Date.now() - 120_001 }));
  expect(consumeHomeAssistantMessage()).toBeNull();
});

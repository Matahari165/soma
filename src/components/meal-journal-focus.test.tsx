// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import MealJournal from "./meal-journal";

const date = "2026-08-31";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("MealJournal note focus", () => {
  it.each(["lab", "meals"] as const)("keeps the note focused when the first character creates a %s draft", async (variant) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ targets: DEFAULT_NUTRITION_TARGETS })));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<MealJournal variant={variant} showDateNavigation={false} date={date} today={date} initialData={{ date, meals: {} }} />);
    });

    const inputElement = container.querySelector<HTMLInputElement | HTMLTextAreaElement>('[id="meal-breakfast-note"]');
    expect(inputElement).not.toBeNull();
    inputElement?.focus();
    const proto = inputElement instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setValue = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setValue?.call(inputElement, "P");

    await act(async () => {
      inputElement?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const nextInputElement = container.querySelector<HTMLInputElement | HTMLTextAreaElement>('[id="meal-breakfast-note"]');
    expect(nextInputElement).toBe(inputElement);
    expect(document.activeElement).toBe(inputElement);
    expect(nextInputElement?.value).toBe("P");

    await act(async () => root.unmount());
  });
});

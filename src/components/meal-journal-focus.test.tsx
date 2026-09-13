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

    const textarea = container.querySelector<HTMLTextAreaElement>('[id="meal-breakfast-note"]');
    expect(textarea).not.toBeNull();
    textarea?.focus();
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setValue?.call(textarea, "P");

    await act(async () => {
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const nextTextarea = container.querySelector<HTMLTextAreaElement>('[id="meal-breakfast-note"]');
    expect(nextTextarea).toBe(textarea);
    expect(document.activeElement).toBe(textarea);
    expect(nextTextarea?.value).toBe("P");

    await act(async () => root.unmount());
  });
});

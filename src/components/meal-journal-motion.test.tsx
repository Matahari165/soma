// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import { MealJournal, type MealJournalData } from "./meal-journal";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const date = "2026-09-26";
const data: MealJournalData = {
  date,
  meals: {
    lunch: { id: "synthetic-persisted-lunch", date, slot: "lunch", note: "Synthetic fixture", photos: [], analysis: null, mouthHeat: null, stomachLoad: null, status: "draft" },
    breakfast: null, snack: null, dinner: null,
  },
};
let root: Root;
let container: HTMLDivElement;
let trigger: HTMLButtonElement;
const removeMeal = vi.fn(async () => {});
const fetchSpy = vi.fn(() => { throw new Error("Unexpected network request in synthetic dialog test"); });

function button(text: string, within: ParentNode = container) {
  const found = Array.from(within.querySelectorAll("button")).find((element) => element.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
function dialog() { return container.querySelector<HTMLElement>("#meal-delete-dialog"); }
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function key(key: string, shiftKey = false) {
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })));
}
async function open() { trigger.focus(); await click(trigger); }

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: false }));
  vi.stubGlobal("fetch", fetchSpy);
  removeMeal.mockClear();
  fetchSpy.mockClear();
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<MealJournal today={date} initialData={data} initialTargets={DEFAULT_NUTRITION_TARGETS} initialTargetsDate={date} initialTargetsFresh initialTargetsPersisted api={{ removeMeal }} />));
  trigger = button("Delete meal");
});
afterEach(async () => {
  await act(async () => root.unmount());
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  container.remove();
  localStorage.clear();
});

describe("MealJournal deletion confirmation motion", () => {
  it.each(["Cancel", "Escape"])("%s returns focus without deletion and immediately neutralizes the retained dialog", async (action) => {
    await open();
    expect(document.activeElement).toBe(button("Cancel", dialog()!));
    if (action === "Cancel") await click(button("Cancel", dialog()!));
    else await key("Escape");
    expect(removeMeal).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    expect(dialog()?.getAttribute("role")).toBeNull();
    expect(dialog()?.parentElement?.hasAttribute("inert")).toBe(true);
    expect(dialog()?.parentElement?.getAttribute("aria-hidden")).toBe("true");
    await act(async () => vi.advanceTimersByTime(179));
    expect(dialog()).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1));
    expect(dialog()).toBeNull();
  });

  it("keeps a rapidly reopened confirmation active after the old exit deadline", async () => {
    await open();
    await click(button("Cancel", dialog()!));
    await act(async () => vi.advanceTimersByTime(90));
    await open();
    await act(async () => vi.advanceTimersByTime(200));
    expect(dialog()?.getAttribute("role")).toBe("alertdialog");
    expect(dialog()?.parentElement?.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(button("Cancel", dialog()!));
    expect(removeMeal).not.toHaveBeenCalled();
  });

  it("wraps keyboard focus between the confirmation actions", async () => {
    await open();
    const cancel = button("Cancel", dialog()!);
    const confirm = button("Delete", dialog()!);
    await key("Tab", true);
    expect(document.activeElement).toBe(confirm);
    await key("Tab");
    expect(document.activeElement).toBe(cancel);
    expect(removeMeal).not.toHaveBeenCalled();
  });

  it("confirms deletion exactly once through the injected API and removes the synthetic meal", async () => {
    await open();
    const confirm = button("Delete", dialog()!);
    await click(confirm);
    // Even a stale event during the retained exit must not issue another deletion.
    await click(confirm);
    expect(removeMeal).toHaveBeenCalledExactlyOnceWith("synthetic-persisted-lunch");
    expect(container.textContent).toContain("Lunch deleted.");
    expect(Array.from(container.querySelectorAll("button")).some((element) => element.textContent?.trim() === "Delete meal")).toBe(false);
    await act(async () => vi.advanceTimersByTime(180));
    expect(dialog()).toBeNull();
  });
});

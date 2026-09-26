// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { ObservatoryRings } from "./observatory-rings";
import { MEAL_TOTALS_EVENT } from "@/domain/meal-record";

const data = { sleepMinutes: 489, recoveryScore: 59, effortScore: 75, caloriesKcal: 1200, calorieTarget: null };
const container = document.createElement("div");
document.body.append(container);
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });
async function mount() { root = createRoot(container); await act(async () => root?.render(<ObservatoryRings data={data} date="2026-09-25" />)); }
function ring(id: string) { return container.querySelector<SVGGElement>(`[data-ring="${id}"]`)!; }

it("opens a metric with the keyboard, dims other rings and restores focus with Escape", async () => {
  await mount();
  await act(async () => ring("effort").focus());
  expect(ring("effort").getAttribute("data-active")).toBe("true");
  expect(ring("sleep").getAttribute("data-dimmed")).toBe("true");
  await act(async () => ring("effort").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(ring("effort").getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement?.tagName).toBe("H2");
  expect(container.querySelector("aside")?.textContent).toContain("75 / 100");
  expect(container.querySelector("aside a")?.getAttribute("href")).toBe("/strain?date=2026-09-25");
  await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(container.querySelector("aside")?.getAttribute("aria-hidden")).toBe("true");
  expect(document.activeElement).toBe(ring("effort"));
  expect(container.querySelector("aside")?.textContent).toContain("75 / 100");
});

it("keeps a missing calorie goal unavailable and updates an open detail from confirmed meals", async () => {
  await mount();
  await act(async () => ring("calories").dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(container.querySelector("aside")?.textContent).toContain("Non renseignée");
  expect(container.querySelector("aside")?.textContent).toContain("Indisponible");
  await act(async () => window.dispatchEvent(new CustomEvent(MEAL_TOTALS_EVENT, { detail: { date: "2026-09-25", calories: 3000, calorieTarget: 2400 } })));
  expect(container.querySelector("aside")?.textContent).toContain("125 %");
  expect(ring("calories").getAttribute("data-turns")).toBe("1.25");
});

it("navigates between ring controls with the arrow keys", async () => {
  await mount();
  await act(async () => ring("sleep").focus());
  await act(async () => ring("sleep").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  expect(document.activeElement).toBe(ring("recovery"));
});

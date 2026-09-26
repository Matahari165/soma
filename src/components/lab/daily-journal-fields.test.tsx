// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { defaultJournalVariables } from "@/domain/lab/journal";
import { JournalFieldRow } from "./daily-journal-fields";

afterEach(() => { document.body.innerHTML = ""; });

function renderTime(value: string | null, disabled = false) {
  const variable = { ...defaultJournalVariables.find((item) => item.name === "Dinner end time")!, id: "dinner-time", isActive: true, options: [] };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onChange = vi.fn();
  act(() => root.render(createElement(JournalFieldRow, { variable, value, disabled, onChange, draftKey: "time", confirmed: false, skipped: false, dayValidated: false, presentation: "personal-lab" })));
  const hour = host.querySelector<HTMLSelectElement>('select[aria-label="Dinner end hour"]')!;
  const minute = host.querySelector<HTMLSelectElement>('select[aria-label="Dinner end minute"]')!;
  return { root, onChange, hour, minute };
}

function choose(select: HTMLSelectElement, value: string) {
  act(() => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}

it("saves a complete dinner time in canonical evening hours without inventing a partial time", () => {
  const { root, onChange, hour, minute } = renderTime(null);
  choose(hour, "8");
  expect(onChange).not.toHaveBeenCalled();
  choose(minute, "15");
  expect(onChange).toHaveBeenLastCalledWith("20:15");
  choose(hour, "12");
  expect(onChange).toHaveBeenLastCalledWith("12:15");
  choose(hour, "");
  choose(minute, "");
  expect(onChange).toHaveBeenLastCalledWith(null);
  act(() => root.unmount());
});

it("preserves a recorded exact minute until another minute is explicitly selected", () => {
  const { root, onChange, hour, minute } = renderTime("19:07");
  expect(hour.value).toBe("7");
  expect(minute.value).toBe("07");
  expect(onChange).not.toHaveBeenCalled();
  choose(hour, "8");
  expect(onChange).toHaveBeenLastCalledWith("20:07");
  choose(minute, "10");
  expect(onChange).toHaveBeenLastCalledWith("20:10");
  act(() => root.unmount());
});

it("offers five-minute steps and respects a disabled journal", () => {
  const { root, hour, minute } = renderTime(null, true);
  expect([...hour.options].slice(1).map((option) => option.value)).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)));
  expect([...minute.options].slice(1).map((option) => option.value)).toEqual(["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]);
  expect(hour.disabled).toBe(true);
  expect(minute.disabled).toBe(true);
  act(() => root.unmount());
});

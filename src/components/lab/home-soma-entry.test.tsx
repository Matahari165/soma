// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HomeSomaEntry } from "./home-soma-entry";
import { readHomeAssistantDraft, saveHomeAssistantDraft } from "@/lib/home-assistant-draft";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const observation = "Cette nuit : 8 h 05 de sommeil.";
const roots: Root[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-10T09:00:00Z"));
  sessionStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", window.clearTimeout.bind(window));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ text: observation, source: "Sommeil · Récupération · Effort", moment: "morning" })));
});
afterEach(async () => {
  await act(async () => roots.splice(0).forEach(root => root.unmount()));
  vi.useRealTimers();
  vi.unstubAllGlobals();
  push.mockClear();
  sessionStorage.clear();
  document.body.innerHTML = "";
});

async function mount(revision = "initial", flush = true) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<HomeSomaEntry visible insightRevision={revision} />));
  if (flush) await act(async () => vi.advanceTimersByTime(0));
  return { container, root, textarea: container.querySelector<HTMLTextAreaElement>("textarea")! };
}
async function type(textarea: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
  await act(async () => textarea.dispatchEvent(new Event("input", { bubbles: true })));
}

it("keeps the user's draft, adds an observation once, and removes decorative labels", async () => {
  const { container, textarea } = await mount();
  const draft = "Ma question déjà écrite, avec ses espaces.  ";
  await type(textarea, draft);
  const button = container.querySelector<HTMLButtonElement>("section button")!;
  await act(async () => button.click());
  const withObservation = textarea.value;
  expect(withObservation.startsWith(draft + "\n\n")).toBe(true);
  expect(withObservation).toContain(observation);
  await act(async () => button.click());
  expect(textarea.value).toBe(withObservation);
  expect(container.textContent).not.toContain("Sommeil · Récupération · Effort");
  expect(container.textContent).not.toContain("Aujourd’hui");
});

it("preserves a full draft instead of truncating it to add an observation", async () => {
  const { container, textarea } = await mount();
  const draft = "q".repeat(4000);
  await type(textarea, draft);
  await act(async () => container.querySelector<HTMLButtonElement>("section button")!.click());
  expect(textarea.value).toBe(draft);
  expect(container.querySelector("[role=alert]")?.textContent).toContain("brouillon est conservé");
});

it("keeps the draft through the voice entrance and a remount", async () => {
  const { container, textarea, root } = await mount();
  await type(textarea, "Brouillon à reprendre");
  await act(async () => container.querySelector<HTMLButtonElement>("[aria-label='Ouvrir Soma pour parler']")!.click());
  expect(push).toHaveBeenCalledWith("/assistant");
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  const second = await mount();
  await act(async () => vi.advanceTimersByTime(0));
  expect(second.textarea.value).toBe("Brouillon à reprendre");
});

it("coalesces imported revisions within five minutes and preserves content across past dates", async () => {
  const { root, container, textarea } = await mount();
  await type(textarea, "Ma question");
  await act(async () => vi.advanceTimersByTime(4 * 60_000));
  await act(async () => root.render(<HomeSomaEntry visible insightRevision="new-import" />));
  await act(async () => root.render(<HomeSomaEntry visible insightRevision="newer-import" />));
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => root.render(<HomeSomaEntry visible={false} insightRevision="newer-import" />));
  await act(async () => root.render(<HomeSomaEntry visible insightRevision="newer-import" />));
  expect(container.textContent).toContain(observation);
  expect(textarea.value).toBe("Ma question");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("clears the saved draft only after a successful handoff and prevents double submit", async () => {
  const { container, textarea } = await mount();
  await type(textarea, "Une question unique");
  const form = container.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(push).toHaveBeenCalledTimes(1);
  expect(readHomeAssistantDraft()).toBeNull();
  expect(JSON.parse(sessionStorage.getItem("soma:home-assistant-message")!).text).toBe("Une question unique");
});

it("does not overwrite input typed before browser-draft restoration", async () => {
  saveHomeAssistantDraft("Ancien brouillon");
  const { textarea } = await mount("initial", false);
  await type(textarea, "Nouvelle question");
  await act(async () => vi.advanceTimersByTime(0));
  expect(textarea.value).toBe("Nouvelle question");
});

it("starts only one request under Strict Mode", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<StrictMode><HomeSomaEntry visible /></StrictMode>));
  await act(async () => vi.advanceTimersByTime(0));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain(observation);
});

it("keeps the delay after aborting an in-flight request on a past date", async () => {
  vi.mocked(fetch).mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  const { root } = await mount();
  await act(async () => root.render(<HomeSomaEntry visible={false} />));
  await act(async () => root.render(<HomeSomaEntry visible />));
  await act(async () => vi.advanceTimersByTime(0));
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTime(5 * 60_000));
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("shows an initial failure as a status, not an observation", async () => {
  vi.mocked(fetch).mockRejectedValueOnce(new Error("Offline"));
  const { container } = await mount();
  expect(container.querySelector("[role=status]")?.textContent).toContain("indisponible");
  expect(container.querySelector("section button")).toBeNull();
  expect(container.querySelector("textarea")).not.toBeNull();
});

it("releases a stalled summary request while keeping the composer available", async () => {
  vi.mocked(fetch).mockImplementationOnce((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  const { container } = await mount();
  await act(async () => vi.advanceTimersByTime(35_000));
  expect(container.querySelector("[role=status]")?.textContent).toContain("indisponible");
  expect(container.querySelector<HTMLTextAreaElement>("textarea")?.disabled).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
});


it("activates typing from the capsule surface without hijacking its action buttons", async () => {
  const { container, textarea } = await mount();
  const form = container.querySelector<HTMLFormElement>("form")!;
  await act(async () => form.click());
  expect(document.activeElement).toBe(textarea);
  expect(textarea.rows).toBe(3);
  await type(textarea, "Brouillon conservé");
  const focus = vi.spyOn(textarea, "focus");
  await act(async () => form.querySelector<HTMLSpanElement>("span")!.click());
  expect(focus).toHaveBeenCalledOnce();
  expect(textarea.value).toBe("Brouillon conservé");
  focus.mockClear();
  await act(async () => form.querySelector("button svg")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(focus).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledWith("/assistant");
  focus.mockRestore();
});

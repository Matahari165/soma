// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StrongestEffectsResponse } from "@/domain/lab/strongest-effects-response";
import { StrongestEffectsPanel } from "./correlation-matrix";

function payload(period: 30 | 90): StrongestEffectsResponse {
  return {
    generation: `fixture-generation-${period}`, periods: [30, 90],
    outcomes: [{ id: "hrv", label: "HRV", unit: "ms", direction: "higher" }],
    rows: [{ id: String(period), label: "Fixture", emoji: null, grain: "day", timeScale: "acute", period, lagLabel: "D+1", relations: [0, 1].map((index) => ({
      predictorId: `journal:fixture-${index}`, predictorLabel: `Fixture ${period} ${index}`,
      outcomeId: "hrv", outcomeLabel: "HRV", outcomeUnit: "ms", coefficient: .5,
      effect: 4, effectConfidenceLow: 2, effectConfidenceHigh: 6, percentEffect: 8,
      comparisonLabel: "+60 g", modelType: "linear", sampleSize: 48, qValue: .02,
      confidenceLow: .1, confidenceHigh: .8, relevance: 1, lagDays: 1,
      grain: "day", timeScale: "acute", period, stable: true, minimumDaysRemaining: 0,
      practicallyMeaningful: true, practicalThreshold: 2, practicalRatio: 2,
      featureEligible: true, excluded: false,
    })) }],
  };
}

function pendingResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  container.remove();
});

async function mount() {
  await act(async () => root.render(<StrongestEffectsPanel />));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

function periodButton(period: number) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="Afficher les relations sur ${period} jours"]`)!;
}

async function click(button: HTMLButtonElement) {
  expect(button).not.toBeNull();
  await act(async () => button.click());
}

describe("Strongest Effects period and disclosure continuity", () => {
  it("keeps the displayed period and rows during a failed request, then retries the requested period", async () => {
    const failed = pendingResponse();
    const retry = pendingResponse();
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(payload(90))).mockReturnValueOnce(failed.promise).mockReturnValueOnce(retry.promise);
    vi.stubGlobal("fetch", fetchMock);
    await mount();
    const rows = [...container.querySelectorAll(".strongest-effects__row")];
    expect(rows).toHaveLength(2);
    await click(periodButton(30));
    expect(periodButton(90).getAttribute("aria-pressed")).toBe("true");
    rows.forEach((row, index) => expect(container.querySelectorAll(".strongest-effects__row")[index]).toBe(row));
    expect(container.textContent).toContain("Chargement des relations sur 30 jours");
    await act(async () => failed.resolve(new Response(null, { status: 503 })));
    expect(periodButton(90).getAttribute("aria-pressed")).toBe("true");
    rows.forEach((row, index) => expect(container.querySelectorAll(".strongest-effects__row")[index]).toBe(row));
    await click([...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Réessayer")!);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/lab/matrix?period=90&format=compact", "/api/lab/matrix?period=30&format=compact", "/api/lab/matrix?period=30&format=compact",
    ]);
    expect(periodButton(90).getAttribute("aria-pressed")).toBe("true");
    await act(async () => retry.resolve(Response.json(payload(30))));
    expect(periodButton(30).getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("Fixture 30 0");
    expect(container.textContent).not.toContain("Fixture 90 0");
    expect(container.querySelector(".strongest-effects-panel")?.getAttribute("aria-busy")).toBe("false");
  });

  it("cancels the deferred detail and keeps closing proof inert with unique IDs when another row opens", async () => {
    const first = pendingResponse();
    const second = pendingResponse();
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(payload(90))).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    await mount();
    const triggers = [...container.querySelectorAll<HTMLButtonElement>(".strongest-effects__row > button")];
    await click(triggers[0]);
    expect(container.querySelectorAll("#relation-detail-panel")).toHaveLength(1);
    await click(triggers[1]);
    expect((fetchMock.mock.calls[1][1] as RequestInit).signal?.aborted).toBe(true);
    expect(container.querySelectorAll("#relation-detail-panel")).toHaveLength(1);
    const ids = [...container.querySelectorAll<HTMLElement>("[id]")].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    const closing = container.querySelector('.matrix-motion-detail[data-state="closed"]');
    expect(closing?.hasAttribute("inert")).toBe(true);
    expect(closing?.getAttribute("aria-hidden")).toBe("true");
    await act(async () => first.resolve(new Response(null, { status: 503 })));
    expect(container.querySelector("#relation-detail-panel")?.getAttribute("aria-busy")).toBe("true");
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(container.querySelector('.matrix-motion-detail[data-state="closed"]')).toBeNull();
  });

  it("retries the displayed period after refreshing a stale detail following another period failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(payload(90)))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json(payload(90)));
    vi.stubGlobal("fetch", fetchMock);
    await mount();
    await click(periodButton(30));
    expect(periodButton(90).getAttribute("aria-pressed")).toBe("true");
    await click(container.querySelector<HTMLButtonElement>(".strongest-effects__row > button")!);
    await click([...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Recharger cette période")!);
    await click([...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Réessayer")!);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("/api/lab/matrix?period=90&format=compact");
    expect(periodButton(90).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".strongest-effects-panel")?.getAttribute("aria-busy")).toBe("false");
  });

});

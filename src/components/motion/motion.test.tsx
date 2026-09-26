// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMotionPresence } from "./use-motion-presence";
import { useMotionUpdate } from "./use-motion-update";

let root: Root;
let container: HTMLDivElement;
let preference: EventTarget & { matches: boolean };

beforeEach(() => {
  vi.useFakeTimers();
  preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => preference);
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

function Panel({ open }: { open: boolean }) {
  const present = useMotionPresence(open);
  return present ? <section inert={!open} aria-hidden={!open}><button>Detail</button></section> : null;
}

function Result({ revision }: { revision: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useMotionUpdate(ref, revision);
  return <div ref={ref}><input defaultValue="draft" /></div>;
}

describe("interruptible motion", () => {
  it("neutralizes a closed panel immediately and does not let its old exit remove a reopened panel", async () => {
    await act(async () => root.render(<Panel open />));
    await act(async () => root.render(<Panel open={false} />));
    expect(container.querySelector("section")?.hasAttribute("inert")).toBe(true);
    expect(container.querySelector("section")?.getAttribute("aria-hidden")).toBe("true");
    await act(async () => vi.advanceTimersByTime(90));
    await act(async () => root.render(<Panel open />));
    await act(async () => vi.advanceTimersByTime(200));
    expect(container.querySelector("section")?.hasAttribute("inert")).toBe(false);
    await act(async () => root.render(<Panel open={false} />));
    await act(async () => vi.advanceTimersByTime(180));
    expect(container.querySelector("section")).toBeNull();
  });

  it("removes an exiting panel immediately when reduced motion is enabled during its exit", async () => {
    await act(async () => root.render(<Panel open />));
    await act(async () => root.render(<Panel open={false} />));
    expect(container.querySelector("section")).not.toBeNull();
    await act(async () => {
      preference.matches = true;
      preference.dispatchEvent(new Event("change"));
    });
    expect(container.querySelector("section")).toBeNull();
  });

  it("keeps the focused control mounted and cancels superseded or reduced-motion updates", async () => {
    await act(async () => root.render(<Result revision={0} />));
    const result = container.firstElementChild as HTMLDivElement;
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    result.animate = animate as unknown as typeof result.animate;
    const input = container.querySelector("input");
    input?.focus();
    await act(async () => root.render(<Result revision={1} />));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
    await act(async () => root.render(<Result revision={2} />));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(container.querySelector("input")).toBe(input);
    await act(async () => {
      preference.matches = true;
      preference.dispatchEvent(new Event("change"));
    });
    expect(cancel).toHaveBeenCalledTimes(2);
    await act(async () => root.render(<Result revision={3} />));
    expect(animate).toHaveBeenCalledTimes(2);
  });
});

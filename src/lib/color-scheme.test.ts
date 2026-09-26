import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyColorScheme, COLOR_SCHEME_INIT_SCRIPT, COLOR_SCHEME_STORAGE_KEY, getColorScheme, setColorScheme, subscribeColorScheme } from "./color-scheme";

function browser(saved: string | null = null, denyStorage = false) {
  const dataset: { colorScheme?: string } = {};
  const meta = { "color-scheme": "light", "theme-color": "#ffffff" };
  const storage = new Map<string, string>();
  if (saved !== null) storage.set(COLOR_SCHEME_STORAGE_KEY, saved);
  const listeners = new Map<string, Set<EventListener>>();
  const localStorage = {
    getItem: (key: string) => { if (denyStorage) throw new Error("Storage unavailable"); return storage.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (denyStorage) throw new Error("Storage unavailable"); storage.set(key, value); },
  };
  const document = {
    documentElement: { dataset },
    querySelector: (selector: string) => ({ setAttribute: (_name: string, value: string) => {
      meta[selector.includes("theme-color") ? "theme-color" : "color-scheme"] = value;
    } }),
  };
  const window = {
    localStorage,
    addEventListener: (name: string, listener: EventListener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    removeEventListener: (name: string, listener: EventListener) => listeners.get(name)?.delete(listener),
    dispatchEvent: (event: Event) => { listeners.get(event.type)?.forEach((listener) => listener(event)); return true; },
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  return { dataset, meta, storage, document, window, localStorage };
}

afterEach(() => vi.unstubAllGlobals());

describe("color scheme preference", () => {
  it.each([null, "invalid", "light"])("starts light for %s", (saved) => {
    const context = browser(saved);
    runInNewContext(COLOR_SCHEME_INIT_SCRIPT, context);
    expect(getColorScheme()).toBe("light");
    expect(context.meta["theme-color"]).toBe("#ffffff");
  });

  it("restores dark before rendering and keeps browser metadata consistent", () => {
    const context = browser("dark");
    runInNewContext(COLOR_SCHEME_INIT_SCRIPT, context);
    expect(getColorScheme()).toBe("dark");
    expect(context.meta).toEqual({ "color-scheme": "dark", "theme-color": "#050505" });
  });

  it("persists toggles, notifies all controls and survives a reload", () => {
    const context = browser();
    const onChange = vi.fn();
    const unsubscribe = subscribeColorScheme(onChange);
    setColorScheme("dark");
    expect(onChange).toHaveBeenCalledOnce();
    expect(context.storage.get(COLOR_SCHEME_STORAGE_KEY)).toBe("dark");
    context.dataset.colorScheme = "light";
    runInNewContext(COLOR_SCHEME_INIT_SCRIPT, context);
    expect(getColorScheme()).toBe("dark");
    unsubscribe();
    setColorScheme("light");
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("still switches in memory when browser storage is denied", () => {
    const context = browser(null, true);
    expect(() => runInNewContext(COLOR_SCHEME_INIT_SCRIPT, context)).not.toThrow();
    expect(() => setColorScheme("dark")).not.toThrow();
    expect(getColorScheme()).toBe("dark");
    expect(context.meta["color-scheme"]).toBe("dark");
  });

  it("syncs another tab and falls back to light when the preference is cleared", () => {
    const context = browser("dark");
    applyColorScheme("dark");
    const onChange = vi.fn();
    const unsubscribe = subscribeColorScheme(onChange);
    context.window.dispatchEvent({ type: "storage", key: "other", newValue: "light" } as unknown as Event);
    expect(getColorScheme()).toBe("dark");
    context.window.dispatchEvent({ type: "storage", key: COLOR_SCHEME_STORAGE_KEY, newValue: null } as unknown as Event);
    expect(getColorScheme()).toBe("light");
    expect(onChange).toHaveBeenCalledOnce();
    unsubscribe();
  });
});

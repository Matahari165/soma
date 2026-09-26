export type ColorScheme = "light" | "dark";

export const COLOR_SCHEME_STORAGE_KEY = "soma-color-scheme";
export const COLOR_SCHEME_COLORS = { light: "#ffffff", dark: "#050505" } as const;
const CHANGE_EVENT = "soma-color-scheme-change";

export function normalizeColorScheme(value: string | null | undefined): ColorScheme {
  return value === "dark" ? "dark" : "light";
}

export function getColorScheme(): ColorScheme {
  return normalizeColorScheme(document.documentElement.dataset.colorScheme);
}

export function applyColorScheme(scheme: ColorScheme) {
  document.documentElement.dataset.colorScheme = scheme;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", scheme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COLOR_SCHEME_COLORS[scheme]);
}

export function setColorScheme(scheme: ColorScheme) {
  applyColorScheme(scheme);
  try { window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme); } catch { /* The current tab still works when storage is unavailable. */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeColorScheme(onChange: () => void) {
  // Reconcile metadata after React has hydrated the server-rendered head.
  applyColorScheme(getColorScheme());
  const onStorage = (event: StorageEvent) => {
    if (event.key !== COLOR_SCHEME_STORAGE_KEY && event.key !== null) return;
    applyColorScheme(normalizeColorScheme(event.newValue));
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

// A nonce-authorized head script restores the preference before any body paints.
// Only these fixed application constants are interpolated, never request data.
export const COLOR_SCHEME_INIT_SCRIPT = `(function(){var scheme="light";try{if(localStorage.getItem(${JSON.stringify(COLOR_SCHEME_STORAGE_KEY)})==="dark")scheme="dark"}catch{}document.documentElement.dataset.colorScheme=scheme;document.querySelector('meta[name="color-scheme"]')?.setAttribute("content",scheme);document.querySelector('meta[name="theme-color"]')?.setAttribute("content",scheme==="dark"?${JSON.stringify(COLOR_SCHEME_COLORS.dark)}:${JSON.stringify(COLOR_SCHEME_COLORS.light)});})();`;

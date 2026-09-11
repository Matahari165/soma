"use client";

import { useSyncExternalStore } from "react";
export const labThemes = [
  { id: "observatory", name: "Observatoire" },
  { id: "index", name: "Index" },
  { id: "focus", name: "Focus" },
] as const;
function subscribe(listener: () => void) {
  window.addEventListener("lab-theme-change", listener);
  return () => window.removeEventListener("lab-theme-change", listener);
}
export function useLabTheme() {
  return useSyncExternalStore(subscribe, () => document.documentElement.dataset.labTheme || "observatory", () => "observatory");
}

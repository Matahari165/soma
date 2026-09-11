"use client";

import { useSyncExternalStore } from "react";
function subscribe(listener: () => void) {
  window.addEventListener("lab-theme-change", listener);
  return () => window.removeEventListener("lab-theme-change", listener);
}
export function useLabTheme() {
  return useSyncExternalStore(subscribe, () => document.documentElement.dataset.labTheme || "observatory", () => "observatory");
}

export function useLabArtwork() {
  return useSyncExternalStore(subscribe, () => document.documentElement.dataset.labArt || "geometry", () => "geometry");
}

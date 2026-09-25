"use client";

import { useCallback, useSyncExternalStore } from "react";

export type PrimaryChartPresentation = "radar" | "rings";

const PRIMARY_CHART_PRESENTATION_KEY = "soma.dashboard.primary-chart-presentation";
const PRIMARY_CHART_PRESENTATION_CHANGE_EVENT = "soma:primary-chart-presentation-change";
const DEFAULT_PRESENTATION: PrimaryChartPresentation = "rings";
let inMemoryPresentation: PrimaryChartPresentation = DEFAULT_PRESENTATION;

function readPrimaryChartPresentation(): PrimaryChartPresentation {
  try {
    const stored = window.localStorage.getItem(PRIMARY_CHART_PRESENTATION_KEY);
    return stored === "radar" || stored === "rings" ? stored : DEFAULT_PRESENTATION;
  } catch {
    return inMemoryPresentation;
  }
}

function subscribeToPrimaryChartPresentation(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === PRIMARY_CHART_PRESENTATION_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(PRIMARY_CHART_PRESENTATION_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(PRIMARY_CHART_PRESENTATION_CHANGE_EVENT, onChange);
  };
}

function serverPrimaryChartPresentation(): PrimaryChartPresentation {
  return DEFAULT_PRESENTATION;
}

function savePrimaryChartPresentation(next: PrimaryChartPresentation) {
  inMemoryPresentation = next;
  try {
    window.localStorage.setItem(PRIMARY_CHART_PRESENTATION_KEY, next);
  } catch {
    // Keep the current selection usable when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(PRIMARY_CHART_PRESENTATION_CHANGE_EVENT));
}

export function usePrimaryChartPresentation() {
  const primaryChartPresentation = useSyncExternalStore(
    subscribeToPrimaryChartPresentation,
    readPrimaryChartPresentation,
    serverPrimaryChartPresentation,
  );

  const setPrimaryChartPresentation = useCallback((next: PrimaryChartPresentation) => {
    savePrimaryChartPresentation(next);
  }, []);

  return { primaryChartPresentation, setPrimaryChartPresentation };
}

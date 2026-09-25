"use client";

import { useCallback, useSyncExternalStore } from "react";

export type PrimaryChartPresentation = "radar" | "rings";

const PRIMARY_CHART_PRESENTATION_KEY = "soma.dashboard.primary-chart-presentation";
const PRIMARY_CHART_PRESENTATION_CHANGE_EVENT = "soma:primary-chart-presentation-change";
const DEFAULT_PRESENTATION: PrimaryChartPresentation = "radar";

function readPrimaryChartPresentation(): PrimaryChartPresentation {
  try {
    return window.localStorage.getItem(PRIMARY_CHART_PRESENTATION_KEY) === "rings" ? "rings" : DEFAULT_PRESENTATION;
  } catch {
    return DEFAULT_PRESENTATION;
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
  try {
    window.localStorage.setItem(PRIMARY_CHART_PRESENTATION_KEY, next);
  } catch {
    // Keep the control usable if browser storage is unavailable.
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

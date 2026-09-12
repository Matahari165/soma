"use client";

import { useCallback, useSyncExternalStore } from "react";

const TEMPORAL_STABILITY_PREFERENCE_KEY = "soma.personal-lab.require-temporal-stability";

function readTemporalStabilityPreference() {
  try {
    return window.localStorage.getItem(TEMPORAL_STABILITY_PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
}

function subscribeToTemporalStabilityPreference(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === TEMPORAL_STABILITY_PREFERENCE_KEY) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener("soma:temporal-stability-change", onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("soma:temporal-stability-change", onChange);
  };
}

function serverTemporalStabilityPreference() {
  return true;
}

export function useTemporalStabilityPreference() {
  const requireTemporalStability = useSyncExternalStore(
    subscribeToTemporalStabilityPreference,
    readTemporalStabilityPreference,
    serverTemporalStabilityPreference,
  );

  const setRequireTemporalStability = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(TEMPORAL_STABILITY_PREFERENCE_KEY, String(next));
    } catch {
      // The control remains usable when local storage is unavailable.
    }
    window.dispatchEvent(new Event("soma:temporal-stability-change"));
  }, []);

  return { requireTemporalStability, setRequireTemporalStability };
}

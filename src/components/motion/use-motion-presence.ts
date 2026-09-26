"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  preference.addEventListener("change", listener);
  return () => preference.removeEventListener("change", listener);
}

function reducedMotionSnapshot() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, reducedMotionSnapshot, () => false);
}

/** Keep the closing view painted briefly; callers make it inert as soon as it closes. */
export function useMotionPresence(open: boolean) {
  const [retained, setRetained] = useState(open);
  const reducedMotion = useReducedMotion();

  // Restore presence during render, so a rapid reopen cancels the pending exit.
  if (open && !retained) setRetained(true);

  useEffect(() => {
    if (open || !retained) return;
    const timer = window.setTimeout(() => setRetained(false), reducedMotion ? 0 : 180);
    return () => window.clearTimeout(timer);
  }, [open, reducedMotion, retained]);

  return open || (!reducedMotion && retained);
}

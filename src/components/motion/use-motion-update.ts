"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Reveal a changed result in place, without remounting controls or inventing intermediate data. */
export function useMotionUpdate(
  ref: RefObject<HTMLElement | SVGElement | null>,
  revision: string | number | boolean | null,
) {
  const previousRevision = useRef(revision);

  useEffect(() => {
    const changed = previousRevision.current !== revision;
    previousRevision.current = revision;
    const node = ref.current;
    if (!changed || !node || typeof node.animate !== "function" || typeof window.matchMedia !== "function") return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;

    const tokens = getComputedStyle(node);
    const duration = Number.parseFloat(tokens.getPropertyValue("--soma-motion-state")) || 240;
    const easing = tokens.getPropertyValue("--soma-ease-state").trim() || "cubic-bezier(.2, .8, .2, 1)";
    const animation = node.animate([{ opacity: .72 }, { opacity: 1 }], { duration, easing });
    const stop = () => { if (preference.matches) animation.cancel(); };
    preference.addEventListener("change", stop);
    return () => {
      animation.cancel();
      preference.removeEventListener("change", stop);
    };
  }, [ref, revision]);
}

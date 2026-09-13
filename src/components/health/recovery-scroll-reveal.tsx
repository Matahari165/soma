"use client";

import { useEffect } from "react";

const revealSelector = "[data-recovery-scroll-reveal]";

/**
 * Progressive enhancement for the Recovery reading flow.
 *
 * The server-rendered sections stay fully visible. JavaScript only adds a
 * pending state when an observer is available, so an unsupported browser or
 * a reduced-motion preference never hides useful health data.
 */
export function RecoveryScrollReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-recovery-scroll-reveal-root]");
    if (!root) return undefined;

    const elements = Array.from(root.querySelectorAll<HTMLElement>(revealSelector));
    if (!elements.length) return undefined;

    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    let observer: IntersectionObserver | null = null;

    const showAll = () => {
      elements.forEach((element) => { element.dataset.reveal = "visible"; });
      observer?.disconnect();
      observer = null;
    };

    if (preference?.matches || typeof IntersectionObserver === "undefined") {
      showAll();
      return undefined;
    }

    elements.forEach((element) => { element.dataset.reveal = "pending"; });
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target as HTMLElement;
        element.dataset.reveal = "visible";
        observer?.unobserve(element);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -8% 0px" });

    elements.forEach((element) => observer?.observe(element));

    const onPreferenceChange = () => {
      if (preference?.matches) showAll();
    };
    preference?.addEventListener?.("change", onPreferenceChange);

    return () => {
      observer?.disconnect();
      preference?.removeEventListener?.("change", onPreferenceChange);
      elements.forEach((element) => { delete element.dataset.reveal; });
    };
  }, []);

  return null;
}

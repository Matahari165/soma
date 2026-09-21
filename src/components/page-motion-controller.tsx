"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const MOTION_TARGETS = [
  ".health-detail-hero",
  ".health-observatory-content > .health-observatory-panel",
  ".health-signal-meta--footer",
  ".meals-page > header",
  ".meals-page > div > *",
  ".settings-page > header",
  ".settings-layout > *",
  "#main-page-content > header",
  ".strongest-effects",
  ".personal-lab-day-strip",
  ".personal-lab-workspace > *",
].join(",");

/**
 * Adds one shared, progressive-enhancement motion language to authenticated pages.
 * Content is visible by default and only receives a pending state once the browser
 * can observe it, so failed JavaScript never hides useful health information.
 */
export function PageMotionController() {
  const pathname = usePathname();

  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
    let observer: IntersectionObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let frame = 0;
    const tracked = new Set<HTMLElement>();

    const revealAll = () => {
      tracked.forEach((element) => { element.dataset.somaMotion = "visible"; });
      observer?.disconnect();
      observer = null;
    };

    if (!preference?.matches && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target as HTMLElement;
          element.dataset.somaMotion = "visible";
          observer?.unobserve(element);
        });
      }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    }

    const collect = () => {
      const root = document.getElementById("main-page-content");
      if (!root) return;
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(MOTION_TARGETS));
      candidates.forEach((element, index) => {
        if (tracked.has(element)) return;
        tracked.add(element);
        element.style.setProperty("--soma-motion-order", String(Math.min(index, 3)));
        if (!observer) {
          element.dataset.somaMotion = "visible";
          return;
        }
        element.dataset.somaMotion = "pending";
        observer.observe(element);
      });
    };

    frame = window.requestAnimationFrame(collect);
    mutationObserver = new MutationObserver(collect);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    const onPreferenceChange = () => {
      if (preference?.matches) revealAll();
    };
    preference?.addEventListener?.("change", onPreferenceChange);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      mutationObserver?.disconnect();
      preference?.removeEventListener?.("change", onPreferenceChange);
      tracked.forEach((element) => {
        delete element.dataset.somaMotion;
        element.style.removeProperty("--soma-motion-order");
      });
    };
  }, [pathname]);

  return null;
}

"use client";

import { useEffect } from "react";

/** Reveal below-the-fold sections without hiding server-rendered content. */
export function HealthScrollReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-health-reveal-root]");
    if (!root || !window.IntersectionObserver) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;

    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-health-reveal]"));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const section = entry.target as HTMLElement;
        section.dataset.reveal = "visible";
        observer.unobserve(section);
      }
    }, { threshold: 0.04, rootMargin: "0px 0px -6% 0px" });

    for (const section of sections) {
      if (section.getBoundingClientRect().top < window.innerHeight) continue;
      section.dataset.reveal = "pending";
      observer.observe(section);
    }

    const onPreferenceChange = () => {
      if (!preference.matches) return;
      observer.disconnect();
      for (const section of sections) section.dataset.reveal = "visible";
    };
    preference.addEventListener("change", onPreferenceChange);

    return () => {
      observer.disconnect();
      preference.removeEventListener("change", onPreferenceChange);
      for (const section of sections) delete section.dataset.reveal;
    };
  }, []);

  return null;
}

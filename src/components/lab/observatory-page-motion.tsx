"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Shared progressive entrances for detail pages; content is visible without JS. */
export function ObservatoryPageMotion() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const observed = new WeakSet<Element>();
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (preference.matches) { observer.unobserve(entry.target); return; }
        observer.unobserve(entry.target);
        const animation = entry.target.animate([
          { opacity: .25, transform: "translateY(18px)" },
          { opacity: 1, transform: "translateY(0)" },
        ], { duration: 1100, easing: "cubic-bezier(.16,1,.3,1)" });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      });
    }, { threshold: .08 });
    const scan = () => document.querySelectorAll(".health-detail-page > header, .health-detail-page .metric-trend-card, .health-detail-page .health-observatory-panel, .settings-card, .meals-page > section, .meals-page-trends, .meals-page-recipes").forEach((element) => {
      if (observed.has(element)) return;
      observed.add(element);
      observer.observe(element);
    });
    const stopMotion = () => { if (preference.matches) animations.forEach(animation => animation.cancel()); };
    preference.addEventListener("change", stopMotion);
    scan();
    const mutation = new MutationObserver(scan);
    mutation.observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true });
    return () => { preference.removeEventListener("change", stopMotion); observer.disconnect(); mutation.disconnect(); animations.forEach(animation => animation.cancel()); };
  }, [pathname]);
  return null;
}

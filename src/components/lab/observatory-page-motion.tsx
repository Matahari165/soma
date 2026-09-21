"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

export const OBSERVATORY_MOTION_SELECTOR = ".lab-world > section, .health-detail-page .health-observatory-panel, .settings-card, .meals-page-score, .meals-page-journal, .meals-page-categories, .meals-page-trends, .meals-page-supplements, .meals-page-recipes";
export const OBSERVATORY_MOTION_EASING = "cubic-bezier(.16,1,.3,1)";
export const OBSERVATORY_MOTION_KEYFRAMES: Keyframe[] = [
  { opacity: .55, transform: "translateY(12px)" },
  { opacity: 1, transform: "translateY(-1px)", offset: .78 },
  { opacity: 1, transform: "translateY(0)" },
];

/** Shared progressive entrances for the Observatory; content stays visible without JS. */
export function ObservatoryPageMotion() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    if (!("IntersectionObserver" in window) || !("animate" in Element.prototype)) return;
    const observed = new WeakSet<Element>();
    const positions = new WeakMap<Element, number>();
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (preference.matches) { observer.unobserve(entry.target); return; }
        observer.unobserve(entry.target);
        const initiallyVisible = entry.target.getBoundingClientRect().top < window.innerHeight;
        const order = positions.get(entry.target) ?? 0;
        const animation = entry.target.animate(OBSERVATORY_MOTION_KEYFRAMES, {
          duration: initiallyVisible ? 620 : 320,
          delay: initiallyVisible ? Math.min(order * 30, 90) : 0,
          easing: OBSERVATORY_MOTION_EASING,
        });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      });
    }, { threshold: .08, rootMargin: "0px 0px -8% 0px" });
    const scan = () => document.querySelectorAll(OBSERVATORY_MOTION_SELECTOR).forEach((element, index) => {
      if (observed.has(element)) return;
      observed.add(element);
      positions.set(element, index);
      observer.observe(element);
    });
    const stopMotion = () => { if (preference.matches) animations.forEach(animation => animation.cancel()); };
    preference.addEventListener("change", stopMotion);
    scan();
    return () => { preference.removeEventListener("change", stopMotion); observer.disconnect(); animations.forEach(animation => animation.cancel()); };
  }, [pathname]);
  return null;
}

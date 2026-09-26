"use client";

import { useEffect } from "react";

const ROOT_SELECTOR = "[data-scroll-reveal-root]";
const REVEAL_SELECTOR = "[data-scroll-reveal]";

/** Reveals below-the-fold sections once while keeping server-rendered content visible by default. */
export function PageScrollReveal() {
  useEffect(() => {
    const roots = Array.from(document.querySelectorAll<HTMLElement>(ROOT_SELECTOR));
    if (!roots.length || typeof window.matchMedia !== "function" || typeof IntersectionObserver === "undefined") return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = preference.matches;

    const registered = new WeakSet<HTMLElement>();
    const targets = new Set<HTMLElement>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target as HTMLElement;
        target.dataset.reveal = "visible";
        observer.unobserve(target);
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -10% 0px" });

    const register = (target: HTMLElement) => {
      if (registered.has(target) || target.dataset.revealReady === "false") return;
      registered.add(target);
      targets.add(target);

      if (reduceMotion || target.getBoundingClientRect().top <= window.innerHeight * 0.9) {
        target.dataset.reveal = "visible";
        return;
      }

      target.dataset.reveal = "pending";
      observer.observe(target);
    };

    const registerTree = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches(REVEAL_SELECTOR)) register(node);
      node.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(register);
    };

    roots.forEach((root) => {
      registerTree(root);
    });

    const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") registerTree(record.target);
        else record.addedNodes.forEach(registerTree);
      }
    });
    roots.forEach((root) => mutationObserver?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-reveal-ready"] }));

    const onPreferenceChange = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches;
      if (!reduceMotion) return;
      observer.disconnect();
      for (const target of targets) target.dataset.reveal = "visible";
    };
    preference.addEventListener("change", onPreferenceChange);

    return () => {
      observer.disconnect();
      mutationObserver?.disconnect();
      preference.removeEventListener("change", onPreferenceChange);
      for (const target of targets) delete target.dataset.reveal;
    };
  }, []);

  return null;
}

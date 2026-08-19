"use client";

import { type RefObject, useEffect, useRef } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useDialogLayer({
  open,
  onClose,
  containerRef,
}: {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inerted: Array<{ element: HTMLElement; wasInert: boolean }> = [];
    let layer: HTMLElement | null = containerRef.current;
    while (layer?.parentElement) {
      const parent: HTMLElement = layer.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === layer || !(sibling instanceof HTMLElement)) continue;
        if (sibling.classList.contains("panel-backdrop")) continue;
        inerted.push({ element: sibling, wasInert: sibling.hasAttribute("inert") });
        sibling.setAttribute("inert", "");
      }
      if (parent === document.body) break;
      layer = parent;
    }
    const focusable = () => {
      const confirmation = containerRef.current?.querySelector<HTMLElement>(".modal-confirmation");
      const scope = confirmation ?? containerRef.current;
      return Array.from(scope?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter((element) => !element.closest("[inert]"));
    };
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => focusable()[0]?.focus());
    let confirmationWasOpen = Boolean(containerRef.current?.querySelector(".modal-confirmation"));
    const observer = new MutationObserver(() => {
      const confirmation = containerRef.current?.querySelector<HTMLElement>(".modal-confirmation");
      if (confirmation) {
        confirmationWasOpen = true;
        if (!confirmation.contains(document.activeElement)) focusable()[0]?.focus();
      } else if (confirmationWasOpen) {
        confirmationWasOpen = false;
        focusable()[0]?.focus();
      }
    });
    if (containerRef.current) observer.observe(containerRef.current, { childList: true, subtree: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      observer.disconnect();
      document.body.style.overflow = previousOverflow;
      for (const { element, wasInert } of inerted) {
        if (!wasInert) element.removeAttribute("inert");
      }
      previousFocus?.focus();
    };
  }, [containerRef, open]);
}

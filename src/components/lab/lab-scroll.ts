export function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function scrollToLabSection(sectionId: string, behavior: ScrollBehavior = preferredScrollBehavior()) {
  const section = document.getElementById(sectionId);
  if (!section) return false;

  const heading = section.querySelector<HTMLElement>("h2") ?? section;
  const navigationBottom = document.querySelector<HTMLElement>(".lab-global-nav")?.getBoundingClientRect().bottom ?? 0;
  const top = Math.max(0, window.scrollY + heading.getBoundingClientRect().top - navigationBottom - 12);

  window.scrollTo({ top, left: 0, behavior });
  return true;
}

export function scrollToLabSectionWhenReady(sectionId: string, behavior: ScrollBehavior = preferredScrollBehavior()) {
  let frameId: number | null = null;
  let timeoutId: number | null = null;
  let attempts = 0;
  let observedSection: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const stop = () => {
    if (frameId !== null) window.cancelAnimationFrame(frameId);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    resizeObserver?.disconnect();
  };

  const observeSection = () => {
    const section = document.getElementById(sectionId);
    if (!section || section === observedSection || typeof ResizeObserver === "undefined") return;
    resizeObserver?.disconnect();
    observedSection = section;
    resizeObserver = new ResizeObserver(() => {
      scrollToLabSection(sectionId, "auto");
    });
    resizeObserver.observe(section);
  };

  const align = () => {
    observeSection();
    scrollToLabSection(sectionId, attempts === 0 ? behavior : "auto");
    const heading = document.querySelector<HTMLElement>(`#${sectionId} h2`);
    const navigationBottom = document.querySelector<HTMLElement>(".lab-global-nav")?.getBoundingClientRect().bottom ?? 0;
    const aligned = heading && Math.abs(heading.getBoundingClientRect().top - navigationBottom - 12) <= 2;
    if (!aligned && attempts < 90) {
      attempts += 1;
      frameId = window.requestAnimationFrame(align);
    }
  };

  frameId = window.requestAnimationFrame(align);
  timeoutId = window.setTimeout(stop, 4000);
  return stop;
}

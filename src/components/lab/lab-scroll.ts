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
  const maxFrameAttempts = 24;
  const maxWaitMs = 2500;
  let frameId: number | null = null;
  let resizeFrameId: number | null = null;
  let timeoutId: number | null = null;
  let attempts = 0;
  let observedSection: HTMLElement | null = null;
  let observedBody = false;
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frameId !== null) window.cancelAnimationFrame(frameId);
    if (resizeFrameId !== null) window.cancelAnimationFrame(resizeFrameId);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    window.removeEventListener("pointerdown", stop);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
  };

  const scheduleResizeAlignment = () => {
    if (stopped || resizeFrameId !== null) return;
    resizeFrameId = window.requestAnimationFrame(() => {
      resizeFrameId = null;
      if (!stopped) align();
    });
  };

  const observeSection = () => {
    if (typeof ResizeObserver === "undefined") return;
    resizeObserver ??= new ResizeObserver(scheduleResizeAlignment);
    if (document.body && !observedBody) {
      resizeObserver.observe(document.body);
      observedBody = true;
    }
    const section = document.getElementById(sectionId);
    if (!section || section === observedSection) return;
    observedSection = section;
    resizeObserver.observe(section);
  };

  const observeDocument = () => {
    if (typeof MutationObserver === "undefined" || !document.body) return;
    mutationObserver = new MutationObserver(() => {
      if (stopped || !document.getElementById(sectionId)) return;
      observeSection();
      scheduleResizeAlignment();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  };

  const align = () => {
    if (stopped) return;
    observeSection();
    const found = scrollToLabSection(sectionId, attempts === 0 || behavior === "smooth" ? behavior : "auto");
    const section = document.getElementById(sectionId);
    const heading = section?.querySelector<HTMLElement>("h2") ?? section;
    const navigationBottom = document.querySelector<HTMLElement>(".lab-global-nav")?.getBoundingClientRect().bottom ?? 0;
    const aligned = Boolean(heading && Math.abs(heading.getBoundingClientRect().top - navigationBottom - 12) <= 2);
    if ((!found || !aligned) && attempts < maxFrameAttempts) {
      attempts += 1;
      frameId = window.requestAnimationFrame(align);
    } else if (found && aligned) {
      frameId = null;
      stop();
    } else {
      frameId = null;
    }
  };

  window.addEventListener("pointerdown", stop);
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  observeDocument();
  frameId = window.requestAnimationFrame(align);
  timeoutId = window.setTimeout(stop, maxWaitMs);
  return stop;
}

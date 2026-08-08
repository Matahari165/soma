"use client";

export function SkipLink() {
  function focusMainContent(event: React.MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById("main-page-content");
    if (!target) return;
    event.preventDefault();
    target.tabIndex = -1;
    requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "start" });
    });
  }

  return <a className="skip-link" href="#main-page-content" onClick={focusMainContent}>Skip to content</a>;
}

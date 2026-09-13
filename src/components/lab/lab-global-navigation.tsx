"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

import { scrollToLabSectionWhenReady } from "./lab-scroll";

export function LabGlobalNavigation() {
  const pathname = usePathname();
  function scroll(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/") return;
    event.preventDefault();
    window.history.pushState(null, "", event.currentTarget.hash);
    scrollToLabSectionWhenReady(event.currentTarget.hash.slice(1));
  }
  return <nav className="lab-global-nav" aria-label="Navigation principale">
    <Link href="/" onClick={(event) => { if (pathname !== "/") return; event.preventDefault(); window.history.replaceState(null, "", "/"); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }}>Personal Lab</Link>
    <Link href="/#world-effects" onClick={scroll}>Analyses</Link>
    <Link href="/meals" aria-current={pathname === "/meals" ? "page" : undefined}>Alimentation</Link>
    <Link href="/sleep" aria-current={pathname === "/sleep" ? "page" : undefined}>Sommeil</Link>
    <Link href="/recovery" aria-current={pathname === "/recovery" ? "page" : undefined}>Récupération</Link>
    <Link href="/activity" aria-current={pathname === "/activity" ? "page" : undefined}>Effort</Link>
    <Link className="lab-global-nav__settings" href="/settings" aria-current={pathname === "/settings" ? "page" : undefined}>Réglages</Link>
  </nav>;
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

export function LabGlobalNavigation() {
  const pathname = usePathname();
  const isPreHomeSurface = ["/login", "/onboarding", "/auth/", "/privacy", "/terms"].some((path) => pathname.startsWith(path));
  if (isPreHomeSurface) return null;

  // The seven secondary surfaces all trigger private data reads. Avoid
  // starting them in parallel just because their links are visible; navigation
  // still performs the normal full-quality route transition on demand.
  return <nav className="lab-global-nav" aria-label="Main navigation">
    <Link href="/" prefetch={false} aria-current={pathname === "/" ? "page" : undefined} onClick={(event: MouseEvent<HTMLAnchorElement>) => { if (pathname !== "/") return; event.preventDefault(); window.history.replaceState(null, "", "/"); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }}>Personal Lab</Link>
    <Link href="/assistant" prefetch={false} aria-current={pathname.startsWith("/assistant") ? "page" : undefined}>Soma</Link>
    <Link href="/analysis" prefetch={false} aria-current={pathname.startsWith("/analysis") ? "page" : undefined}>Analysis</Link>
    <Link href="/meals" prefetch={false} aria-current={pathname === "/meals" ? "page" : undefined}>Nutrition</Link>
    <Link href="/sleep" prefetch={false} aria-current={pathname === "/sleep" ? "page" : undefined}>Sleep</Link>
    <Link href="/recovery" prefetch={false} aria-current={pathname === "/recovery" ? "page" : undefined}>Recovery</Link>
    <Link href="/activity" prefetch={false} aria-current={pathname === "/activity" ? "page" : undefined}>Activity</Link>
    <Link className="lab-global-nav__settings" href="/settings" prefetch={false} aria-current={pathname === "/settings" ? "page" : undefined}>Settings</Link>
  </nav>;
}

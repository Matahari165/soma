"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function LabGlobalNavigation() {
  const pathname = usePathname();
  const isPreHomeSurface = ["/login", "/onboarding", "/auth/", "/privacy", "/terms"].some((path) => pathname.startsWith(path));
  if (isPreHomeSurface) return null;

  // The seven secondary surfaces all trigger private data reads. Avoid
  // starting them in parallel just because their links are visible; navigation
  // still performs the normal full-quality route transition on demand.
  return <nav className="lab-global-nav" aria-label="Navigation principale">
    <Link href="/" prefetch={false} aria-current={pathname === "/" ? "page" : undefined} onClick={(event) => { if (pathname !== "/") return; event.preventDefault(); window.history.replaceState(null, "", "/"); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }}>Laboratoire personnel</Link>
    <Link href="/meals" prefetch={false} aria-current={pathname === "/meals" ? "page" : undefined}>Alimentation</Link>
    <Link href="/sleep" prefetch={false} aria-current={pathname === "/sleep" ? "page" : undefined}>Sommeil</Link>
    <Link href="/recovery" prefetch={false} aria-current={pathname === "/recovery" ? "page" : undefined}>Récupération</Link>
    <Link href="/activity" prefetch={false} aria-current={pathname === "/activity" ? "page" : undefined}>Effort</Link>
    <Link className="lab-global-nav__settings" href="/settings" prefetch={false} aria-current={pathname === "/settings" ? "page" : undefined}>Réglages</Link>
  </nav>;
}

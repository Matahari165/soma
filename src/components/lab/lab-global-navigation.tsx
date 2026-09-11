"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

export function LabGlobalNavigation() {
  const pathname = usePathname();
  function scroll(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/") return;
    const target = document.getElementById(event.currentTarget.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    window.history.pushState(null, "", event.currentTarget.hash);
    target.scrollIntoView({ block: "start", inline: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return <nav className="lab-global-nav" aria-label="Navigation principale">
    <Link href="/#arrival-title" onClick={scroll}>Personal Lab</Link>
    <Link href="/#daily-journal" onClick={scroll}>Journal</Link>
    <Link href="/#meal-journal-title" onClick={scroll}>Repas</Link>
    <Link href="/#world-effects" onClick={scroll}>Strongest Effects</Link>
    <Link href="/meals" aria-current={pathname === "/meals" ? "page" : undefined}>Historique repas</Link>
    <Link href="/sleep" aria-current={pathname === "/sleep" ? "page" : undefined}>Sommeil</Link>
    <Link href="/recovery" aria-current={pathname === "/recovery" ? "page" : undefined}>Récupération</Link>
    <Link href="/activity" aria-current={pathname === "/activity" ? "page" : undefined}>Effort</Link>
    <Link href="/settings" aria-current={pathname === "/settings" ? "page" : undefined}>Réglages</Link>
  </nav>;
}

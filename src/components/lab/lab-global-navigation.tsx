"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type MouseEvent } from "react";
import { Activity, ChartNoAxesCombined, HeartPulse, House, MessageCircle, Moon, Settings, Utensils } from "lucide-react";

export function LabGlobalNavigation() {
  const pathname = usePathname();
  const isPreHomeSurface = ["/login", "/onboarding", "/auth/", "/privacy", "/terms"].some((path) => pathname.startsWith(path));
  if (isPreHomeSurface) return null;

  // The seven secondary surfaces all trigger private data reads. Avoid
  // starting them in parallel just because their links are visible; navigation
  // still performs the normal full-quality route transition on demand.
  return <nav className="lab-global-nav" aria-label="Main navigation">
    <Link href="/" prefetch={false} aria-current={pathname === "/" ? "page" : undefined} onClick={(event: MouseEvent<HTMLAnchorElement>) => { if (pathname !== "/") return; event.preventDefault(); window.history.replaceState(null, "", "/"); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }}><House aria-hidden="true" /><span>Personal Lab</span></Link>
    <Link href="/assistant" prefetch={false} aria-current={pathname.startsWith("/assistant") ? "page" : undefined}><MessageCircle aria-hidden="true" /><span>Soma</span></Link>
    <Link href="/analysis" prefetch={false} aria-current={pathname.startsWith("/analysis") ? "page" : undefined}><ChartNoAxesCombined aria-hidden="true" /><span>Analysis</span></Link>
    <Link href="/meals" prefetch={false} aria-current={pathname === "/meals" ? "page" : undefined}><Utensils aria-hidden="true" /><span>Nutrition</span></Link>
    <Link href="/sleep" prefetch={false} aria-current={pathname === "/sleep" ? "page" : undefined}><Moon aria-hidden="true" /><span>Sleep</span></Link>
    <Link href="/recovery" prefetch={false} aria-current={pathname === "/recovery" ? "page" : undefined}><HeartPulse aria-hidden="true" /><span>Recovery</span></Link>
    <Link href="/activity" prefetch={false} aria-current={pathname === "/activity" ? "page" : undefined}><Activity aria-hidden="true" /><span>Activity</span></Link>
    <Link className="lab-global-nav__settings" href="/settings" prefetch={false} aria-current={pathname === "/settings" ? "page" : undefined}><Settings aria-hidden="true" /><span>Settings</span></Link>
  </nav>;
}

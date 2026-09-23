"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { MouseEvent } from "react";

const sections = [
  { href: "/", label: "Personal Lab" },
  { href: "/assistant", label: "Soma" },
  { href: "/analysis", label: "Analysis" },
  { href: "/meals", label: "Nutrition" },
  { href: "/sleep", label: "Sleep" },
  { href: "/recovery", label: "Recovery" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
] as const;

export function LabGlobalNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const isPreHomeSurface = ["/login", "/onboarding", "/auth/", "/privacy", "/terms"].some((path) => pathname.startsWith(path));
  if (isPreHomeSurface) return null;
  const activeSection = sections.find(({ href }) => href === "/" ? pathname === "/" : pathname.startsWith(href))?.href ?? "/";

  // The seven secondary surfaces all trigger private data reads. Avoid
  // starting them in parallel just because their links are visible; navigation
  // still performs the normal full-quality route transition on demand.
  return <nav className="lab-global-nav" aria-label="Main navigation">
    {sections.map(({ href, label }) => <Link
      key={href}
      className={href === "/settings" ? "lab-global-nav__settings" : undefined}
      href={href}
      prefetch={false}
      aria-current={activeSection === href ? "page" : undefined}
      onClick={href === "/" ? (event: MouseEvent<HTMLAnchorElement>) => { if (pathname !== "/") return; event.preventDefault(); window.history.replaceState(null, "", "/"); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); } : undefined}
    >{label}</Link>)}
    <div className="lab-global-nav__mobile-select">
      <label className="sr-only" htmlFor="lab-section-select">Choisir une section</label>
      <select id="lab-section-select" value={activeSection} onChange={(event) => router.push(event.target.value)}>
        {sections.map(({ href, label }) => <option key={href} value={href}>{label}</option>)}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </div>
  </nav>;
}

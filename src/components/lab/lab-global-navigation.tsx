"use client";
import Link from "next/link";
import { useMotionPresence } from "@/components/motion/use-motion-presence";
import { usePathname } from "next/navigation";
import { type MouseEvent, useEffect, useId, useRef, useState } from "react";
import { Activity, Ellipsis, FlaskConical, HeartPulse, House, MessageCircle, Moon, Settings, Utensils } from "lucide-react";

import { ThemeToggle } from "./theme-toggle";
import themeStyles from "./theme-toggle.module.css";

const destinations = [
  { href: "/", label: "Personal Lab", mobileLabel: "Lab", icon: House },
  { href: "/assistant", label: "Soma", icon: MessageCircle },
  { href: "/analysis", label: "Analysis", icon: FlaskConical },
  { href: "/meals", label: "Nutrition", icon: Utensils },
  { href: "/sleep", label: "Sleep", icon: Moon },
  { href: "/recovery", label: "Recovery", icon: HeartPulse },
  { href: "/strain", label: "Strain", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isCurrentPage(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function MobileMoreNavigation({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const present = useMotionPresence(open);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const currentPage = destinations.slice(4).find(({ href }) => isCurrentPage(pathname, href));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    const mobile = window.matchMedia("(max-width: 700px)");
    const closeOnDesktop = () => { if (!mobile.matches) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    mobile.addEventListener("change", closeOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
      mobile.removeEventListener("change", closeOnDesktop);
    };
  }, [open]);

  return <div ref={rootRef} className="lab-global-nav__more-slot" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={buttonRef} type="button" className="lab-global-nav__more-button" aria-expanded={open} aria-controls={panelId} aria-label={currentPage ? `Plus de pages, page actuelle : ${currentPage.label}` : "Plus de pages"} data-active={Boolean(currentPage)} onClick={() => setOpen((value) => !value)}>
      <Ellipsis aria-hidden="true" /><span>Plus</span>
    </button>
    <div id={panelId} className="lab-global-nav__more-panel" role="group" aria-label="Autres pages" hidden={!present} data-motion-open={open} inert={!open} aria-hidden={!open}>
      {destinations.slice(4).map(({ href, label, icon: Icon }) => {
        const link = <Link key={href} href={href} prefetch={false} aria-current={isCurrentPage(pathname, href) ? "page" : undefined} onClick={() => setOpen(false)}><Icon aria-hidden="true" /><span>{label}</span></Link>;
        return href === "/settings" ? <div key={href} className={themeStyles.mobileSettingsSlot}><ThemeToggle mobile />{link}</div> : link;
      })}
    </div>
  </div>;
}

export function LabGlobalNavigation() {
  const pathname = usePathname();
  const navigationRef = useRef<HTMLElement>(null);
  const isPreHomeSurface = ["/login", "/onboarding", "/auth/", "/privacy", "/terms"].some((path) => pathname.startsWith(path));
  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    const mobile = window.matchMedia("(max-width: 700px)");
    const updateHeight = () => {
      if (mobile.matches) document.documentElement.style.setProperty("--soma-mobile-nav-height", `${Math.ceil(navigation.getBoundingClientRect().height)}px`);
      else document.documentElement.style.removeProperty("--soma-mobile-nav-height");
    };
    const observer = new ResizeObserver(updateHeight);
    observer.observe(navigation);
    mobile.addEventListener("change", updateHeight);
    updateHeight();
    return () => {
      observer.disconnect();
      mobile.removeEventListener("change", updateHeight);
      document.documentElement.style.removeProperty("--soma-mobile-nav-height");
    };
  }, [isPreHomeSurface]);
  if (isPreHomeSurface) return null;

  // The seven secondary surfaces all trigger private data reads. Avoid
  // starting them in parallel just because their links are visible; navigation
  // still performs the normal full-quality route transition on demand.
  return <nav ref={navigationRef} className="lab-global-nav" aria-label="Main navigation">
    {destinations.filter(({ href }) => href !== "/settings").map(({ href, label, mobileLabel, icon: Icon }, index) => <Link key={href} href={href} prefetch={false} className={index >= 4 ? "lab-global-nav__secondary" : undefined} aria-label={label} aria-current={isCurrentPage(pathname, href) ? "page" : undefined} onClick={href === "/" ? (event: MouseEvent<HTMLAnchorElement>) => { if (pathname !== "/") return; event.preventDefault(); window.history.replaceState(null, "", "/"); window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); } : undefined}><Icon aria-hidden="true" /><span className={mobileLabel ? "lab-global-nav__desktop-label" : undefined}>{label}</span>{mobileLabel && <span className="lab-global-nav__mobile-label">{mobileLabel}</span>}</Link>)}
    <div className={themeStyles.desktopSlot}><ThemeToggle /><Link href="/settings" prefetch={false} className="lab-global-nav__settings" aria-current={isCurrentPage(pathname, "/settings") ? "page" : undefined}><Settings aria-hidden="true" /><span>Settings</span></Link></div>
    <MobileMoreNavigation key={pathname} pathname={pathname} />
  </nav>;
}
